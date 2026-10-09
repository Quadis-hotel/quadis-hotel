import { Router, Request, Response, RequestHandler } from 'express'
import { timingSafeEqual } from 'crypto'
import { db } from '../db'
import type { MealPlan, PropertyRecord, RoomTypeRecord, InventoryDayRecord, RateDayRecord } from '../types'
import {
  MEAL_PLANS, RATE_MIN, RATE_MAX, INVENTORY_MAX, MAX_RANGE_DAYS,
  propertyOtaCode, roomOtaCode, ratePlanOtaCode, RATE_PLAN_LABEL,
  findPropertyByCode, findRoomByCode, findRatePlanByCode,
  isIsoDate, datesInclusive, daysBetween, parseDayFilter, parseBoolean, dayOfWeek, parseCodeList,
  effectiveNightRate, capacityFor,
} from '../lib/channel'
import { channelManager } from '../services/ChannelManagerService'

/**
 * The ResAvenue OTA API — this site as seen by the client's channel manager.
 *
 * ResAvenue's guide (v2.0, 22 Sep 2020) is written from the channel manager's
 * side: "fetch ... from OTA", "update ... from OTA", "pull reservations from
 * OTA extranet". We are the OTA. Six messages arrive here, each a JSON body
 * with one root key, sent by POST or PUT:
 *
 *   OTA_HotelDetailsRQ         property, rooms and rate plans   → /property-details
 *   OTA_HotelInventoryRQ       inventory per night              → /inventory/fetch
 *   OTA_HotelInvCountNotifRQ   set inventory and restrictions   → /inventory/update
 *   OTA_HotelRateRQ            rates per night                  → /rates/fetch
 *   OTA_HotelRateAmountNotifRQ set rates and restrictions       → /rates/update
 *   OTA_HotelResNotifRQ        reservations changed in a window → /bookings/pull
 *
 * The seventh, booking PUSH, goes the other way — see
 * services/ChannelManagerService.ts and workers/channelSync.ts.
 *
 * The guide gives no URL paths (each OTA supplies its own), so every message
 * also works at the single dispatcher, POST /api/ota/resavenue, which routes on
 * the root key. Give ResAvenue whichever they can configure.
 *
 * Reply shapes follow the guide's samples field for field, with two deliberate
 * departures, both documented in docs/resavenue-ota-integration.md: the
 * fetch replies echo the POS block WITHOUT the password, and a failure on a
 * fetch — which the guide leaves undefined — is `{ "<root>RS": { "Status":
 * "Failure", "Remark": "..." } }`, the same Status/Remark pair the update
 * replies use.
 */
export const otaRouter = Router()

/* ---------- Authentication ---------- */

/**
 * Credentials live in the message body, in one of two shapes the guide uses:
 *
 *   fetch:   "POS": { "Username", "Password", "ID_Context" }
 *   update:  "POS": { "RequestorID": { "User", "Password", "ID_Context" } }
 *
 * The booking-pull sample carries no POS block at all. That message returns
 * guest names, phones and emails, so it is not served unauthenticated here;
 * ResAvenue must include a POS block or send HTTP Basic auth, which every
 * message may also use instead of the body.
 */
interface Credentials { user: string; password: string; idContext: string }

function credentialsFrom(req: Request, message: Record<string, unknown>): Credentials | null {
  const pos = (message.POS ?? {}) as Record<string, unknown>
  const requestor = (pos.RequestorID ?? {}) as Record<string, unknown>
  const user = requestor.User ?? pos.Username ?? pos.User
  const password = requestor.Password ?? pos.Password
  const idContext = requestor.ID_Context ?? pos.ID_Context ?? ''
  if (typeof user === 'string' && typeof password === 'string') {
    return { user, password, idContext: String(idContext ?? '') }
  }

  const header = req.headers.authorization
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
    const i = decoded.indexOf(':')
    if (i > 0) return { user: decoded.slice(0, i), password: decoded.slice(i + 1), idContext: String(idContext ?? '') }
  }
  return null
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** `configured` false = 503, so an unset deploy fails closed rather than open. */
function authenticate(req: Request, message: Record<string, unknown>): { ok: true } | { ok: false; status: number; remark: string } {
  const expectedUser = process.env.RESAVENUE_OTA_USERNAME
  const expectedPassword = process.env.RESAVENUE_OTA_PASSWORD
  const expectedContext = process.env.RESAVENUE_OTA_ID_CONTEXT
  if (!expectedUser || !expectedPassword) {
    console.error('RESAVENUE_OTA_USERNAME / RESAVENUE_OTA_PASSWORD are not set — refusing channel-manager requests.')
    return { ok: false, status: 503, remark: 'Channel manager access is not configured on this server' }
  }

  const creds = credentialsFrom(req, message)
  if (!creds) return { ok: false, status: 401, remark: 'Missing credentials: send POS.Username/Password or HTTP Basic auth' }

  const userOk = same(creds.user, expectedUser)
  const passOk = same(creds.password, expectedPassword)
  // ID_Context is only checked when one has been agreed with ResAvenue. The
  // guide's own update samples send it empty, so it is not a secret on its own.
  const contextOk = !expectedContext || same(creds.idContext, expectedContext)
  if (!userOk || !passOk || !contextOk) {
    console.warn(`[ota] rejected credentials for user "${creds.user.slice(0, 64)}" from ${req.ip}`)
    return { ok: false, status: 401, remark: 'Authentication failed' }
  }
  return { ok: true }
}

/* ---------- Envelope helpers ---------- */

const now = () => new Date().toISOString()

function str(v: unknown, max = 200): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : ''
}

/** The Status / Remark reply every update message and every failure uses. */
function statusReply(root: string, message: Record<string, unknown>, status: 'Success' | 'Failure', remark = '') {
  return {
    [root]: {
      EchoToken: str(message.EchoToken, 64),
      TimeStamp: now(),
      Target: str(message.Target) || 'Production',
      Version: str(message.Version, 16),
      Status: status,
      Remark: remark,
    },
  }
}

/** The POS block echoed back on fetch replies, password withheld. */
function posEcho(message: Record<string, unknown>) {
  const pos = (message.POS ?? {}) as Record<string, unknown>
  const requestor = (pos.RequestorID ?? {}) as Record<string, unknown>
  return {
    Username: str(requestor.User ?? pos.Username ?? pos.User, 190),
    Password: '',
    ID_Context: str(requestor.ID_Context ?? pos.ID_Context, 64),
  }
}

class OtaError extends Error {
  constructor(message: string, public httpStatus = 200) {
    super(message)
  }
}

/**
 * The root key must be exactly the one the endpoint expects; the dispatcher
 * below is the only place the key chooses the handler.
 */
function messageOf(req: Request, root: string): Record<string, unknown> {
  const body = req.body
  const message = body && typeof body === 'object' ? (body as Record<string, unknown>)[root] : undefined
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new OtaError(`Request body must be a JSON object with a "${root}" element`)
  }
  return message as Record<string, unknown>
}

/**
 * Start / End (or FromDate / ToDate) as an inclusive list of dates. End is
 * "Y-N" in the guide — optional — and defaults to Start. Bounded so a typo in
 * a year cannot ask for a million rows.
 */
function dateRangeOf(start: unknown, end: unknown, label = 'Start'): string[] {
  const s = str(start, 10)
  const e = end === undefined || end === null || end === '' ? s : str(end, 10)
  if (!isIsoDate(s)) throw new OtaError(`${label} must be a date in YYYY-MM-DD format`)
  if (!isIsoDate(e)) throw new OtaError(`End must be a date in YYYY-MM-DD format`)
  if (e < s) throw new OtaError(`End (${e}) is before ${label} (${s})`)
  if (daysBetween(s, e) + 1 > MAX_RANGE_DAYS) throw new OtaError(`Date range exceeds ${MAX_RANGE_DAYS} days`)
  return datesInclusive(s, e)
}

async function hotelOf(message: Record<string, unknown>): Promise<{ property: PropertyRecord; rooms: RoomTypeRecord[] }> {
  const code = message.HotelCode ?? message.PropertyId ?? message.HotelId
  if (code === undefined || code === null || String(code).trim() === '') {
    throw new OtaError('HotelCode is required')
  }
  const properties = await db.getAllProperties()
  const property = findPropertyByCode(properties, code)
  if (!property) throw new OtaError(`Unknown HotelCode "${str(code, 64)}"`)
  const rooms = await db.getRoomTypesByPropertyId(property.id)
  return { property, rooms }
}

function nonNegativeInt(v: unknown, label: string, max: number): number {
  if (v === undefined || v === null || v === '') throw new OtaError(`${label} is required`)
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new OtaError(`${label} must be a whole number of zero or more`)
  if (n > max) throw new OtaError(`${label} must not exceed ${max}`)
  return n
}

function optionalInt(v: unknown, label: string, max: number): number | null {
  if (v === undefined || v === null || v === '') return null
  return nonNegativeInt(v, label, max)
}

function amount(v: unknown, label: string): number {
  const n = Number(v)
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) throw new OtaError(`${label} must be a number`)
  if (n < RATE_MIN || n > RATE_MAX) throw new OtaError(`${label} must be between ${RATE_MIN} and ${RATE_MAX}`)
  return Math.round(n * 100) / 100
}

function optionalBool(v: unknown): boolean | null {
  if (v === undefined || v === null || v === '') return null
  return parseBoolean(v, false)
}

/* ---------- Handlers ---------- */

type Handler = (req: Request, message: Record<string, unknown>) => Promise<unknown>

/**
 * Wraps a handler with parsing, authentication and the guide's reply
 * discipline: business failures are HTTP 200 with Status "Failure" so the
 * channel manager reads the Remark rather than retrying a transport error;
 * authentication failures are 401 and a missing configuration 503.
 */
function otaEndpoint(root: string, replyRoot: string, handler: Handler): RequestHandler {
  return async (req, res) => {
    let message: Record<string, unknown> = {}
    try {
      message = messageOf(req, root)
      const auth = authenticate(req, message)
      if (!auth.ok) {
        return res.status(auth.status).json(statusReply(replyRoot, message, 'Failure', auth.remark))
      }
      res.json(await handler(req, message))
    } catch (err: any) {
      if (err instanceof OtaError) {
        return res.status(err.httpStatus).json(statusReply(replyRoot, message, 'Failure', err.message))
      }
      console.error(`[ota] ${root} failed:`, err)
      res.status(500).json(statusReply(replyRoot, message, 'Failure', 'Internal error'))
    }
  }
}

/** Every message may arrive by POST or PUT — the guide allows both. */
function mount(path: string, handler: RequestHandler) {
  otaRouter.post(path, handler)
  otaRouter.put(path, handler)
}

/* ---- II. Property Details — Fetch ---- */

const RATE_VALID_YEARS = 3

const propertyDetails: Handler = async (_req, message) => {
  const { property, rooms } = await hotelOf(message)
  const today = new Date().toISOString().slice(0, 10)
  // A rate plan is "valid" for as long as the site sells it. The guide wants a
  // window, so it gets a rolling one — from the 1st of this year, three years
  // out — rather than a hard date somebody has to remember to move.
  const validFrom = `${today.slice(0, 4)}-01-01`
  const validTo = `${Number(today.slice(0, 4)) + RATE_VALID_YEARS}-12-31`

  return {
    OTA_HotelDetailsRS: [
      {
        HotelDetail: { hotel_id: propertyOtaCode(property), hotel_name: property.name },
        RoomTypes: rooms.map((room) => ({
          room_id: roomOtaCode(room),
          room_name: room.name,
          // Every rate on the site is quoted for two adults.
          base_occupancy: 2,
          max_occupancy: Number(room.max_guests) || 2,
          room_status: room.is_available ? 'active' : 'inactive',
          RatePlans: MEAL_PLANS.map((plan) => ({
            rate_id: ratePlanOtaCode(room, plan),
            rate_name: `${room.name} - ${RATE_PLAN_LABEL[plan]}`,
            valid_from: validFrom,
            valid_to: validTo,
            rate_status: room.is_available ? 'active' : 'inactive',
            min_rate: RATE_MIN,
            max_rate: RATE_MAX,
          })),
        })),
      },
    ],
  }
}

/* ---- III. Inventory Fetch ---- */

const inventoryFetch: Handler = async (_req, message) => {
  const { property, rooms } = await hotelOf(message)
  const dates = dateRangeOf(message.Start, message.End)
  const codes = parseCodeList(message.InvCodes)
  if (!codes.length) throw new OtaError('InvCodes is required')

  const targets = codes.map((code) => {
    const room = findRoomByCode(rooms, code)
    if (!room) throw new OtaError(`Unknown InvCode "${code}" for hotel ${propertyOtaCode(property)}`)
    return room
  })
  const ids = targets.map((r) => r.id)
  const rules = await db.getInventoryDays(ids, dates)
  const ruleMap = new Map<string, InventoryDayRecord>(rules.map((r) => [`${r.room_type_id}|${r.stay_date}`, r]))
  const held = await db.getHeldUnitsByNight(ids, dates)

  return {
    OTA_HotelInventoryRS: {
      POS: posEcho(message),
      TimeStamp: now(),
      EchoToken: str(message.EchoToken, 64),
      HotelName: property.name,
      HotelCode: String(propertyOtaCode(property)),
      Inventories: targets.map((room) => ({
        InvCode: roomOtaCode(room),
        Inventory: dates.map((date) => {
          const rule = ruleMap.get(`${room.id}|${date}`)
          const free = capacityFor(rule, room.total_units) - (held.get(`${room.id}|${date}`) || 0)
          return {
            Date: date,
            // What is still sellable, not the ceiling: soft holds and paid
            // bookings both take a unit off the count ResAvenue sees.
            InvCount: Math.max(0, free),
            StopSell: Boolean(rule?.stop_sell) || !room.is_available,
            CloseOnArrival: Boolean(rule?.close_on_arrival),
            CloseOnDeparture: Boolean(rule?.close_on_departure),
            CutOff: Number(rule?.cut_off) || 0,
          }
        }),
      })),
    },
  }
}

/* ---- IV. Inventory Update ---- */

const inventoryUpdate: Handler = async (_req, message) => {
  const { property, rooms } = await hotelOf(message)
  const items = Array.isArray(message.Inventories) ? message.Inventories : []
  if (!items.length) throw new OtaError('Inventories must be a non-empty array')

  // Validate the whole message before writing any of it: a bad second entry
  // must not leave the first one applied.
  const rows: Array<Partial<InventoryDayRecord> & { room_type_id: string; stay_date: string }> = []
  items.forEach((item: any, i: number) => {
    const where = `Inventories[${i}]`
    const control = item?.StatusApplicationControl ?? {}
    const counts = item?.InvCounts ?? {}
    const room = findRoomByCode(rooms, control.InvTypeCode)
    if (!room) throw new OtaError(`${where}: unknown InvTypeCode "${str(control.InvTypeCode, 64)}" for hotel ${propertyOtaCode(property)}`)
    const dates = dateRangeOf(control.Start, control.End)
    const days = parseDayFilter(counts.Days)

    const invCount = optionalInt(counts.InvCount, `${where}.InvCount`, INVENTORY_MAX)
    const cutOff = optionalInt(counts.CutOff, `${where}.CutOff`, 365)
    const stopSell = optionalBool(counts.StopSell)
    const closeOnArrival = optionalBool(counts.CloseOnArrival)
    const closeOnDeparture = optionalBool(counts.CloseOnDeparture)
    if (invCount === null && cutOff === null && stopSell === null && closeOnArrival === null && closeOnDeparture === null) {
      throw new OtaError(`${where}.InvCounts carries nothing to update`)
    }

    for (const date of dates) {
      if (!days.has(dayOfWeek(date))) continue
      rows.push({
        room_type_id: room.id,
        stay_date: date,
        ...(invCount !== null ? { inv_count: invCount } : {}),
        ...(cutOff !== null ? { cut_off: cutOff } : {}),
        ...(stopSell !== null ? { stop_sell: stopSell } : {}),
        ...(closeOnArrival !== null ? { close_on_arrival: closeOnArrival } : {}),
        ...(closeOnDeparture !== null ? { close_on_departure: closeOnDeparture } : {}),
      })
    }
  })

  const written = await db.upsertInventoryDays(rows)
  console.log(`[ota] inventory update: ${written} room-night(s) for ${property.slug}`)
  return statusReply('OTA_HotelInvCountNotifRS', message, 'Success')
}

/* ---- V. Rate Fetch ---- */

const rateFetch: Handler = async (_req, message) => {
  const { property, rooms } = await hotelOf(message)
  const dates = dateRangeOf(message.Start, message.End)
  const codes = parseCodeList(message.RateCodes)
  if (!codes.length) throw new OtaError('RateCodes is required')

  const targets = codes.map((code) => {
    const hit = findRatePlanByCode(rooms, code)
    if (!hit) throw new OtaError(`Unknown RateCode "${code}" for hotel ${propertyOtaCode(property)}`)
    return hit
  })
  const ids = Array.from(new Set(targets.map((t) => t.room.id)))
  const plans = Array.from(new Set(targets.map((t) => t.plan)))
  const rateRows = await db.getRateDays(ids, plans, dates)
  const rateMap = new Map<string, RateDayRecord>(rateRows.map((r) => [`${r.room_type_id}|${r.meal_plan}|${r.stay_date}`, r]))
  const invRows = await db.getInventoryDays(ids, dates)
  const invMap = new Map<string, InventoryDayRecord>(invRows.map((r) => [`${r.room_type_id}|${r.stay_date}`, r]))

  return {
    OTA_HotelRateRS: {
      POS: posEcho(message),
      TimeStamp: now(),
      EchoToken: str(message.EchoToken, 64),
      HotelName: property.name,
      HotelCode: String(propertyOtaCode(property)),
      Rates: targets.map(({ room, plan }) => ({
        RateCode: ratePlanOtaCode(room, plan),
        Rate: dates.map((date) => {
          const eff = effectiveNightRate(property, room, plan, date, rateMap.get(`${room.id}|${plan}|${date}`))
          const inv = invMap.get(`${room.id}|${date}`)
          return {
            Date: date,
            Single: eff.single,
            Double: eff.double,
            Triple: eff.triple,
            Quad: eff.quad,
            ExtraPax: eff.extraAdult,
            ExtraChild: eff.extraChild,
            MinStay: eff.minStay,
            MaxStay: eff.maxStay,
            // A rate is closed if the plan is closed, the room is closed that
            // night, or the category is marked sold out on the dashboard.
            StopSell: eff.stopSell || Boolean(inv?.stop_sell) || !room.is_available,
          }
        }),
      })),
    },
  }
}

/* ---- VI. Rate Update ---- */

const rateUpdate: Handler = async (_req, message) => {
  const { property, rooms } = await hotelOf(message)
  const items = Array.isArray(message.RateAmountMessages) ? message.RateAmountMessages : []
  if (!items.length) throw new OtaError('RateAmountMessages must be a non-empty array')

  const rows: Array<Partial<RateDayRecord> & { room_type_id: string; meal_plan: MealPlan; stay_date: string }> = []
  items.forEach((item: any, i: number) => {
    const where = `RateAmountMessages[${i}]`
    const control = item?.StatusApplicationControl ?? {}
    const rates = item?.Rates ?? {}

    const room = findRoomByCode(rooms, control.InvTypeCode)
    if (!room) throw new OtaError(`${where}: unknown InvTypeCode "${str(control.InvTypeCode, 64)}" for hotel ${propertyOtaCode(property)}`)
    const hit = findRatePlanByCode(rooms, control.RatePlanCode)
    if (!hit) throw new OtaError(`${where}: unknown RatePlanCode "${str(control.RatePlanCode, 64)}" for hotel ${propertyOtaCode(property)}`)
    if (hit.room.id !== room.id) {
      throw new OtaError(`${where}: RatePlanCode ${str(control.RatePlanCode, 64)} does not belong to InvTypeCode ${str(control.InvTypeCode, 64)}`)
    }
    const dates = dateRangeOf(control.Start, control.End)
    const days = parseDayFilter(rates.Days)

    // BaseByGuestAmts: one amount per occupancy, 1 to 4 guests.
    const byGuests: Partial<Record<1 | 2 | 3 | 4, number>> = {}
    const base = Array.isArray(rates.BaseByGuestAmts) ? rates.BaseByGuestAmts : []
    base.forEach((b: any, j: number) => {
      const n = Number(b?.NumberOfGuests)
      if (![1, 2, 3, 4].includes(n)) throw new OtaError(`${where}.BaseByGuestAmts[${j}].NumberOfGuests must be 1, 2, 3 or 4`)
      byGuests[n as 1 | 2 | 3 | 4] = amount(b?.Amount, `${where}.BaseByGuestAmts[${j}].Amount`)
    })

    // AdditionalGuestAmounts: GuestType names the head — "ExtraAdult1",
    // "Child1" in the sample. Matched by word so "Adult" / "ExtraChild" work too.
    let extraAdult: number | null = null
    let extraChild: number | null = null
    const additional = Array.isArray(rates.AdditionalGuestAmounts) ? rates.AdditionalGuestAmounts : []
    additional.forEach((a: any, j: number) => {
      const type = str(a?.GuestType, 32).toLowerCase()
      const value = amount(a?.Amount, `${where}.AdditionalGuestAmounts[${j}].Amount`)
      if (type.includes('child')) extraChild = value
      else if (type.includes('adult') || type.includes('pax')) extraAdult = value
      else throw new OtaError(`${where}.AdditionalGuestAmounts[${j}].GuestType "${str(a?.GuestType, 32)}" is not recognised (use ExtraAdult1 or Child1)`)
    })

    const minStay = optionalInt(rates.MinStay, `${where}.MinStay`, 365)
    const maxStay = optionalInt(rates.MaxStay, `${where}.MaxStay`, 365)
    if (minStay !== null && maxStay !== null && maxStay > 0 && maxStay < minStay) {
      throw new OtaError(`${where}: MaxStay (${maxStay}) is less than MinStay (${minStay})`)
    }
    const stopSell = optionalBool(rates.StopSell)

    const hasAmount = Object.keys(byGuests).length > 0 || extraAdult !== null || extraChild !== null
    if (!hasAmount && minStay === null && maxStay === null && stopSell === null) {
      throw new OtaError(`${where}.Rates carries nothing to update`)
    }

    for (const date of dates) {
      if (!days.has(dayOfWeek(date))) continue
      rows.push({
        room_type_id: room.id,
        meal_plan: hit.plan,
        stay_date: date,
        ...(byGuests[1] !== undefined ? { single: byGuests[1] } : {}),
        ...(byGuests[2] !== undefined ? { double: byGuests[2] } : {}),
        ...(byGuests[3] !== undefined ? { triple: byGuests[3] } : {}),
        ...(byGuests[4] !== undefined ? { quad: byGuests[4] } : {}),
        ...(extraAdult !== null ? { extra_adult: extraAdult } : {}),
        ...(extraChild !== null ? { extra_child: extraChild } : {}),
        ...(minStay !== null ? { min_stay: minStay } : {}),
        ...(maxStay !== null ? { max_stay: maxStay } : {}),
        ...(stopSell !== null ? { stop_sell: stopSell } : {}),
      })
    }
  })

  const written = await db.upsertRateDays(rows)
  console.log(`[ota] rate update: ${written} rate-night(s) for ${property.slug}`)
  return statusReply('OTA_HotelRateAmountNotifRS', message, 'Success')
}

/* ---- VII.i Booking Pull ---- */

const bookingPull: Handler = async (_req, message) => {
  const { property, rooms } = await hotelOf(message)
  const from = str(message.FromDate ?? message.Start, 10)
  // ToDate is "Y-N": optional, and a pull with no upper bound means "up to
  // today" rather than "the same day as FromDate", which would miss everything.
  const to = message.ToDate ?? message.End ? str(message.ToDate ?? message.End, 10) : new Date().toISOString().slice(0, 10)
  if (!isIsoDate(from)) throw new OtaError('FromDate must be a date in YYYY-MM-DD format')
  if (!isIsoDate(to)) throw new OtaError('ToDate must be a date in YYYY-MM-DD format')
  if (to < from) throw new OtaError(`ToDate (${to}) is before FromDate (${from})`)
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new OtaError(`Date range exceeds ${MAX_RANGE_DAYS} days`)

  const bookings = await db.getBookingsForChannelPull(property.id, from, to)
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const reservations = bookings.map((b) => channelManager.buildHotelReservation(b, property, roomById.get(b.room_type_id) ?? null))

  // Pulled is delivered. Only rows still owed are marked, so a re-pull of an
  // old window does not rewrite history; and it is not one of OUR attempts.
  for (const b of bookings) {
    if (b.cm_sync_status === 'PENDING' || b.cm_sync_status === 'FAILED') {
      await db.markChannelSync(b.id, 'SENT', null, false)
    }
  }

  // The guide's pull reply is rooted at the REQUEST name, and wraps each
  // reservation in its own { HotelReservation: [...] } — reproduced as is.
  return {
    OTA_HotelResNotifRQ: {
      Target: str(message.Target) || 'Production',
      Version: '1.0',
      EchoToken: str(message.EchoToken, 64),
      HotelReservations: reservations.map((r) => ({ HotelReservation: [r] })),
      TimeStamp: now(),
    },
  }
}

/* ---------- Routes ---------- */

const endpoints: Array<{ root: string; reply: string; path: string; handler: Handler }> = [
  { root: 'OTA_HotelDetailsRQ', reply: 'OTA_HotelDetailsRS', path: '/property-details', handler: propertyDetails },
  { root: 'OTA_HotelInventoryRQ', reply: 'OTA_HotelInventoryRS', path: '/inventory/fetch', handler: inventoryFetch },
  { root: 'OTA_HotelInvCountNotifRQ', reply: 'OTA_HotelInvCountNotifRS', path: '/inventory/update', handler: inventoryUpdate },
  { root: 'OTA_HotelRateRQ', reply: 'OTA_HotelRateRS', path: '/rates/fetch', handler: rateFetch },
  { root: 'OTA_HotelRateAmountNotifRQ', reply: 'OTA_HotelRateAmountNotifRS', path: '/rates/update', handler: rateUpdate },
  { root: 'OTA_HotelResNotifRQ', reply: 'OTA_HotelResNotifRS', path: '/bookings/pull', handler: bookingPull },
]

for (const e of endpoints) mount(e.path, otaEndpoint(e.root, e.reply, e.handler))

/** One URL for everything, routed on the root key of the body. */
const dispatch: RequestHandler = (req, res, next) => {
  const body = req.body
  const keys = body && typeof body === 'object' ? Object.keys(body) : []
  const e = endpoints.find((x) => keys.includes(x.root))
  if (!e) {
    return res.status(200).json({
      OTA_ErrorRS: {
        TimeStamp: now(),
        Status: 'Failure',
        Remark: `Unrecognised message. Expected one of: ${endpoints.map((x) => x.root).join(', ')}`,
      },
    })
  }
  return otaEndpoint(e.root, e.reply, e.handler)(req, res, next)
}
mount('/resavenue', dispatch)
mount('/', dispatch)

/**
 * GET /api/ota/codes — the code table for whoever configures ResAvenue's side.
 *
 * Authenticated the same way (HTTP Basic, since a GET has no body) so the
 * hotel's room list is not published to the world; it is the one thing the
 * person doing the mapping needs and the guide has no message for it.
 */
otaRouter.get('/codes', async (req, res) => {
  const auth = authenticate(req, {})
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.remark })
  const properties = await db.getAllProperties()
  const out = []
  for (const p of properties) {
    const rooms = await db.getRoomTypesByPropertyId(p.id)
    out.push({
      HotelCode: propertyOtaCode(p),
      HotelName: p.name,
      slug: p.slug,
      RoomTypes: rooms.map((r) => ({
        InvTypeCode: roomOtaCode(r),
        room_name: r.name,
        total_units: r.total_units,
        RatePlans: MEAL_PLANS.map((plan) => ({ RatePlanCode: ratePlanOtaCode(r, plan), rate_name: `${r.name} - ${RATE_PLAN_LABEL[plan]}` })),
      })),
    })
  }
  res.json({ success: true, data: out })
})
