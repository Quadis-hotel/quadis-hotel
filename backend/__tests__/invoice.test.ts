import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

describe('Phase 2: SAC 996311 PDF GST Tax Invoice Suite', () => {
  let bookingCode: string

  beforeAll(async () => {
    db.initializeInMemorySeed()

    const holdRes = await request(app)
      .post('/api/bookings/initiate')
      .send({
        propertySlug: 'hotel-quadis-sector-51-noida',
        roomTypeSlug: 'deluxe-room',
        checkIn: '2026-12-10',
        checkOut: '2026-12-12',
        roomsCount: 1,
        guestsCount: 2,
        guestName: 'Divyansh Rawat',
        guestPhone: '9876543210',
        guestEmail: 'divyansh@example.com',
        companyName: 'Quadis Tech',
        gstin: '09AAACQ1234F1Z9',
      })
    bookingCode = holdRes.body.data.booking_code
  })

  test('GET /api/bookings/:code/invoice returns valid SAC 996311 PDF document buffer', async () => {
    const res = await request(app).get(`/api/bookings/${bookingCode}/invoice?phone=9876543210`)

    expect(res.status).toBe(200)
    expect(res.header['content-type']).toContain('application/pdf')
    expect(res.header['content-disposition']).toContain(`Quadis-Invoice-${bookingCode}.pdf`)

    // Check PDF magic bytes (%PDF)
    const buffer = Buffer.from(res.body)
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF')
  })

  test('GET /api/bookings/:code/invoice returns 404 for invalid booking code', async () => {
    const res = await request(app).get('/api/bookings/QD-NOTFOUND/invoice?phone=9876543210')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  test('GET /api/bookings/:code/invoice refuses a caller who cannot prove they own the booking', async () => {
    const anonymous = await request(app).get(`/api/bookings/${bookingCode}/invoice`)
    expect(anonymous.status).toBe(403)

    const wrongPhone = await request(app).get(`/api/bookings/${bookingCode}/invoice?phone=9000000000`)
    expect(wrongPhone.status).toBe(403)
  })
})
