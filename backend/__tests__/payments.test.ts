import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

describe('Phase 2: Razorpay Payments Engine & Link Generation Tests', () => {
  let activeBookingCode: string

  beforeAll(async () => {
    db.initializeInMemorySeed()
    // Create a fresh hold for testing checkout
    const holdRes = await request(app)
      .post('/api/bookings/initiate')
      .send({
        propertySlug: 'hotel-quadis-sector-51-noida',
        roomTypeSlug: 'deluxe-room',
        checkIn: '2026-11-20',
        checkOut: '2026-11-22',
        roomsCount: 1,
        guestsCount: 2,
        guestName: 'Rajesh Sharma',
        guestPhone: '9876543210',
        guestEmail: 'rajesh@example.com',
        companyName: 'Infosys Ltd',
        gstin: '09AAACI1234E1Z5',
      })
    activeBookingCode = holdRes.body.data.booking_code
  })

  test('POST /api/payments/create-order generates Razorpay checkout order for active soft hold', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .send({ bookingCode: activeBookingCode })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('orderId')
    expect(res.body.data.currency).toBe('INR')
    expect(typeof res.body.data.amount).toBe('number')
    expect(res.body.data.isSimulated).toBe(true)

    // Verify booking now holds the orderId
    const booking = await db.getBookingByCode(activeBookingCode)
    expect(booking?.razorpay_order_id).toBe(res.body.data.orderId)
  })

  test('POST /api/payments/create-order returns 404 for non-existent booking code', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .send({ bookingCode: 'QD-FAKE99' })

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  test('POST /api/payments/payment-link generates instant payment link for inquiry/walk-in', async () => {
    const res = await request(app)
      .post('/api/payments/payment-link')
      .send({ bookingCode: activeBookingCode })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('paymentLinkId')
    expect(res.body.data).toHaveProperty('shortUrl')

    const booking = await db.getBookingByCode(activeBookingCode)
    expect(booking?.razorpay_payment_link_id).toBe(res.body.data.paymentLinkId)
  })
})
