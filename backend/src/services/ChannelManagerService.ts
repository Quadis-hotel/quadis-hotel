import { db } from '../db'
import type { BookingRecord, PropertyRecord, RoomTypeRecord, MealPlan } from '../types'
import { propertyOtaCode, roomOtaCode, ratePlanOtaCode, RATE_PLAN_LABEL, toIsoDate } from '../lib/channel'
import { nightsBetween } from '../lib/nights'
import { gstRatePercentFor } from '../lib/pricing'

/**
 * Booking Push — this site telling ResAvenue about a reservation.
 *
 * The guide (§VII.ii) prefers push over pull "as it is a more reliable way to
 * update reservations in runtime", and says the push URL "will be shared by
 * the Channel Manager". That URL is RESAVENUE_PUSH_URL. Until it is set, no
 * push is attempted, every confirmed booking sits at cm_sync_status PENDING,
 * and the pull endpoint still serves them — so the two channels can be
 * enabled in either order.
 *
 * Delivery is at-least-once: the webhook fires a push the moment a payment
 * is captured, and workers/channelSync.ts retries anything PENDING or FAILED
 * every few minutes until it is SENT or gives up. ResAvenue keys on
 * UniqueID.ID, which is the booking code, so a repeat of a Confirm is a
 * no-op on their side.
 */

const PUSH_TIMEOUT_MS = 15_000

export interface PushResult {
  /** True when nothing was attempted because no URL is configured. */
  skipped: boolean
  success: boolean
  remark?: string
}

export class ChannelManagerService {
  private pushUrl(): string | null {
    return process.env.RESAVENUE_PUSH_URL?.trim() || null
  }

  /**
   * One reservation in the guide's HotelReservation shape, shared by the pull
   * reply and the push request so the two can never disagree.
   */
  public buildHotelReservation(booking: BookingRecord, property: PropertyRecord, room: RoomTypeRecord | null) {
    const checkIn = toIsoDate(booking.check_in)
    const checkOut = toIsoDate(booking.check_out)
    const nights = nightsBetween(checkIn, checkOut)
    const nightCount = Math.max(1, nights.length)
    const rooms = Math.max(1, Number(booking.rooms_count) || 1)
    const total = Math.round((Number(booking.total_amount) || 0) * 100) / 100

    // Prices on this site are GST-inclusive; the invoice back-calculates the
    // tax out of the total at the slab the per-room-night rate falls in.
    const gstPercent = gstRatePercentFor(total / (nightCount * rooms))
    const totalTax = Math.round((total - total / (1 + gstPercent / 100)) * 100) / 100

    // Per-night amounts. The plan that priced the stay is on the row; what is
    // not on the row is the weekend split, so the total is spread evenly and
    // the last night absorbs the rounding — the nights still sum to the total.
    const perNight = Math.floor((total / nightCount) * 100) / 100
    const rates = (nights.length ? nights : [checkIn]).map((date, i, all) => ({
      Amount: i === all.length - 1 ? Math.round((total - perNight * (all.length - 1)) * 100) / 100 : perNight,
      EffectiveDate: date,
    }))

    const adults = Number(booking.adults_count) || Number(booking.guests_count) || 0
    const children = Number(booking.children_count) || 0
    const guestCounts = [{ Count: String(adults), AgeQualifyingCode: '10' }]
    if (children > 0) guestCounts.push({ Count: String(children), AgeQualifyingCode: '8' })

    const name = String(booking.guest_name || '').trim()
    const space = name.indexOf(' ')
    const givenName = space > 0 ? name.slice(0, space) : name
    const surname = space > 0 ? name.slice(space + 1).trim() : ''

    // A row from before meal_plan was stored priced as Room Only, which is the
    // plan the checkout defaults to, so that is the code it is reported under.
    const plan: MealPlan = booking.meal_plan ?? 'Room Only'

    return {
      UniqueID: {
        ID: booking.booking_code,
        OTA: 'Quadis Hotels',
        BookingSource: 'quadishotels.com',
      },
      ResStatus: booking.cm_res_status ?? (booking.booking_status === 'CANCELLED' ? 'Cancel' : 'Confirm'),
      RoomStays: {
        RoomStay: [
          {
            TimeSpan: { Start: checkIn, End: checkOut },
            BasicPropertyInfo: { HotelCode: String(propertyOtaCode(property)), HotelName: property.name },
            GuestCounts: { GuestCount: guestCounts },
            RoomTypes: {
              RoomType: {
                NumberOfUnits: String(rooms),
                RoomDescription: { Name: room?.name ?? 'Room' },
                RoomTypeCode: room ? String(roomOtaCode(room)) : '',
              },
            },
            Total: { CurrencyCode: 'INR', Amount: total },
            RatePlans: {
              RatePlan: {
                RatePlanName: room ? `${room.name} - ${RATE_PLAN_LABEL[plan]}` : RATE_PLAN_LABEL[plan],
                RatePlanCode: room ? String(ratePlanOtaCode(room, plan)) : '',
              },
            },
            RoomRates: { RoomRate: { Rates: rates } },
            ResGuestRPHs: { ResGuestRPH: { RPH: 0 } },
          },
        ],
      },
      ResGlobalInfo: {
        SpecialRequest: booking.company_name
          ? `Corporate guest: ${booking.company_name}${booking.gstin ? ` (GSTIN ${booking.gstin})` : ''}`
          : '',
        Total: {
          CurrencyCode: 'INR',
          TotalTax: totalTax,
          TaxType: 'Inclusive',
          TotalBookingAmount: total,
          // Direct bookings carry no channel commission.
          Commission: 0,
          CommissionType: 'Exclusive',
        },
      },
      CreateDateTime: formatDateTime(booking.created_at),
      // Paid online through Razorpay before it was confirmed.
      PayAtHotel: 'N',
      ResGuests: {
        ResGuest: [
          {
            Profiles: {
              ProfileInfo: {
                UniqueID: { Type: '1', ID_Context: booking.booking_code },
                Profile: {
                  ProfileType: '1',
                  Customer: {
                    PersonName: { GivenName: givenName, Surname: surname },
                    Email: booking.guest_email ?? '',
                    Telephone: booking.guest_phone,
                  },
                },
              },
            },
            ResGuestRPH: 0,
          },
        ],
      },
    }
  }

  /** The full OTA_HotelResNotifRQ push body for one booking. */
  public async buildPushMessage(booking: BookingRecord) {
    const property = await db.getPropertyById(booking.property_id)
    if (!property) throw new Error(`Property ${booking.property_id} not found for booking ${booking.booking_code}`)
    const room = await db.getRoomTypeById(booking.room_type_id)
    return {
      OTA_HotelResNotifRQ: {
        Target: process.env.RESAVENUE_TARGET?.trim() || 'Production',
        Version: '1.0',
        EchoToken: `${booking.booking_code}-${Date.now().toString(36)}`,
        HotelReservations: {
          HotelReservation: [this.buildHotelReservation(booking, property, room)],
        },
        TimeStamp: new Date().toISOString(),
      },
    }
  }

  /**
   * Pushes one booking and records the outcome on its row. Never throws: a
   * failure is a FAILED row for the worker to retry, and a caller on the
   * payment path must not be taken down by the channel manager being slow.
   */
  public async pushBooking(booking: BookingRecord): Promise<PushResult> {
    const url = this.pushUrl()
    if (!url) return { skipped: true, success: false, remark: 'RESAVENUE_PUSH_URL is not set' }

    let remark = ''
    try {
      const body = await this.buildPushMessage(booking)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
        // Whatever ResAvenue asks us to send on their push URL, verbatim — a
        // bearer token, a Basic pair, or nothing. The guide does not say.
        const authorization = process.env.RESAVENUE_PUSH_AUTHORIZATION?.trim()
        if (authorization) headers.Authorization = authorization

        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
        const text = await res.text()
        let parsed: any = null
        try { parsed = JSON.parse(text) } catch { /* a non-JSON body is reported below */ }
        const rs = parsed?.OTA_HotelResNotifRS ?? parsed?.['"OTA_HotelResNotifRS'] ?? null
        const status = String(rs?.Status ?? '').toLowerCase()

        if (res.ok && (status === 'success' || (!rs && text.trim() === ''))) {
          await db.markChannelSync(booking.id, 'SENT', null)
          console.log(`[ota] pushed ${booking.cm_res_status ?? 'Confirm'} for ${booking.booking_code} to ResAvenue`)
          return { skipped: false, success: true }
        }
        remark = rs?.Remark ? String(rs.Remark).slice(0, 500) : `HTTP ${res.status}: ${text.slice(0, 300)}`
      } finally {
        clearTimeout(timer)
      }
    } catch (err: any) {
      remark = err?.name === 'AbortError' ? `Timed out after ${PUSH_TIMEOUT_MS / 1000}s` : String(err?.message || err).slice(0, 500)
    }

    await db.markChannelSync(booking.id, 'FAILED', remark)
    console.error(`[ota] push for ${booking.booking_code} failed: ${remark}`)
    return { skipped: false, success: false, remark }
  }
}

/** "2018-05-31 12:44:33.0" — the guide's CreateDateTime shape, in IST. */
function formatDateTime(v: Date | string | undefined): string {
  const d = v instanceof Date ? v : new Date(v ?? Date.now())
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}.0`
}

export const channelManager = new ChannelManagerService()
