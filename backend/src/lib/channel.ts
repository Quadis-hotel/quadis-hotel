import type { MealPlan, PropertyRecord, RoomTypeRecord, InventoryDayRecord, RateDayRecord } from '../types'
import {
  baseRoomRateFor,
  mealUpliftFor,
  isWeekendNight,
  policyFor,
  MEAL_PLAN_UPLIFT_PERCENT,
} from './pricing'

/**
 * Shared vocabulary for the ResAvenue channel-manager integration.
 *
 * ResAvenue's OTA API guide (v2.0, Sep 2020) speaks in numeric codes: a
 * HotelCode, a room "InvTypeCode" / "InvCode", and a "RatePlanCode" /
 * "RateCode". Our own identifiers are strings — `prop-2`,
 * `room-prop-2-deluxe-room`, and meal plans named in English — and several of
 * them overrun the Varchar(10) the guide allows for a code. So every message
 * crosses this file on the way in and on the way out, and the mapping lives
 * here and nowhere else.
 *
 * The codes are DERIVED, not stored, so that the in-memory store and Postgres
 * agree without a migration and a redeploy cannot renumber anything the
 * channel manager has already been configured with:
 *
 *   hotel code   = the number in the property id         prop-7          → 7
 *   room code    = hotel code × 100 + category index     Deluxe at prop-7 → 701
 *   rate plan    = room code × 10 + meal plan index      CP on that room  → 7012
 *
 * Category and plan indices are fixed below. Renaming a slug would renumber a
 * room, which is why `slug` is deliberately not in the admin's ROOM_EDITABLE
 * list; do not add it without giving these codes a column of their own first.
 */

/** Category index by room slug. Add new categories at the END; never renumber. */
const ROOM_CATEGORY_INDEX: Record<string, number> = {
  'deluxe-room': 1,
  'super-deluxe': 2,
  'superior-room': 3,
  'royal-suite': 4,
}

/**
 * Meal plan index. EP / CP / MAP are the trade names ResAvenue's users will
 * recognise — the same three plans the site sells as Room Only / With
 * Breakfast / All Meals Included.
 */
export const RATE_PLAN_INDEX: Record<MealPlan, number> = {
  'Room Only': 1,
  'With Breakfast': 2,
  'All Meals Included': 3,
}

export const RATE_PLAN_LABEL: Record<MealPlan, string> = {
  'Room Only': 'EP (Room Only)',
  'With Breakfast': 'CP (With Breakfast)',
  'All Meals Included': 'MAP (All Meals Included)',
}

export const MEAL_PLANS: MealPlan[] = ['Room Only', 'With Breakfast', 'All Meals Included']

/**
 * Bounds the channel manager is told a rate must fall within, and that a rate
 * update is checked against. The ceiling matches the admin panel's `money`
 * cap so a slipped decimal cannot arrive from either direction.
 */
export const RATE_MIN = 1
export const RATE_MAX = 1_000_000

/** Same ceiling the admin panel puts on total_units. */
export const INVENTORY_MAX = 500

/** Longest date range one fetch or update may address, in days. */
export const MAX_RANGE_DAYS = 400

/** Defaults reported when the channel manager has not set a stay length. */
export const DEFAULT_MIN_STAY = 1
export const DEFAULT_MAX_STAY = 30

/** Small stable hash for the two fallbacks below; never used on seeded data. */
function stableHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function propertyOtaCode(property: Pick<PropertyRecord, 'id'>): number {
  const m = /^prop-(\d+)$/.exec(property.id)
  if (m) return Number(m[1])
  // Reached only by a property id that does not follow the seed's shape.
  return 100_000 + (stableHash(property.id) % 900_000)
}

export function roomOtaCode(room: Pick<RoomTypeRecord, 'property_id' | 'slug'>): number {
  const hotel = propertyOtaCode({ id: room.property_id })
  const idx = ROOM_CATEGORY_INDEX[room.slug] ?? 10 + (stableHash(room.slug) % 89)
  return hotel * 100 + idx
}

export function ratePlanOtaCode(room: Pick<RoomTypeRecord, 'property_id' | 'slug'>, plan: MealPlan): number {
  return roomOtaCode(room) * 10 + RATE_PLAN_INDEX[plan]
}

/** Accepts the numeric code, the property id, or the slug. */
export function findPropertyByCode<T extends Pick<PropertyRecord, 'id' | 'slug'>>(
  properties: T[],
  code: unknown
): T | null {
  const s = String(code ?? '').trim()
  if (!s) return null
  return (
    properties.find((p) => p.id === s || p.slug === s || String(propertyOtaCode(p)) === s) ?? null
  )
}

export function findRoomByCode<T extends Pick<RoomTypeRecord, 'id' | 'slug' | 'property_id'>>(
  rooms: T[],
  code: unknown
): T | null {
  const s = String(code ?? '').trim()
  if (!s) return null
  return rooms.find((r) => r.id === s || String(roomOtaCode(r)) === s) ?? null
}

export function findRatePlanByCode<T extends Pick<RoomTypeRecord, 'id' | 'slug' | 'property_id'>>(
  rooms: T[],
  code: unknown
): { room: T; plan: MealPlan } | null {
  const s = String(code ?? '').trim()
  if (!s) return null
  for (const room of rooms) {
    for (const plan of MEAL_PLANS) {
      if (String(ratePlanOtaCode(room, plan)) === s) return { room, plan }
    }
  }
  return null
}

/* ---------- Dates ---------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Strictly YYYY-MM-DD and a real calendar date (no 2020-02-30). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/**
 * A DATE column comes out of node-postgres as a JS Date at LOCAL midnight, and
 * out of the in-memory store as the string it went in as. Formatting the Date
 * with toISOString() would shift it to the previous day on any box east of
 * UTC — which is every box this runs on — so local getters are used instead.
 */
export function toIsoDate(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v ?? '').slice(0, 10)
}

/** Every date from start to end, both ends included. */
export function datesInclusive(start: string, end: string): string[] {
  const out: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000
  )
}

/* ---------- Day-of-week filter ---------- */

/**
 * The guide's `Days` block:
 *
 *   "Days": [{ "Mon": "True", "Tue": "True", "Weds": "True", "Thur": "True",
 *              "Fri": "True", "Sat": "True", "Sun": "True" }]
 *
 * Values are the STRINGS "True" / "False", a day that is absent counts as
 * "True", and the guide's own sample spells Wednesday "Weds" and Thursday
 * "Thur". Matching on the first three letters accepts those, the plain
 * three-letter forms, and full names, without a table of every variant.
 *
 * Returns the set of JS getUTCDay() values (0 = Sunday) the update applies to.
 */
export function parseDayFilter(days: unknown): Set<number> {
  const allowed = new Set<number>([0, 1, 2, 3, 4, 5, 6])
  const list = Array.isArray(days) ? days : days && typeof days === 'object' ? [days] : []
  const byPrefix: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      const idx = byPrefix[key.trim().slice(0, 3).toLowerCase()]
      if (idx === undefined) continue
      if (!parseBoolean(value, true)) allowed.delete(idx)
    }
  }
  return allowed
}

/** "True" / "False" strings, real booleans, and 1 / 0. Anything else → fallback. */
export function parseBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  }
  return fallback
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * The guide lists InvCodes / RateCodes as an array in the sample and as
 * "comma separated" in the element table. Accept both, plus a lone value.
 */
export function parseCodeList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean)
  if (typeof v === 'number') return [String(v)]
  return []
}

/* ---------- Effective nightly figures ---------- */

export interface NightRate {
  single: number
  double: number
  triple: number
  quad: number
  extraAdult: number
  extraChild: number
  minStay: number
  maxStay: number
  stopSell: boolean
}

/**
 * What one room-night costs on `date` under `plan`, at every occupancy the
 * guide reports.
 *
 * With no channel-manager override this is the site's own pricing: base rate
 * plus the meal uplift, the weekend surcharge on Fri/Sat, and the property's
 * extra-adult and child percentages for the third and fourth guest. Single
 * equals double because every rate on this site is quoted for two adults.
 *
 * With an override, the channel manager's figures win field by field — a rate
 * update that carries only NumberOfGuests 1 and 2 leaves triple and quad on
 * the computed value rather than blanking them. The weekend surcharge is NOT
 * applied on top of an override: the figure ResAvenue sent for a Friday is the
 * figure for that Friday.
 */
export function effectiveNightRate(
  property: PropertyRecord,
  room: RoomTypeRecord,
  plan: MealPlan,
  date: string,
  override?: RateDayRecord | null
): NightRate {
  const policy = policyFor(property)
  const base = baseRoomRateFor(property.base_price, room.price_offset)
  const nightly = base + mealUpliftFor(plan, base)
  const surcharge = Number(property.weekend_surcharge_percent) || 0
  const computedDouble = isWeekendNight(new Date(`${date}T00:00:00Z`))
    ? Math.round(nightly * (1 + surcharge / 100) * 100) / 100
    : nightly

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const double = num(override?.double) ?? computedDouble
  const extraAdult = num(override?.extra_adult) ?? Math.round(double * (policy.extraAdultPercent / 100))
  const extraChild = num(override?.extra_child) ?? Math.round(double * (policy.childPercent / 100))

  return {
    single: num(override?.single) ?? double,
    double,
    triple: num(override?.triple) ?? double + extraAdult,
    quad: num(override?.quad) ?? double + 2 * extraAdult,
    extraAdult,
    extraChild,
    minStay: num(override?.min_stay) ?? DEFAULT_MIN_STAY,
    maxStay: num(override?.max_stay) ?? DEFAULT_MAX_STAY,
    stopSell: Boolean(override?.stop_sell),
  }
}

/** The percentage the plan adds, for labelling rate plans to the channel manager. */
export function ratePlanUpliftPercent(plan: MealPlan): number {
  return MEAL_PLAN_UPLIFT_PERCENT[plan]
}

/* ---------- Restrictions ---------- */

/** Units sellable on one night: the channel manager's count if set, else the keys. */
export function capacityFor(rule: InventoryDayRecord | undefined | null, totalUnits: number): number {
  const n = rule?.inv_count
  return n === null || n === undefined ? Number(totalUnits) || 0 : Number(n)
}

/**
 * Why a stay cannot be sold, or null if it can.
 *
 * Inventory rules (from OTA_HotelInvCountNotifRQ) are per room per night:
 * StopSell closes the night, CloseOnArrival closes the check-in date,
 * CloseOnDeparture closes the check-out date, and CutOff is the least number
 * of days before arrival a booking may be made. Rate rules (from
 * OTA_HotelRateAmountNotifRQ) are per rate plan per night: their StopSell
 * closes that plan, and MinStay / MaxStay on the arrival night bound the
 * length of stay.
 *
 * Capacity is not checked here — the callers already compare held units with
 * capacityFor() per night, and the message they give ("Only N units
 * available") is the one the checkout already shows.
 */
export function stayRestrictionProblem(args: {
  checkIn: string
  checkOut: string
  nights: string[]
  today: string
  inventory: Map<string, InventoryDayRecord>
  rates?: Map<string, RateDayRecord>
}): string | null {
  const arrival = args.inventory.get(args.checkIn)
  if (arrival?.close_on_arrival) return `Arrivals are closed on ${args.checkIn}`

  const departure = args.inventory.get(args.checkOut)
  if (departure?.close_on_departure) return `Departures are closed on ${args.checkOut}`

  for (const night of args.nights) {
    if (args.inventory.get(night)?.stop_sell) return `This room is closed for sale on ${night}`
    if (args.rates?.get(night)?.stop_sell) return `This rate is closed for sale on ${night}`
  }

  const cutOff = Number(arrival?.cut_off) || 0
  if (cutOff > 0 && daysBetween(args.today, args.checkIn) < cutOff) {
    return `This room must be booked at least ${cutOff} day${cutOff === 1 ? '' : 's'} before arrival`
  }

  const arrivalRate = args.rates?.get(args.checkIn)
  const minStay = Number(arrivalRate?.min_stay) || 0
  const maxStay = Number(arrivalRate?.max_stay) || 0
  if (minStay > 0 && args.nights.length < minStay) {
    return `A minimum stay of ${minStay} night${minStay === 1 ? '' : 's'} applies from ${args.checkIn}`
  }
  if (maxStay > 0 && args.nights.length > maxStay) {
    return `A maximum stay of ${maxStay} night${maxStay === 1 ? '' : 's'} applies from ${args.checkIn}`
  }
  return null
}

/**
 * The per-night figures the pricing engine substitutes for its own when the
 * channel manager has set a rate for that night. Only the fields the engine
 * needs: the two-adult rate, and the per-head uplifts.
 */
export function nightOverridesFrom(
  property: PropertyRecord,
  room: RoomTypeRecord,
  plan: MealPlan,
  nights: string[],
  rates: Map<string, RateDayRecord>
): Record<string, { rate: number; extraAdultCharge: number; extraChildCharge: number }> {
  const out: Record<string, { rate: number; extraAdultCharge: number; extraChildCharge: number }> = {}
  for (const night of nights) {
    const row = rates.get(night)
    if (!row) continue
    const eff = effectiveNightRate(property, room, plan, night, row)
    out[night] = { rate: eff.double, extraAdultCharge: eff.extraAdult, extraChildCharge: eff.extraChild }
  }
  return out
}
