import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

describe('Phase 2: Razorpay Webhooks & WhatsApp Confirmation Suite', () => {
  let confirmedBookingCode: string
  let failedBookingCode: string
  let initialRoomAvailableUnits: number
  let roomTypeId: string

  beforeAll(async () => {
    db.initializeInMemorySeed()

    // Create Booking 1 (for successful payment confirmation)
    const holdRes1 = await request(app)
      .post('/api/bookings/initiate')
      .send({
        propertySlug: 'hotel-quadis-sector-51-noida',
        roomTypeSlug: 'deluxe-room',
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        roomsCount: 1,
        guestsCount: 2,
        guestName: 'Ananya Verma',
        guestPhone: '9811223344',
      })
    confirmedBookingCode = holdRes1.body.data.booking_code
    roomTypeId = holdRes1.body.data.room_type_id

    // Availability for Booking 2's dates, before it is held.
    initialRoomAvailableUnits = await db.getAvailableUnits(roomTypeId, '2026-12-05', '2026-12-07')

    // Create Booking 2 (for payment failure verification) with 2 rooms
    const holdRes2 = await request(app)
      .post('/api/bookings/initiate')
      .send({
        propertySlug: 'hotel-quadis-sector-51-noida',
        roomTypeSlug: 'deluxe-room',
        checkIn: '2026-12-05',
        checkOut: '2026-12-07',
        roomsCount: 2,
        guestsCount: 4,
        guestName: 'Vikram Singh',
        guestPhone: '9988776655',
      })
    failedBookingCode = holdRes2.body.data.booking_code
  })

  test('POST /api/webhooks/razorpay (order.paid) confirms booking and logs WhatsApp confirmation receipt', async () => {
    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-simulated-webhook', 'true')
      .send({
        event: 'order.paid',
        payload: {
          payment: {
            entity: {
              id: 'pay_sim_success_9988',
              order_id: 'order_sim_12345',
              notes: {
                bookingCode: confirmedBookingCode,
              },
            },
          },
        },
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Verify database record status
    const booking = await db.getBookingByCode(confirmedBookingCode)
    expect(booking?.booking_status).toBe('CONFIRMED')
    expect(booking?.payment_status).toBe('PAID')
    expect(booking?.razorpay_payment_id).toBe('pay_sim_success_9988')
  })

  test('POST /api/webhooks/razorpay (payment.failed) cancels booking and IMMEDIATELY releases held inventory', async () => {
    // Booking 2 holds 2 rooms across its own nights only.
    expect(await db.getAvailableUnits(roomTypeId, '2026-12-05', '2026-12-07')).toBe(initialRoomAvailableUnits - 2)

    // Send failure webhook
    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-simulated-webhook', 'true')
      .send({
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_sim_failed_1122',
              notes: {
                bookingCode: failedBookingCode,
              },
            },
          },
        },
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const booking = await db.getBookingByCode(failedBookingCode)
    expect(booking?.booking_status).toBe('CANCELLED')
    expect(booking?.payment_status).toBe('FAILED')

    // Verify those nights were released back!
    expect(await db.getAvailableUnits(roomTypeId, '2026-12-05', '2026-12-07')).toBe(initialRoomAvailableUnits)
  })

  // Razorpay retries webhooks on timeout, so every handler has to survive a replay.
  describe('idempotency', () => {
    const paidWebhook = (bookingCode: string) => ({
      event: 'order.paid',
      payload: { payment: { entity: { id: 'pay_sim_success_9988', notes: { bookingCode } } } },
    })

    test('a replayed order.paid does not re-confirm or re-notify', async () => {
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-simulated-webhook', 'true')
        .send(paidWebhook(confirmedBookingCode))

      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/duplicate/i)

      const booking = await db.getBookingByCode(confirmedBookingCode)
      expect(booking?.booking_status).toBe('CONFIRMED')
    })

    test('a replayed payment.failed does not release the same rooms twice', async () => {
      const unitsBefore = await db.getAvailableUnits(roomTypeId, '2026-12-05', '2026-12-07')

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-simulated-webhook', 'true')
        .send({
          event: 'payment.failed',
          payload: { payment: { entity: { id: 'pay_sim_failed_1122', notes: { bookingCode: failedBookingCode } } } },
        })

      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/duplicate/i)

      const unitsAfter = await db.getAvailableUnits(roomTypeId, '2026-12-05', '2026-12-07')
      expect(unitsAfter).toBe(unitsBefore)
    })

    test('a late capture on a released booking is refused, not oversold', async () => {
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-simulated-webhook', 'true')
        .send(paidWebhook(failedBookingCode))

      // The rooms went back to inventory and may already be resold.
      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)

      const booking = await db.getBookingByCode(failedBookingCode)
      expect(booking?.booking_status).toBe('CANCELLED')
      expect(booking?.payment_status).toBe('PAID') // recorded for refund
    })
  })
})
