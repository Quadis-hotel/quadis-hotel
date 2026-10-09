import { Router, Request, Response } from 'express'
import { db } from '../db'
import { razorpayService } from '../services/RazorpayService'
import { notificationService } from '../services/NotificationService'
import { channelManager } from '../services/ChannelManagerService'

export const webhooksRouter = Router()

// POST /api/webhooks/razorpay — handle Razorpay payment success or failure events
webhooksRouter.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined
    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))

    // The simulation bypass exists for local development and the test suite. In
    // production it would let anyone confirm any booking with a plain POST, so
    // it is gated on the environment rather than on a client-supplied header.
    const simulationAllowed = process.env.NODE_ENV !== 'production'
    const isSimulatedHeader =
      simulationAllowed && (signature === 'simulated' || req.headers['x-simulated-webhook'] === 'true')

    if (!isSimulatedHeader) {
      // Fail closed: a missing signature is not a reason to skip verification.
      if (!signature) {
        return res.status(401).json({ success: false, error: 'Missing Razorpay webhook signature' })
      }
      const isValid = razorpayService.verifyWebhookSignature(rawBody, signature)
      if (!isValid) {
        return res.status(401).json({ success: false, error: 'Invalid Razorpay webhook signature' })
      }
    }

    const eventData = req.body
    const eventType = eventData.event || (isSimulatedHeader ? eventData.simulated_event : undefined)

    if (!eventType) {
      return res.status(400).json({ success: false, error: 'Webhook payload missing event identifier' })
    }

    // Extract bookingCode or orderId
    const entity =
      eventData.payload?.payment?.entity ||
      eventData.payload?.order?.entity ||
      eventData.entity ||
      eventData.data ||
      {}

    const notes = entity.notes || {}
    const bookingCode = notes.bookingCode || eventData.bookingCode
    const orderId = entity.order_id || eventData.orderId
    const paymentId = entity.id || eventData.paymentId || `pay_sim_${Date.now()}`

    let booking = null
    if (bookingCode) {
      booking = await db.getBookingByCode(bookingCode)
    }

    if (!booking && orderId) {
      // Fallback: search across bookings by orderId
      if (!db['useInMemory'] && db['pool']) {
        const resQuery = await db['pool'].query('SELECT * FROM bookings WHERE razorpay_order_id = $1', [orderId])
        booking = resQuery.rows[0] || null
      } else {
        booking =
          Array.from((db as any).memoryBookings.values()).find((b: any) => b.razorpay_order_id === orderId) || null
      }
    }

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Target booking not found for webhook event' })
    }

    if (eventType === 'order.paid' || eventType === 'payment.captured') {
      // Razorpay retries on timeout. Replaying a confirmation must not fire a
      // second set of guest/owner receipts.
      if (booking.booking_status === 'CONFIRMED' && booking.payment_status === 'PAID') {
        return res.json({ success: true, message: 'Booking already confirmed; webhook ignored as duplicate' })
      }

      // The hold was already released back to inventory, so the room may since
      // have been sold. Confirming here would oversell it — record the payment
      // and flag it for a human instead.
      if (booking.booking_status === 'CANCELLED' || booking.booking_status === 'EXPIRED') {
        await db.updateBookingPayment(booking.booking_code, {
          paymentStatus: 'PAID',
          razorpayPaymentId: paymentId,
        })
        console.error(
          `[webhook] Payment ${paymentId} captured for ${booking.booking_code}, which is already ` +
          `${booking.booking_status}. Inventory was released — needs manual review or refund.`
        )
        return res.status(409).json({
          success: false,
          error: 'Booking is no longer held; payment recorded and flagged for manual review',
        })
      }

      const updated = await db.updateBookingPayment(booking.booking_code, {
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        razorpayPaymentId: paymentId,
      })

      if (updated) {
        const prop = await db.getPropertyById(updated.property_id)
        const room = await db.getRoomTypeById(updated.room_type_id)
        const propName = prop?.name || 'Quadis Hotel'
        const roomName = room?.name || 'Deluxe Room'

        // Trigger notifications asynchronously. The channel-manager push is
        // in the same fire-and-forget set: the guest has paid and Razorpay is
        // waiting for a 200, so ResAvenue being slow must not delay either.
        // If the push fails, the row stays PENDING and the sync worker retries.
        Promise.all([
          notificationService.sendGuestWhatsAppReceipt(updated, propName, roomName, prop?.address),
          notificationService.sendOwnerWhatsAppAlert(updated, propName, roomName),
          channelManager.pushBooking(updated),
        ]).catch((err) => console.error('Error in background notifications:', err))
      }

      return res.json({ success: true, message: 'Booking confirmed and WhatsApp receipts dispatched' })
    }

    if (eventType === 'payment.failed') {
      // Releasing inventory is only safe once. A replayed failure must not add
      // the same rooms back a second time.
      if (booking.booking_status === 'CANCELLED' || booking.booking_status === 'EXPIRED') {
        return res.json({ success: true, message: 'Booking already released; webhook ignored as duplicate' })
      }

      // Payment failed — mark status and immediately release inventory
      await db.updateBookingPayment(booking.booking_code, {
        paymentStatus: 'FAILED',
        bookingStatus: 'CANCELLED',
        razorpayPaymentId: paymentId,
      })

      return res.json({ success: true, message: 'Payment failed, room hold released back to inventory' })
    }

    res.json({ success: true, message: `Webhook event ${eventType} processed` })
  } catch (err: any) {
    console.error('Error handling Razorpay webhook:', err)
    res.status(500).json({ success: false, error: 'Internal webhook processing error' })
  }
})

// POST /api/webhooks/whatsapp-staff — Quick commands from authorized staff smartphones
webhooksRouter.post('/whatsapp-staff', async (req: Request, res: Response) => {
  try {
    const { from, text } = req.body
    const staffText = (text || '').trim().toLowerCase()

    if (!staffText) {
      return res.status(400).json({ success: false, error: 'Message text is required' })
    }

    // Check staff phone authorization. Omitting `from` used to authorise the
    // request — an unauthenticated caller could toggle inventory for every
    // property by simply leaving the field out.
    const ownerPhone = (process.env.OWNER_WHATSAPP_PHONE || '919217373532').replace(/\D/g, '')
    const fromDigits = typeof from === 'string' ? from.replace(/\D/g, '') : ''
    const isAuthorized =
      process.env.NODE_ENV === 'test' || (fromDigits.length > 0 && fromDigits.includes(ownerPhone))

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Unauthorized WhatsApp staff phone number' })
    }

    if (staffText.startsWith('glance') || staffText.startsWith('status')) {
      const metrics = await db.getGlanceMetrics()
      const reply = `📊 *Quadis Hotels Daily Glance*
• Today's Check-ins: *${metrics.todayCheckIns}*
• Pending Holds: *${metrics.pendingHolds}*
• Pending Enquiries: *${metrics.pendingEnquiries}*
• Today's Revenue: *₹${metrics.todayRevenue.toLocaleString('en-IN')}*`
      return res.json({ success: true, reply })
    }

    if (staffText.startsWith('sold out') || staffText.startsWith('available')) {
      const isAvailable = staffText.startsWith('available')
      const keywordClean = staffText.replace(/^(sold out|available)\s+/i, '').trim()

      // Find matching room category and property
      const allProps = await db.getPropertiesWithRooms()
      let matchedRoom: any = null
      let matchedProp: any = null

      for (const item of allProps) {
        for (const r of item.rooms) {
          if (
            keywordClean.toLowerCase().includes(r.name.toLowerCase()) ||
            keywordClean.toLowerCase().includes(item.property.name.toLowerCase()) ||
            keywordClean.toLowerCase().includes(item.property.slug.toLowerCase()) ||
            keywordClean.toLowerCase().includes(r.slug.toLowerCase())
          ) {
            matchedRoom = r
            matchedProp = item.property
            break
          }
        }
        if (matchedRoom) break
      }

      if (!matchedRoom) {
        return res.json({
          success: false,
          reply: `❌ Could not match room/hotel from command "${keywordClean}". Example: "Sold out Deluxe Sector 51"`,
        })
      }

      const updated = await db.toggleRoomAvailability(matchedRoom.id, undefined, isAvailable)
      const reply = `✅ Marked *${matchedRoom.name}* at *${matchedProp.name}* as *${isAvailable ? 'AVAILABLE' : 'SOLD OUT'}*.`
      return res.json({ success: true, reply, updatedRoom: updated })
    }

    return res.json({
      success: true,
      reply: `🤖 Quadis Staff Bot Commands:
• *Status* or *Glance* — view daily summary
• *Sold out <room/hotel>* — lock room inventory
• *Available <room/hotel>* — unlock room inventory`,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Error executing staff command' })
  }
})
