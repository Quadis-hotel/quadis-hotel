import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

describe('Phase 4: Agentic GenAI Chatbot (`Quadis Assist`) Suite', () => {
  const testSessionId = 'sess_test_ai_1001'

  beforeAll(() => {
    db.useInMemory = true
    db.initializeInMemorySeed()
  })

  it('POST /api/ai/chat responds to general inquiry and invokes search_hotels tool', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: testSessionId,
        message: 'Are there any available rooms in Noida Sector 51?',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.reply).toBeDefined()
    expect(res.body.data.toolsInvoked).toContain('search_hotels')
  })

  // The two tests below used to assert the opposite: that a keyword match was
  // enough for the chatbot to place a real inventory hold and file a real
  // banquet lead. The fallback engine cannot read the conversation, so every
  // such record was invented — "Chatbot Guest" on hardcoded November dates,
  // and "Valued Guest" on 9876543210 for 150 people — and each one paged
  // management on WhatsApp. They now assert that no write happens.

  it('POST /api/ai/chat does NOT place a booking hold off a keyword match', async () => {
    const before = Array.from(db.memoryBookings.values()).length

    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: testSessionId,
        message: 'Please hold a Deluxe room for me at Sector 51 for tomorrow',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.toolsInvoked).not.toContain('initiate_soft_hold')
    // Routes the guest instead of guessing dates on their behalf.
    expect(res.body.data.reply).toMatch(/Check availability/i)

    const after = Array.from(db.memoryBookings.values())
    expect(after.length).toBe(before)
    expect(after.find((b) => b.guest_name === 'Chatbot Guest')).toBeUndefined()
  })

  it('POST /api/ai/chat does NOT file a banquet enquiry off a keyword match', async () => {
    const before = Array.from(db.memoryEnquiries.values()).length

    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: testSessionId,
        message: 'I want to submit a banquet RFP for a corporate conference of 150 guests on 25th Dec',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.toolsInvoked).not.toContain('create_banquet_enquiry')
    expect(res.body.data.reply).toMatch(/Banquets/i)

    const after = Array.from(db.memoryEnquiries.values())
    expect(after.length).toBe(before)
    expect(after.find((e) => e.guest_phone === '9876543210')).toBeUndefined()
  })

  it('POST /api/ai/chat answers a greeting without dumping the property list', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({ sessionId: testSessionId, message: 'hi' })

    expect(res.status).toBe(200)
    expect(res.body.data.toolsInvoked).toEqual([])
    // Used to answer "hi" with three hotels, addresses and every room rate.
    expect(res.body.data.reply.length).toBeLessThan(300)
    expect(res.body.data.reply).not.toMatch(/₹/)
  })

  it('POST /api/ai/chat checks real-time booking status via check_booking_status tool', async () => {
    // Created through the real booking path. This used to lean on the hold that
    // the chatbot test above fabricated, so removing that write broke it.
    const held = await db.initiateBookingHold({
      propertySlug: 'hotel-quadis-sector-51-noida',
      roomTypeSlug: 'deluxe-room',
      checkIn: '2026-12-01',
      checkOut: '2026-12-03',
      roomsCount: 1,
      guestsCount: 2,
      guestName: 'Status Test Guest',
      guestPhone: '9812345678',
    })
    expect(held.success).toBe(true)
    const targetBooking = held.booking!

    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: testSessionId,
        message: `What is the status of my booking ${targetBooking.booking_code}?`,
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.toolsInvoked).toContain('check_booking_status')
    expect(res.body.data.reply).toContain(targetBooking.booking_code)
  })

  it('POST /api/ai/chat triggers human handoff alert when guest requests manager', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: testSessionId,
        message: 'Please trigger human handoff and connect me with the hotel manager right now',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.toolsInvoked).toContain('human_handoff')
    expect(res.body.data.handoffTriggered).toBe(true)
    expect(res.body.data.reply).toContain('A hotel manager has been alerted on WhatsApp')
  })

  it('GET /api/ai/logs returns complete audit trail of AI conversation turns', async () => {
    const res = await request(app).get('/api/ai/logs')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.count).toBeGreaterThanOrEqual(5)
    expect(res.body.data[0].session_id).toBe(testSessionId)
  })
})
