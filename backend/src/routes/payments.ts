import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../db'
import { requireAdmin } from '../middleware/auth'
import { razorpayService } from '../services/RazorpayService'

export const paymentsRouter = Router()

const createOrderSchema = z.object({
  bookingCode: z.string().trim().min(1, 'Booking code is required'),
})

// POST /api/payments/create-order — create Razorpay checkout order for an active hold
paymentsRouter.post('/create-order', async (req: Request, res: Response) => {
  try {
    const validation = createOrderSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: validation.error.flatten().fieldErrors,
      })
    }

    const { bookingCode } = validation.data
    const booking = await db.getBookingByCode(bookingCode)

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' })
    }

    if (booking.booking_status !== 'PENDING_PAYMENT') {
      return res.status(400).json({
        success: false,
        error: `Cannot create payment order for booking with status: ${booking.booking_status}`,
      })
    }

    const orderRes = await razorpayService.createOrder(booking)
    if (!orderRes.success) {
      return res.status(500).json({ success: false, error: orderRes.error || 'Failed to generate Razorpay order' })
    }

    // Save orderId against booking
    if (orderRes.orderId) {
      await db.updateBookingPayment(bookingCode, { razorpayOrderId: orderRes.orderId })
    }

    res.json({
      success: true,
      message: 'Razorpay checkout order initialized',
      data: {
        orderId: orderRes.orderId,
        keyId: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        isSimulated: orderRes.isSimulated,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Internal server error while creating payment order' })
  }
})

// POST /api/payments/payment-link — generate instant payment link for custom inquiries / walk-ins
paymentsRouter.post('/payment-link', async (req: Request, res: Response) => {
  try {
    const validation = createOrderSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ success: false, error: 'Booking code is required' })
    }

    const { bookingCode } = validation.data
    const booking = await db.getBookingByCode(bookingCode)
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' })
    }

    const linkRes = await razorpayService.createPaymentLink(booking)
    if (!linkRes.success) {
      return res.status(500).json({ success: false, error: linkRes.error || 'Failed to create payment link' })
    }

    if (linkRes.paymentLinkId) {
      await db.updateBookingPayment(bookingCode, { razorpayPaymentLinkId: linkRes.paymentLinkId })
    }

    res.json({
      success: true,
      message: 'Payment link generated successfully',
      data: {
        paymentLinkId: linkRes.paymentLinkId,
        shortUrl: linkRes.shortUrl,
        isSimulated: linkRes.isSimulated,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Error generating payment link' })
  }
})

/**
 * The amount is quoted by staff (a banquet deposit has no fixed tariff), so it
 * cannot be derived from the enquiry row. It is therefore bounded here and the
 * route is admin-only — previously any anonymous caller could mint a
 * Quadis-branded Razorpay link for an arbitrary sum against a real guest's
 * name and phone.
 */
const MAX_ENQUIRY_LINK_AMOUNT = 500_000

const enquiryLinkSchema = z.object({
  enquiryId: z.string().trim().min(1, 'Enquiry ID is required'),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(MAX_ENQUIRY_LINK_AMOUNT, `Amount must not exceed ₹${MAX_ENQUIRY_LINK_AMOUNT.toLocaleString('en-IN')}`),
  description: z.string().optional(),
})

// POST /api/payments/enquiry-payment-link — generate payment link for an enquiry (banquet deposit / walk-in hold)
paymentsRouter.post('/enquiry-payment-link', requireAdmin, async (req: Request, res: Response) => {
  try {
    const validation = enquiryLinkSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid enquiry payment link parameters',
        details: validation.error.flatten().fieldErrors,
      })
    }

    const { enquiryId, amount, description } = validation.data
    const enquiry = await db.getEnquiryById(enquiryId)
    if (!enquiry) {
      return res.status(404).json({ success: false, error: 'Enquiry not found' })
    }

    const linkRes = await razorpayService.createEnquiryPaymentLink({
      enquiryId,
      amount,
      guestName: enquiry.guest_name,
      guestPhone: enquiry.guest_phone,
      guestEmail: enquiry.guest_email || undefined,
      description,
    })

    if (!linkRes.success) {
      return res.status(500).json({ success: false, error: linkRes.error || 'Failed to create enquiry payment link' })
    }

    if (linkRes.paymentLinkId) {
      await db.updateEnquiryStatus(enquiryId, 'LINK_SENT', linkRes.paymentLinkId)
    }

    res.json({
      success: true,
      message: 'Enquiry payment link generated and status updated to LINK_SENT',
      data: {
        paymentLinkId: linkRes.paymentLinkId,
        shortUrl: linkRes.shortUrl,
        isSimulated: linkRes.isSimulated,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Error generating enquiry payment link' })
  }
})
