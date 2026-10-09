import Razorpay from 'razorpay'
import crypto from 'crypto'
import { BookingRecord } from '../types'

export interface RazorpayOrderResponse {
  success: boolean
  isSimulated?: boolean
  orderId?: string
  keyId?: string
  amount?: number
  currency?: string
  error?: string
}

export interface RazorpayPaymentLinkResponse {
  success: boolean
  isSimulated?: boolean
  paymentLinkId?: string
  shortUrl?: string
  error?: string
}

export class RazorpayService {
  private razorpayInstance: Razorpay | null = null
  private isLiveMode: boolean = false
  private keyId: string

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_simulated'
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'secret_simulated'

    // In production the key must be a LIVE key, not merely a non-placeholder.
    //
    // The checks below only reject the literals 'mock' and 'rzp_test_simulated',
    // so a genuine Razorpay *test* key (rzp_test_abc…) would pass them and flip
    // the app into "live" mode against Razorpay's test environment. Checkout
    // then looks completely normal to the guest, issues a real-looking order,
    // and takes no real money — a silent revenue hole that no error surfaces.
    // docs/razorpay-golive.md warns a human to check this by eye; this enforces
    // it. Outside production a test key is exactly what you want, so it passes.
    const keyIdEnv = process.env.RAZORPAY_KEY_ID
    const liveKeyRequired = process.env.NODE_ENV === 'production'
    const keyLooksLive = Boolean(keyIdEnv && keyIdEnv.startsWith('rzp_live_'))

    if (liveKeyRequired && keyIdEnv && !keyLooksLive) {
      console.error(
        `[razorpay] Refusing to enable payments: RAZORPAY_KEY_ID does not begin with "rzp_live_" ` +
        `(got "${keyIdEnv.slice(0, 9)}…"). Staying in simulated mode so checkout says so plainly ` +
        `rather than appearing to charge guests while taking no money.`
      )
    }

    if (
      process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_ID !== 'mock' &&
      process.env.RAZORPAY_KEY_ID !== 'rzp_test_simulated' &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_KEY_SECRET !== 'mock' &&
      (!liveKeyRequired || keyLooksLive)
    ) {
      try {
        this.razorpayInstance = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        })
        this.isLiveMode = true
      } catch (err) {
        console.warn('Failed to initialize live Razorpay instance, falling back to simulated mode:', err)
        this.isLiveMode = false
      }
    }
  }

  public async createOrder(booking: BookingRecord): Promise<RazorpayOrderResponse> {
    const amountInPaisa = Math.round(Number(booking.total_amount) * 100)

    if (this.isLiveMode && this.razorpayInstance) {
      try {
        const order = await this.razorpayInstance.orders.create({
          amount: amountInPaisa,
          currency: 'INR',
          receipt: booking.booking_code,
          notes: {
            bookingCode: booking.booking_code,
            guestPhone: booking.guest_phone,
            propertyId: booking.property_id,
          },
        })
        return {
          success: true,
          isSimulated: false,
          orderId: order.id,
          keyId: this.keyId,
          amount: amountInPaisa,
          currency: 'INR',
        }
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Razorpay API failed to create order',
        }
      }
    }

    // High-fidelity simulation fallback for local testing & demos
    const simulatedOrderId = `order_sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    return {
      success: true,
      isSimulated: true,
      orderId: simulatedOrderId,
      keyId: 'rzp_test_simulated_key',
      amount: amountInPaisa,
      currency: 'INR',
    }
  }

  public verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
    // The 'secret_simulated_webhook' fallback is a DEVELOPMENT convenience and
    // must never be reachable in production. It is a literal in this file, and
    // this repository is public — anyone could HMAC a payload with it, post to
    // /api/webhooks/razorpay, and have a booking marked CONFIRMED/PAID without
    // paying. Exactly the shape of the 'quadis-dev-only-session-secret'
    // fallback in lib/auth.ts, which fails closed for the same reason.
    //
    // install.sh only writes RAZORPAY_WEBHOOK_SECRET into the env file when the
    // SSM parameter exists, so "absent" is a live possibility, not a theory —
    // the old environment ran with it absent (docs/razorpay-golive.md).
    // Fail closed: no secret in production means no webhook is ever trusted.
    const webhookSecret =
      secret ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      (process.env.NODE_ENV === 'production' ? '' : 'secret_simulated_webhook')

    if (!webhookSecret) {
      console.error(
        '[razorpay] RAZORPAY_WEBHOOK_SECRET is not set in production. ' +
        'Rejecting every webhook — paid bookings will NOT auto-confirm until it is configured.'
      )
      return false
    }

    try {
      const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
    } catch {
      return false
    }
  }

  public async createPaymentLink(booking: BookingRecord): Promise<RazorpayPaymentLinkResponse> {
    const amountInPaisa = Math.round(Number(booking.total_amount) * 100)

    if (this.isLiveMode && this.razorpayInstance) {
      try {
        const link = await (this.razorpayInstance as any).paymentLink.create({
          amount: amountInPaisa,
          currency: 'INR',
          accept_partial: false,
          description: `Quadis Hotels Booking ${booking.booking_code}`,
          customer: {
            name: booking.guest_name,
            contact: booking.guest_phone,
            email: booking.guest_email || 'guest@quadishotels.com',
          },
          notify: {
            sms: true,
            email: Boolean(booking.guest_email),
          },
          reminder_enable: true,
          notes: {
            bookingCode: booking.booking_code,
          },
        })
        return {
          success: true,
          isSimulated: false,
          paymentLinkId: link.id,
          shortUrl: link.short_url,
        }
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Razorpay API failed to create payment link',
        }
      }
    }

    // Simulated Payment Link
    const simLinkId = `plink_sim_${Date.now()}`
    const simShortUrl = `https://checkout.quadishotels.com/pay/${booking.booking_code}`
    return {
      success: true,
      isSimulated: true,
      paymentLinkId: simLinkId,
      shortUrl: simShortUrl,
    }
  }

  public async createEnquiryPaymentLink(payload: {
    enquiryId: string
    amount: number
    guestName: string
    guestPhone: string
    guestEmail?: string
    description?: string
  }): Promise<RazorpayPaymentLinkResponse> {
    const amountInPaisa = Math.round(Number(payload.amount) * 100)

    if (this.isLiveMode && this.razorpayInstance) {
      try {
        const link = await (this.razorpayInstance as any).paymentLink.create({
          amount: amountInPaisa,
          currency: 'INR',
          accept_partial: false,
          description: payload.description || `Quadis Hotels Enquiry Deposit (${payload.enquiryId})`,
          customer: {
            name: payload.guestName,
            contact: payload.guestPhone,
            email: payload.guestEmail || 'guest@quadishotels.com',
          },
          notify: {
            sms: true,
            email: Boolean(payload.guestEmail),
          },
          reminder_enable: true,
          notes: {
            enquiryId: payload.enquiryId,
          },
        })
        return {
          success: true,
          isSimulated: false,
          paymentLinkId: link.id,
          shortUrl: link.short_url,
        }
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Razorpay API failed to create payment link for enquiry',
        }
      }
    }

    // Simulated Payment Link for Enquiry
    const simLinkId = `plink_enq_sim_${Date.now()}`
    const simShortUrl = `https://checkout.quadishotels.com/pay-enquiry/${payload.enquiryId}`
    return {
      success: true,
      isSimulated: true,
      paymentLinkId: simLinkId,
      shortUrl: simShortUrl,
    }
  }
}

export const razorpayService = new RazorpayService()
