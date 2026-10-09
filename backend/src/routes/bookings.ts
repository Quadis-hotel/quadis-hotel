import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../db'
import { verifySession } from '../lib/auth'
import { invoiceService } from '../services/InvoiceService'

export const bookingsRouter = Router()

const initiateBookingSchema = z.object({
  propertySlug: z.string().trim().min(1, 'Property slug is required'),
  roomTypeSlug: z.string().trim().min(1, 'Room category slug is required'),
  checkIn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-in must be YYYY-MM-DD format'),
  checkOut: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-out must be YYYY-MM-DD format'),
  roomsCount: z.number().int().min(1, 'At least 1 room required').max(20, 'Maximum 20 rooms per booking'),
  guestsCount: z.number().int().min(1, 'At least 1 guest required').max(80, 'Maximum 80 guests per booking'),
  // Optional so the AI concierge and any older client keep working on
  // guestsCount alone; when present, this is what prices the extra bed.
  adultsCount: z.number().int().min(1, 'At least 1 adult required').max(80).optional(),
  childAges: z
    .array(z.number().int().min(0, 'Age cannot be negative').max(17, 'Guests 18 and over are adults'))
    .max(20, 'Maximum 20 children per booking')
    .optional(),
  guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters'),
  guestPhone: z.string().trim().min(10, 'Valid 10-digit mobile number required'),
  guestEmail: z.string().trim().email('Invalid email address').optional(),
  companyName: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  mealPlan: z.enum(['Room Only', 'With Breakfast', 'All Meals Included']).optional(),
}).refine(
  (data) => new Date(data.checkOut).getTime() > new Date(data.checkIn).getTime(),
  { message: 'Check-out date must be strictly after check-in date', path: ['checkOut'] }
).refine(
  (data) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return new Date(data.checkIn).getTime() >= today.getTime()
  },
  { message: 'Check-in date cannot be in the past', path: ['checkIn'] }
).refine(
  // If the client sends a split, it has to agree with the headcount it also
  // sent — otherwise "3 guests" could be priced as 2 adults and quietly skip
  // the extra-bed charge.
  (data) => {
    if (data.adultsCount === undefined && data.childAges === undefined) return true
    const adults = data.adultsCount ?? 0
    const children = data.childAges?.length ?? 0
    return adults + children === data.guestsCount
  },
  { message: 'Adults plus children must equal the total number of guests', path: ['guestsCount'] }
)

// POST /api/bookings/initiate - create 15-minute soft hold
bookingsRouter.post('/initiate', async (req: Request, res: Response) => {
  try {
    const validation = initiateBookingSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: validation.error.flatten().fieldErrors,
      })
    }

    const payload = validation.data

    // Optional: if the guest is signed in, tie the stay to their account so it
    // shows under "My bookings". Anonymous checkout stays supported.
    const header = req.headers.authorization
    const session = header?.startsWith('Bearer ') ? verifySession(header.slice('Bearer '.length)) : null

    const result = await db.initiateBookingHold({ ...payload, userId: session?.sub })
    if (!result.success || !result.booking) {
      return res.status(400).json({ success: false, error: result.error || 'Failed to initiate booking hold' })
    }

    res.status(201).json({
      success: true,
      message: 'Booking soft hold created successfully for 15 minutes. Complete payment to confirm.',
      data: result.booking,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Internal server error during booking initiation' })
  }
})

// GET /api/bookings/:code - lookup booking status
bookingsRouter.get('/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params
    const phone = req.query.phone as string | undefined
    const booking = await db.getBookingByCode(code, phone)
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found or phone number mismatch' })
    }
    res.json({ success: true, data: booking })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to lookup booking' })
  }
})

// GET /api/bookings/:code/invoice - download SAC 996311 GST Tax Invoice PDF
//
// Booking codes are short and guessable, and the invoice carries the guest's
// name, address, phone and GSTIN. The caller must prove they own the booking:
// either the phone on the record, or a session whose user placed it. An admin
// token also passes, for support.
bookingsRouter.get('/:code/invoice', async (req: Request, res: Response) => {
  try {
    const { code } = req.params
    const booking = await db.getBookingByCode(code)
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' })
    }

    const header = req.headers.authorization
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
    const session = bearer ? verifySession(bearer) : null

    const phone = (req.query.phone as string | undefined)?.replace(/\D/g, '')
    const bookingPhone = String((booking as any).guest_phone ?? '').replace(/\D/g, '')
    const bookingUserId = (booking as any).user_id

    const adminPassword = process.env.ADMIN_PASSWORD
    const isAdmin = !!adminPassword && !!bearer && bearer === adminPassword

    const ownsByPhone = !!phone && phone.length >= 10 && phone === bookingPhone
    const ownsBySession = !!session?.sub && !!bookingUserId && session.sub === bookingUserId

    if (!ownsByPhone && !ownsBySession && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Provide the phone number on the booking, or sign in, to download this invoice',
      })
    }

    const prop = await db.getPropertyById(booking.property_id)
    const room = await db.getRoomTypeById(booking.room_type_id)

    const pdfBuffer = await invoiceService.generateGstInvoicePdf(booking, prop, room)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Quadis-Invoice-${booking.booking_code}.pdf"`)
    res.send(pdfBuffer)
  } catch (err: any) {
    console.error('Error generating PDF invoice:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to generate invoice PDF' })
  }
})

