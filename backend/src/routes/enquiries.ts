import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../db'
import { requireAdmin } from '../middleware/auth'
import { notificationService } from '../services/NotificationService'

export const enquiriesRouter = Router()

const createEnquirySchema = z.object({
  enquiryType: z.enum(['ROOM_HOLD', 'BANQUET', 'CORPORATE_RFP', 'GENERAL']),
  propertySlug: z.string().optional(),
  propertyId: z.string().optional(),
  guestName: z.string().trim().min(1, 'Guest name is required'),
  guestPhone: z.string().trim().min(10, 'Valid 10-digit phone number is required'),
  guestEmail: z.string().email('Valid email is required').optional().or(z.literal('')),
  eventDate: z.string().optional(),
  guestCount: z.union([z.number(), z.string()]).optional().transform((v) => (v ? Number(v) : undefined)),
  message: z.string().optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'LINK_SENT', 'CONVERTED', 'CLOSED']),
  razorpayPaymentLinkId: z.string().optional(),
})

// POST /api/enquiries — submit a new banquet / room hold / corporate inquiry
enquiriesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createEnquirySchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid enquiry parameters',
        details: validation.error.flatten().fieldErrors,
      })
    }

    const data = validation.data
    let propId = data.propertyId
    let propName = 'Quadis Hotel'

    if (data.propertySlug) {
      const propData = await db.getPropertyBySlug(data.propertySlug)
      if (propData.property) {
        propId = propData.property.id
        propName = propData.property.name
      }
    } else if (propId) {
      const prop = await db.getPropertyById(propId)
      if (prop) propName = prop.name
    }

    const enquiry = await db.createEnquiry({
      enquiry_type: data.enquiryType,
      property_id: propId,
      guest_name: data.guestName,
      guest_phone: data.guestPhone,
      guest_email: data.guestEmail || undefined,
      event_date: data.eventDate,
      guest_count: data.guestCount,
      message: data.message,
    })

    // Dispatch WhatsApp alert to hotel manager asynchronously
    notificationService.sendOwnerEnquiryAlert(enquiry, propName).catch((err) => {
      console.error('Error dispatching WhatsApp enquiry alert:', err)
    })

    res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully and WhatsApp alert dispatched to hotel management',
      data: enquiry,
    })
  } catch (err: any) {
    console.error('Error submitting enquiry:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to submit enquiry' })
  }
})

// GET /api/enquiries — retrieve enquiries. Admin only: every row carries a
// lead's name, phone, email and message.
enquiriesRouter.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined
    const enquiries = await db.getEnquiries(status)
    res.json({
      success: true,
      count: enquiries.length,
      data: enquiries,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch enquiries' })
  }
})

// GET /api/enquiries/:id — get a single enquiry by ID. Admin only, same reason.
enquiriesRouter.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const enquiry = await db.getEnquiryById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, error: 'Enquiry not found' })
    }
    res.json({ success: true, data: enquiry })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch enquiry' })
  }
})

// PATCH /api/enquiries/:id/status — update enquiry status or attach payment link
enquiriesRouter.patch('/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const validation = updateStatusSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ success: false, error: 'Invalid status update parameters' })
    }

    const updated = await db.updateEnquiryStatus(req.params.id, validation.data.status, validation.data.razorpayPaymentLinkId)
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Enquiry not found' })
    }

    res.json({ success: true, message: 'Enquiry status updated', data: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update enquiry' })
  }
})
