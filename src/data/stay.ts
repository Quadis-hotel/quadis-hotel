/**
 * The stay a guest is shopping for — dates and party — carried between pages.
 *
 * The booking bar on the home page used to write `?checkin=&checkout=&guests=`
 * and nothing read them: the hotels list looked only at `city`, and the hotel
 * page initialised its own date fields to empty. A guest picked their dates on
 * the first screen and was asked for them again on the next one.
 *
 * This module is the single definition of how a stay is spelled in a URL, so
 * the bar, the list, the hotel page and checkout all agree.
 */

export interface StayQuery {
  checkin: string
  checkout: string
  adults: number
  children: number
}

export const DEFAULT_STAY: StayQuery = { checkin: '', checkout: '', adults: 2, children: 0 }

/** Today in local time as YYYY-MM-DD — the floor for a check-in date input. */
export function todayIso(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/** The day after `iso`, as YYYY-MM-DD. */
export function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const isIsoDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Reads a stay out of a query string, discarding anything malformed.
 *
 * A hand-edited or stale URL must never put the page into a state the server
 * would reject, so a checkout on or before check-in is dropped rather than
 * carried through to a quote.
 */
export function readStayParams(params: URLSearchParams): StayQuery {
  const checkinRaw = params.get('checkin')
  const checkoutRaw = params.get('checkout')

  const checkin = isIsoDate(checkinRaw) && checkinRaw >= todayIso() ? checkinRaw : ''
  const checkout = isIsoDate(checkoutRaw) && (!checkin || checkoutRaw > checkin) ? checkoutRaw : ''

  // `guests` is the older single-field spelling the booking bar used to emit.
  // Honour it as an adult count so an old link or bookmark still works.
  const legacyGuests = params.get('guests')

  return {
    checkin,
    // A check-out with no check-in is meaningless; drop it rather than showing
    // a half-filled form.
    checkout: checkin ? checkout : '',
    adults: clampInt(params.get('adults') ?? legacyGuests, DEFAULT_STAY.adults, 1, 12),
    children: clampInt(params.get('children'), DEFAULT_STAY.children, 0, 8),
  }
}

/** Writes a stay into query params, omitting anything still at its default. */
export function buildStayParams(stay: Partial<StayQuery>, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base)

  if (stay.checkin) p.set('checkin', stay.checkin); else p.delete('checkin')
  if (stay.checkin && stay.checkout) p.set('checkout', stay.checkout); else p.delete('checkout')

  if (stay.adults !== undefined) p.set('adults', String(stay.adults))
  if (stay.children) p.set('children', String(stay.children)); else p.delete('children')

  // Never emit the superseded spelling alongside the new one.
  p.delete('guests')
  return p
}

/** Nights between two ISO dates. 0 when either is missing or the range is invalid. */
export function nightsBetween(checkin: string, checkout: string): number {
  if (!checkin || !checkout) return 0
  const ms = new Date(`${checkout}T00:00:00Z`).getTime() - new Date(`${checkin}T00:00:00Z`).getTime()
  return ms > 0 ? Math.round(ms / 86400000) : 0
}
