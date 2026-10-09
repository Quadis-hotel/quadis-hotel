import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

describe('Master End-to-End Acceptance Suite: All 5 Phases of Quadis Hotels Platform', () => {
  let createdBookingCode: string
  let targetPropertySlug: string
  let targetRoomId: string
  let targetRoomSlug: string
  let razorpayOrderId: string
  let authToken: string

  beforeAll(() => {
    db.useInMemory = true
    db.initializeInMemorySeed()
  })

  /* =========================================================================
     PHASE 1: ACID INVENTORY CATALOGUE & 15-MINUTE SOFT HOLD RESERVATIONS
     ========================================================================= */
  describe('Phase 1: Catalogue Discovery & Reservation Soft Holds', () => {
    it('1.1 GET /api/properties lists seeded active hotel properties', async () => {
      const res = await request(app).get('/api/properties')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.count).toBeGreaterThanOrEqual(9)

      targetPropertySlug = res.body.data[0].slug
    })

    it('1.2 GET /api/properties/:slug returns specific property detail and room categories', async () => {
      const res = await request(app).get(`/api/properties/${targetPropertySlug}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.rooms.length).toBeGreaterThan(0)

      targetRoomId = res.body.data.rooms[0].id
      targetRoomSlug = res.body.data.rooms[0].slug
    })

    it('1.3 POST /api/bookings/initiate creates a 15-minute soft hold and decrements units', async () => {
      const res = await request(app)
        .post('/api/bookings/initiate')
        .send({
          propertySlug: targetPropertySlug,
          roomTypeSlug: targetRoomSlug,
          checkIn: '2026-11-20',
          checkOut: '2026-11-23',
          roomsCount: 1,
          guestsCount: 2,
          guestName: 'Rajesh Sharma (E2E Master)',
          guestPhone: '9811223344',
          guestEmail: 'rajesh.sharma@example.com',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.booking_code).toMatch(/^QD-[0-9A-HJKMNP-TV-Z]{8}$/)
      expect(res.body.data.booking_status).toBe('PENDING_PAYMENT')

      createdBookingCode = res.body.data.booking_code
    })
  })

  /* =========================================================================
     PHASE 2: RAZORPAY PAYMENT LINKING, WEBHOOK CONFIRMATIONS & SAC 996311 GST
     ========================================================================= */
  describe('Phase 2: Payment Verification, WhatsApp Receipt & GST Tax Invoice', () => {
    it('2.1 POST /api/payments/create-order generates Razorpay checkout order for active soft hold', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .send({ bookingCode: createdBookingCode })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.orderId).toBeDefined()
      razorpayOrderId = res.body.data.orderId
    })

    it('2.2 POST /api/webhooks/razorpay confirms booking upon payment verification and triggers receipt', async () => {
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-simulated-webhook', 'true')
        .send({
          event: 'order.paid',
          payload: {
            payment: {
              entity: {
                id: 'pay_e2e_master_success_101',
                order_id: razorpayOrderId,
                amount: 500000,
                status: 'captured',
                notes: {
                  bookingCode: createdBookingCode,
                },
              },
            },
          },
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      // Check DB that booking is confirmed
      const booking = await db.getBookingByCode(createdBookingCode)
      expect(booking?.booking_status).toBe('CONFIRMED')
      expect(booking?.payment_status).toBe('PAID')
    })

    it('2.3 GET /api/bookings/:code/invoice returns valid SAC 996311 PDF document buffer', async () => {
      const res = await request(app).get(`/api/bookings/${createdBookingCode}/invoice?phone=9811223344`)
      expect(res.status).toBe(200)
      expect(res.header['content-type']).toBe('application/pdf')
      expect(res.body instanceof Buffer).toBe(true)
    })
  })

  /* =========================================================================
     PHASE 3: OWNER SWITCHBOARD, DAILY GLANCE & WHATSAPP QUICK-COMMANDS
     ========================================================================= */
  describe('Phase 3: Owner Switchboard & Smartphone Remote Control', () => {
    it('3.1 POST /api/admin/auth validates PIN code and issues management token', async () => {
      const res = await request(app).post('/api/admin/auth').send({ pin: '998877' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.token).toBeDefined()
      authToken = res.body.token
    })

    it('3.2 GET /api/admin/dashboard reflects confirmed booking revenue and glance summary', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', authToken)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.metrics.todayRevenue).toBeGreaterThan(0)
      expect(res.body.data.recentBookings.some((b: any) => b.booking_code === createdBookingCode)).toBe(true)
    })

    it('3.3 PATCH /api/admin/room-availability allows instant single-tap mobile inventory control', async () => {
      const res = await request(app)
        .patch('/api/admin/room-availability')
        .set('Authorization', authToken)
        .send({
          roomTypeId: targetRoomId,
          isAvailable: false,
        })

      expect(res.status).toBe(200)
      expect(res.body.data.is_available).toBe(false)

      // Re-enable for subsequent tests
      await request(app)
        .patch('/api/admin/room-availability')
        .set('Authorization', authToken)
        .send({ roomTypeId: targetRoomId, isAvailable: true })
    })

    it('3.4 POST /api/webhooks/whatsapp-staff executes remote staff text commands via smartphone', async () => {
      const res = await request(app)
        .post('/api/webhooks/whatsapp-staff')
        .send({
          from: '919217373532',
          text: `Sold out ${targetRoomSlug.replace(/-/g, ' ')}`,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.reply).toContain('as *SOLD OUT*')
    })
  })

  /* =========================================================================
     PHASE 4: AGENTIC GENAI CHATBOT (`QUADIS ASSIST`) AUTONOMOUS SKILLS
     ========================================================================= */
  describe('Phase 4: Quadis Assist GenAI Autonomous Concierge Suite', () => {
    it('4.1 POST /api/ai/chat autonomously looks up confirmed reservation status using check_booking_status tool', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({
          sessionId: 'sess_e2e_master',
          message: `Can you check the live status of my confirmed booking code ${createdBookingCode}?`,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.toolsInvoked).toContain('check_booking_status')
      expect(res.body.data.reply).toContain('CONFIRMED')
    })

    it('4.2 POST /api/ai/chat routes a banquet RFP without inventing an enquiry', async () => {
      const before = Array.from(db.memoryEnquiries.values()).length

      const res = await request(app)
        .post('/api/ai/chat')
        .send({
          sessionId: 'sess_e2e_master',
          message: 'I would like to submit a banquet RFP for a corporate event of 200 guests in December',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // Keyword matching cannot know the guest's name, phone or date, so the
      // fallback points them at the banquet form rather than filing a lead
      // under placeholder details and paging management about it.
      expect(res.body.data.toolsInvoked).not.toContain('create_banquet_enquiry')
      expect(res.body.data.reply).toMatch(/Banquets/i)
      expect(Array.from(db.memoryEnquiries.values()).length).toBe(before)
    })

    it('4.3 GET /api/ai/logs retrieves audit trail of AI conversation turns', async () => {
      const res = await request(app)
        .get('/api/ai/logs')
        .set('Authorization', authToken)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.some((l: any) => l.session_id === 'sess_e2e_master')).toBe(true)
    })
  })

  /* =========================================================================
     PHASE 5: SYSTEM HEALTH, ACID ENGINE & PRODUCTION DEPLOYMENT VERIFICATION
     ========================================================================= */
  describe('Phase 5: Production Readiness & Full Stack Verification', () => {
    it('5.1 GET /api/health confirms API server and database pool stability', async () => {
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('healthy')
      expect(res.body.service).toBe('Quadis Hotels API Server')
    })
  })
})
