import { Pool, types as pgTypes } from 'pg'
import { randomBytes } from 'crypto'
import {
  PropertyRecord, RoomTypeRecord, BookingRecord, EnquiryRecord, ChatLogRecord, MealPlan, UserRecord,
  PropertyImageRecord, InventoryDayRecord, RateDayRecord,
} from '../types'
import { seedProperties, seedRoomTypes } from '../data/seed'
import { computeStayBreakdown, mealOffsetFor, baseRoomRateFor, chargeableGuestsFor, policyFor } from '../lib/pricing'
import { nightsBetween, todayIso } from '../lib/nights'
import { capacityFor, stayRestrictionProblem, nightOverridesFrom, toIsoDate } from '../lib/channel'

/**
 * Crockford base32 minus the characters that get misread over the phone
 * (I, L, O, U). `QD-` + 8 symbols is ~40 bits — enough that codes neither
 * collide nor can be walked. The old scheme was `QD-` + 4 digits: 9,000 codes
 * total, a ~50% collision chance by the 110th booking, and trivially
 * enumerable by anyone wanting other guests' invoices.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateBookingCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return `QD-${out}`
}

/**
 * Return NUMERIC columns as JavaScript numbers.
 *
 * node-postgres hands back NUMERIC as a *string* by default, because the type
 * is arbitrary-precision and cannot always survive a float. Every price, rate
 * and rating in this schema is NUMERIC, so the API served `"1500.00"` and
 * `"4.60"` the moment a real database was connected.
 *
 * That took the whole site down. `rating.toFixed(1)` threw
 * "toFixed is not a function", React unmounted, and every page rendered blank.
 * `hotel.price + roomOffset` was quietly worse — string concatenation, so a
 * 1500 room with a 1000 upgrade would have quoted "15001000".
 *
 * None of it appeared in development or in the tests, because the in-memory
 * store holds real numbers. It only existed against PostgreSQL.
 *
 * 1700 is NUMERIC. Precision loss is not a concern here: these are rupee
 * amounts and 0-5 ratings, nowhere near the range where a double stops being
 * exact. Anything genuinely arbitrary-precision must not use this parser.
 */
pgTypes.setTypeParser(1700, (v: string) => (v === null ? null : parseFloat(v)))
// 20 is INT8/BIGINT, also stringified by default. Counts and ids here are far
// below Number.MAX_SAFE_INTEGER.
pgTypes.setTypeParser(20, (v: string) => (v === null ? null : parseInt(v, 10)))

/**
 * TLS settings for a Postgres connection.
 *
 * node-postgres connects in plaintext unless told otherwise, and RDS refuses
 * that outright — Postgres 16 and later ship with `rds.force_ssl` on, so the
 * server answers with:
 *
 *   no pg_hba.conf entry for host "...", user "...", database "...",
 *   no encryption
 *
 * which reads like a firewall or credentials problem and is neither. It cost a
 * deploy to find, precisely because `psql` negotiates TLS by default and so
 * connects happily with the identical URL — the manual check passes while the
 * application cannot start.
 *
 * Localhost is exempt: a dev Postgres and the CI container have no certificate.
 *
 * `rejectUnauthorized: false` encrypts the connection without verifying the
 * server certificate. That stops passwords and guest data crossing the network
 * in the clear, which is the immediate need, but it does not defend against an
 * active man-in-the-middle. Verifying properly means shipping Amazon's RDS root
 * CA bundle and pointing `ca` at it — worth doing before this holds real
 * bookings.
 */
function sslFor(connectionString: string): { rejectUnauthorized: boolean; ca?: string } | false {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString)
  if (isLocal) return false
  // An explicit sslmode=disable in the URL wins, so a deployment that genuinely
  // cannot use TLS still has a way out.
  if (/[?&]sslmode=disable\b/.test(connectionString)) return false
  return { 
    rejectUnauthorized: true,
    ca: require('fs').readFileSync(require('path').join(__dirname, 'global-bundle.pem')).toString()
  }
}

// DatabaseEngine abstraction layer providing seamless support for real PostgreSQL via pg Pool
// or structured in-memory ACID store when DATABASE_URL is not set (for zero-config local dev/tests).

/**
 * Guards lookups against UUID primary keys. Postgres raises
 * "invalid input syntax for type uuid" for a malformed comparison value instead
 * of returning zero rows, so callers that mean "find or 404" must screen first.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: string): boolean => UUID_RE.test(value)

export class DatabaseEngine {
  /** Public so the migration runner and webhook lookups can reach it directly. */
  public pool: Pool | null = null
  public useInMemory: boolean

  // In-Memory state store for testing without active PostgreSQL cloud instance
  public memoryProperties: Map<string, PropertyRecord> = new Map()
  public memoryRoomTypes: Map<string, RoomTypeRecord> = new Map()
  /** Uploaded photography, keyed by image id. */
  public memoryPropertyImages: Map<string, PropertyImageRecord> = new Map()
  public memoryBookings: Map<string, BookingRecord> = new Map()
  public memoryEnquiries: Map<string, EnquiryRecord> = new Map()
  public memoryChatLogs: Map<string, ChatLogRecord> = new Map()
  public memoryUsers: Map<string, UserRecord> = new Map()
  /** Night-level holds: `${roomTypeId}|${YYYY-MM-DD}` → [{ bookingId, units }]. */
  public memoryNightHolds: Map<string, Array<{ bookingId: string; units: number }>> = new Map()
  /** Admin-edited copy overrides, keyed the same way as the site_content table. */
  public memorySiteContent: Map<string, string> = new Map()
  /** Mirror of admin_credentials. Null until the PIN is changed from the env default. */
  public memoryAdminPinHash: string | null = null
  /** Channel-manager inventory per night: `${roomTypeId}|${YYYY-MM-DD}`. */
  public memoryInventoryDays: Map<string, InventoryDayRecord> = new Map()
  /** Channel-manager rates per night: `${roomTypeId}|${mealPlan}|${YYYY-MM-DD}`. */
  public memoryRateDays: Map<string, RateDayRecord> = new Map()

  constructor() {
    const dbUrl = process.env.DATABASE_URL
    if (dbUrl && dbUrl !== 'in-memory') {
      this.useInMemory = false
      this.pool = new Pool({ connectionString: dbUrl, ssl: sslFor(dbUrl) })
    } else {
      this.useInMemory = true
      this.initializeInMemorySeed()
    }
  }

  /**
   * Does the storage this process is actually using answer a query?
   *
   * `useInMemory` is decided once in the constructor and never revisited, so
   * every other method in this class trusts it. Nothing anywhere asks whether
   * the Postgres behind it is still there — which is how the app can serve the
   * 9 seeded properties, accept bookings and issue booking codes while its
   * database is unreachable, or absent entirely. `/api/health` is the one
   * caller that must not trust `useInMemory`; it has to ask.
   */
  public async ping(): Promise<{ storage: 'postgres' | 'in-memory'; reachable: boolean; error?: string }> {
    if (this.useInMemory || !this.pool) {
      // The maps are this process's own heap. If we are running at all, they
      // are reachable — the question that matters for in-memory is not whether
      // it responds but whether it should be in use at all, and that is the
      // caller's to judge.
      return { storage: 'in-memory', reachable: true }
    }
    try {
      await this.pool.query('SELECT 1')
      return { storage: 'postgres', reachable: true }
    } catch (err: any) {
      return { storage: 'postgres', reachable: false, error: err?.message || String(err) }
    }
  }

  public initializeInMemorySeed() {
    this.memoryProperties.clear()
    this.memoryRoomTypes.clear()
    this.memoryPropertyImages.clear()
    this.memoryBookings.clear()
    this.memoryEnquiries.clear()
    this.memoryChatLogs.clear()
    this.memoryNightHolds.clear()
    this.memoryUsers.clear()
    this.memorySiteContent.clear()
    this.memoryInventoryDays.clear()
    this.memoryRateDays.clear()

    seedProperties.forEach((p) => {
      this.memoryProperties.set(p.id, { ...p })
    })
    seedRoomTypes.forEach((r) => {
      this.memoryRoomTypes.set(r.id, { ...r })
    })
  }

  public async getProperties(): Promise<PropertyRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM properties WHERE is_active = true')
      return res.rows
    }
    return Array.from(this.memoryProperties.values()).filter((p) => p.is_active)
  }

  public async getPropertiesWithRooms(): Promise<Array<{ property: PropertyRecord; rooms: RoomTypeRecord[] }>> {
    const props = await this.getProperties()
    if (!this.useInMemory && this.pool) {
      const allRooms = await this.pool.query(DatabaseEngine.ROOM_SELECT)
      return props.map((p) => ({
        property: p,
        rooms: allRooms.rows.filter((r) => r.property_id === p.id),
      }))
    }
    const allRooms = Array.from(this.memoryRoomTypes.values()).map((r) => this.withTonightAvailability(r))
    return props.map((p) => ({
      property: p,
      rooms: allRooms.filter((r) => r.property_id === p.id),
    }))
  }

  public async getPropertyBySlug(slug: string): Promise<{ property: PropertyRecord | null; roomTypes: RoomTypeRecord[] }> {
    if (!this.useInMemory && this.pool) {
      const propRes = await this.pool.query('SELECT * FROM properties WHERE slug = $1 AND is_active = true', [slug])
      if (propRes.rows.length === 0) return { property: null, roomTypes: [] }
      const prop: PropertyRecord = propRes.rows[0]
      const roomsRes = await this.pool.query(`${DatabaseEngine.ROOM_SELECT} WHERE rt.property_id = $1`, [prop.id])
      return { property: prop, roomTypes: roomsRes.rows }
    }
    const prop = Array.from(this.memoryProperties.values()).find((p) => p.slug === slug && p.is_active) || null
    if (!prop) return { property: null, roomTypes: [] }
    const rooms = Array.from(this.memoryRoomTypes.values())
      .filter((r) => r.property_id === prop.id)
      .map((r) => this.withTonightAvailability(r))
    return { property: prop, roomTypes: rooms }
  }

  /* ------------------------------------------------------------------
   * Property photography
   *
   * These rows override the build-time image glob in the frontend, which is
   * what makes a photo changeable without a redeploy. Ordered by sort_order so
   * the hotel controls which shot leads.
   * ------------------------------------------------------------------ */

  public async getPropertyImages(propertyId: string): Promise<PropertyImageRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM property_images WHERE property_id = $1 ORDER BY sort_order ASC, created_at ASC',
        [propertyId]
      )
      return res.rows
    }
    return Array.from(this.memoryPropertyImages.values())
      .filter((i) => i.property_id === propertyId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  public async addPropertyImage(
    img: Omit<PropertyImageRecord, 'id' | 'sort_order' | 'created_at'> & { sort_order?: number }
  ): Promise<PropertyImageRecord> {
    // Append by default: a new upload goes to the end rather than silently
    // displacing whichever photo the hotel chose as its hero.
    const existing = await this.getPropertyImages(img.property_id)
    const order = img.sort_order ?? existing.length

    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `INSERT INTO property_images (property_id, url, thumb_url, storage_key, alt_text, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [img.property_id, img.url, img.thumb_url, img.storage_key, img.alt_text, order]
      )
      return res.rows[0]
    }
    const row: PropertyImageRecord = { ...img, id: randomBytes(8).toString('hex'), sort_order: order }
    this.memoryPropertyImages.set(row.id, row)
    return row
  }

  public async getPropertyImageById(id: string): Promise<PropertyImageRecord | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM property_images WHERE id = $1', [id])
      return res.rows[0] ?? null
    }
    return this.memoryPropertyImages.get(id) ?? null
  }

  public async deletePropertyImage(id: string): Promise<boolean> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('DELETE FROM property_images WHERE id = $1', [id])
      return (res.rowCount ?? 0) > 0
    }
    return this.memoryPropertyImages.delete(id)
  }

  /** Reorders in one pass; ids not in the list keep their current position. */
  public async reorderPropertyImages(propertyId: string, orderedIds: string[]): Promise<void> {
    if (!this.useInMemory && this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        for (let i = 0; i < orderedIds.length; i++) {
          await client.query(
            'UPDATE property_images SET sort_order = $1 WHERE id = $2 AND property_id = $3',
            [i, orderedIds[i], propertyId]
          )
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      return
    }
    orderedIds.forEach((id, i) => {
      const row = this.memoryPropertyImages.get(id)
      if (row && row.property_id === propertyId) this.memoryPropertyImages.set(id, { ...row, sort_order: i })
    })
  }

  /** Lookup is case-insensitive: nobody expects Bob@x.com to be a second account. */
  public async getUserByEmail(email: string): Promise<UserRecord | null> {
    const key = email.trim().toLowerCase()
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [key])
      return res.rows[0] || null
    }
    return Array.from(this.memoryUsers.values()).find((u) => u.email.toLowerCase() === key) || null
  }

  public async getUserById(id: string): Promise<UserRecord | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id])
      return res.rows[0] || null
    }
    return this.memoryUsers.get(id) || null
  }

  public async createUser(payload: {
    fullName: string
    email: string
    phone?: string
    passwordHash: string
  }): Promise<UserRecord> {
    const email = payload.email.trim().toLowerCase()
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `INSERT INTO users (full_name, email, phone, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [payload.fullName, email, payload.phone || null, payload.passwordHash]
      )
      return res.rows[0]
    }
    const user: UserRecord = {
      id: `user-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      full_name: payload.fullName,
      email,
      phone: payload.phone,
      password_hash: payload.passwordHash,
      created_at: new Date(),
    }
    this.memoryUsers.set(user.id, user)
    return user
  }

  /**
   * A guest's own bookings. Matched by account id *or* email, so stays booked
   * as a guest before signing up still appear once they register with the same
   * address.
   */
  public async getBookingsForUser(userId: string, email: string): Promise<BookingRecord[]> {
    const key = email.trim().toLowerCase()
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM bookings
          WHERE user_id = $1 OR LOWER(guest_email) = $2
          ORDER BY created_at DESC`,
        [userId, key]
      )
      return res.rows
    }
    return Array.from(this.memoryBookings.values())
      .filter((b) => b.user_id === userId || (b.guest_email || '').toLowerCase() === key)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  /**
   * Units still sellable across every night of the stay — the tightest night
   * wins, since one full night blocks the whole range.
   */
  public async getAvailableUnits(roomTypeId: string, checkIn: string, checkOut: string): Promise<number> {
    const room = await this.getRoomTypeById(roomTypeId)
    if (!room) return 0

    const nights = nightsBetween(checkIn, checkOut)
    if (!nights.length) return room.total_units

    // A night the channel manager has closed, or an arrival/departure it has
    // closed, sells nothing — the same rule initiateBookingHold applies.
    const rules = await this.getInventoryDays([roomTypeId], [...nights, checkOut])
    const byDate = new Map<string, InventoryDayRecord>()
    rules.forEach((r) => byDate.set(r.stay_date, r))
    const problem = stayRestrictionProblem({ checkIn, checkOut, nights, today: todayIso(), inventory: byDate })
    if (problem) return 0

    const held = await this.getHeldUnitsByNight([roomTypeId], nights)
    return DatabaseEngine.freeUnitsAcross(nights, room.total_units, byDate, (d) => held.get(`${roomTypeId}|${d}`) || 0)
  }

  /**
   * Units sellable across every night: the tightest night wins, and each
   * night's ceiling is the channel manager's count where it has set one.
   */
  private static freeUnitsAcross(
    nights: string[],
    totalUnits: number,
    rules: Map<string, InventoryDayRecord>,
    heldOn: (date: string) => number
  ): number {
    let free = Number.POSITIVE_INFINITY
    for (const d of nights) {
      free = Math.min(free, capacityFor(rules.get(d), totalUnits) - heldOn(d))
    }
    return Math.max(0, Number.isFinite(free) ? free : totalUnits)
  }

  /** Units held per room per night, keyed `${roomTypeId}|${date}`. Soft holds count. */
  public async getHeldUnitsByNight(roomTypeIds: string[], dates: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!roomTypeIds.length || !dates.length) return out
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT room_type_id, to_char(stay_date, 'YYYY-MM-DD') AS stay_date, SUM(units)::int AS held
           FROM room_night_holds
          WHERE room_type_id = ANY($1) AND stay_date = ANY($2::date[])
          GROUP BY room_type_id, stay_date`,
        [roomTypeIds, dates]
      )
      res.rows.forEach((r: any) => out.set(`${r.room_type_id}|${r.stay_date}`, Number(r.held)))
      return out
    }
    for (const id of roomTypeIds) {
      for (const d of dates) {
        const held = (this.memoryNightHolds.get(`${id}|${d}`) || []).reduce((s, h) => s + h.units, 0)
        if (held) out.set(`${id}|${d}`, held)
      }
    }
    return out
  }

  /**
   * `available_units` is no longer a stored counter — it is derived per night.
   * Read paths report tonight's figure, which is what "available now" means on
   * the dashboard and in the chatbot. Date-specific answers use
   * getAvailableUnits().
   */
  private withTonightAvailability(room: RoomTypeRecord): RoomTypeRecord {
    const today = todayIso()
    const held = (this.memoryNightHolds.get(`${room.id}|${today}`) || []).reduce((s, h) => s + h.units, 0)
    const ceiling = capacityFor(this.memoryInventoryDays.get(`${room.id}|${today}`), room.total_units)
    return { ...room, available_units: Math.max(0, ceiling - held) }
  }

  /**
   * SQL mirror of withTonightAvailability, for the Postgres read paths. The
   * ceiling is tonight's channel-manager count where one exists, else the keys.
   */
  private static readonly ROOM_SELECT = `
    SELECT rt.*, GREATEST(0, COALESCE((
      SELECT d.inv_count FROM room_inventory_days d
       WHERE d.room_type_id = rt.id AND d.stay_date = CURRENT_DATE
    ), rt.total_units) - COALESCE((
      SELECT SUM(h.units)::int FROM room_night_holds h
       WHERE h.room_type_id = rt.id AND h.stay_date = CURRENT_DATE
    ), 0)) AS available_units
    FROM room_types rt`

  private releaseNightHoldsInMemory(bookingId: string): void {
    for (const [key, holds] of this.memoryNightHolds.entries()) {
      const kept = holds.filter((h) => h.bookingId !== bookingId)
      if (kept.length) this.memoryNightHolds.set(key, kept)
      else this.memoryNightHolds.delete(key)
    }
  }

  public async initiateBookingHold(payload: {
    propertySlug: string
    roomTypeSlug: string
    checkIn: string
    checkOut: string
    roomsCount: number
    guestsCount: number
    guestName: string
    guestPhone: string
    guestEmail?: string
    companyName?: string
    gstin?: string
    mealPlan?: MealPlan
    userId?: string
    /** Defaults to the whole party being adults when the caller omits the split. */
    adultsCount?: number
    childAges?: number[]
  }): Promise<{ success: boolean; booking?: BookingRecord; error?: string }> {
    if (new Date(payload.checkOut).getTime() <= new Date(payload.checkIn).getTime()) {
      return { success: false, error: 'Check-out date must be strictly after check-in date' }
    }

    // Occupancy is derived here, never trusted from the client — the extra-adult
    // charge is money, so the count that prices the stay must be the one the
    // server computed. Callers that predate the split (the AI concierge) send
    // only guestsCount; treat that whole party as adults.
    //
    // The rate and the free-child age come from the property row, which the
    // admin panel writes — so the charge always reflects what the hotel has set,
    // and the resolved policy is read once per booking below.
    const childAges = Array.isArray(payload.childAges) ? payload.childAges.map(Number).filter((n) => !Number.isNaN(n)) : []
    const childrenCount = childAges.length
    const adultsCount = Math.max(1, Number(payload.adultsCount) || payload.guestsCount - childrenCount || 1)

    if (!this.useInMemory && this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        // Lock room type row for update
        const roomRes = await client.query(
          `SELECT rt.*, p.id as prop_id, p.base_price, p.weekend_surcharge_percent,
                  p.extra_adult_percent, p.child_free_under_age FROM room_types rt
           JOIN properties p ON p.id = rt.property_id
           WHERE p.slug = $1 AND rt.slug = $2 FOR UPDATE`,
          [payload.propertySlug, payload.roomTypeSlug]
        )
        if (roomRes.rows.length === 0) {
          await client.query('ROLLBACK')
          return { success: false, error: 'Property or room category not found' }
        }
        const room = roomRes.rows[0]
        if (!room.is_available) {
          await client.query('ROLLBACK')
          return { success: false, error: 'This room category is currently unavailable' }
        }

        // Availability is per night: find the busiest night in the requested
        // range. The ceiling on each night is the channel manager's count
        // where ResAvenue has set one, and its restrictions (stop sell, closed
        // arrival/departure, cut-off, min/max stay) are applied before the
        // count is even looked at.
        const nights = nightsBetween(payload.checkIn, payload.checkOut)
        const plan: MealPlan = payload.mealPlan ?? 'Room Only'
        const invRes = await client.query(
          `SELECT room_type_id, to_char(stay_date, 'YYYY-MM-DD') AS stay_date, inv_count, stop_sell,
                  close_on_arrival, close_on_departure, cut_off
             FROM room_inventory_days
            WHERE room_type_id = $1 AND stay_date = ANY($2::date[])`,
          [room.id, [...nights, payload.checkOut]]
        )
        const rateRes = await client.query(
          `SELECT room_type_id, meal_plan, to_char(stay_date, 'YYYY-MM-DD') AS stay_date, single, double, triple,
                  quad, extra_adult, extra_child, min_stay, max_stay, stop_sell
             FROM room_rate_days
            WHERE room_type_id = $1 AND meal_plan = $2 AND stay_date = ANY($3::date[])`,
          [room.id, plan, nights]
        )
        const invRules = new Map<string, InventoryDayRecord>(invRes.rows.map((r: any) => [r.stay_date, r]))
        const rateRules = new Map<string, RateDayRecord>(rateRes.rows.map((r: any) => [r.stay_date, r]))
        const restriction = stayRestrictionProblem({
          checkIn: payload.checkIn, checkOut: payload.checkOut, nights, today: todayIso(),
          inventory: invRules, rates: rateRules,
        })
        if (restriction) {
          await client.query('ROLLBACK')
          return { success: false, error: restriction }
        }

        const heldRes = await client.query(
          `SELECT to_char(stay_date, 'YYYY-MM-DD') AS stay_date, SUM(units)::int AS held
             FROM room_night_holds
            WHERE room_type_id = $1 AND stay_date = ANY($2::date[])
            GROUP BY stay_date`,
          [room.id, nights]
        )
        const heldByDate = new Map<string, number>(heldRes.rows.map((r: any) => [r.stay_date, Number(r.held)]))
        const free = DatabaseEngine.freeUnitsAcross(nights, room.total_units, invRules, (d) => heldByDate.get(d) || 0)
        if (free < payload.roomsCount) {
          await client.query('ROLLBACK')
          return { success: false, error: `Only ${Math.max(0, free)} units available for these dates` }
        }

        const policy = policyFor(room)
        const { extraAdults, extraChildren } = chargeableGuestsFor({
          adults: adultsCount,
          childAges,
          roomsCount: payload.roomsCount,
          childFreeUnderAge: policy.childFreeUnderAge,
          adultFromAge: policy.adultFromAge,
        })

        // The meal uplift is a percentage of this room's base rate, so the base
        // rate is passed explicitly rather than left to be inferred from the
        // row. The joined row does carry base_price and mealOffsetFor would find
        // it, but that is a property of this one query's SELECT list — being
        // explicit means a future change to the join cannot silently drop the
        // quote back onto the legacy flat columns.
        const breakdown = computeStayBreakdown({
          basePrice: Number(room.base_price),
          roomOffset: Number(room.price_offset),
          mealOffset: mealOffsetFor(
            payload.mealPlan,
            room,
            baseRoomRateFor(room.base_price, room.price_offset)
          ),
          weekendSurchargePercent: Number(room.weekend_surcharge_percent) || 0,
          checkIn: payload.checkIn,
          checkOut: payload.checkOut,
          roomsCount: payload.roomsCount,
          extraAdults,
          extraChildren,
          extraAdultPercent: policy.extraAdultPercent,
          childPercent: policy.childPercent,
          // Nights ResAvenue has priced take its figure; the rest stay computed.
          nightOverrides: nightOverridesFrom(
            { ...room, id: room.prop_id } as PropertyRecord, room, plan, nights, rateRules
          ),
        })
        const totalAmount = breakdown.total

        // Retry on the unique-violation the code column raises, rather than
        // assuming the generated code is free. A savepoint is required because
        // a failed statement otherwise aborts the surrounding transaction.
        let created: any = null
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
          await client.query('SAVEPOINT booking_code_attempt')
          try {
            const insertRes = await client.query(
              `INSERT INTO bookings (
                booking_code, user_id, property_id, room_type_id, guest_name, guest_phone, guest_email, company_name, gstin,
                check_in, check_out, rooms_count, guests_count, adults_count, children_count, child_ages, extra_adults,
                extra_adult_percent, extra_adult_charge, total_amount, meal_plan, booking_status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'PENDING_PAYMENT', NOW(), NOW()) RETURNING *`,
              [
                generateBookingCode(),
                payload.userId || null,
                room.prop_id,
                room.id,
                payload.guestName,
                payload.guestPhone,
                payload.guestEmail || null,
                payload.companyName || null,
                payload.gstin || null,
                payload.checkIn,
                payload.checkOut,
                payload.roomsCount,
                payload.guestsCount,
                adultsCount,
                childrenCount,
                JSON.stringify(childAges),
                extraAdults,
                breakdown.extraAdultPercent,
                breakdown.extraAdultChargePerNight,
                totalAmount,
                plan,
              ]
            )
            created = insertRes.rows[0]
            await client.query('RELEASE SAVEPOINT booking_code_attempt')
          } catch (insertErr: any) {
            await client.query('ROLLBACK TO SAVEPOINT booking_code_attempt')
            if (insertErr?.code !== '23505') throw insertErr
          }
        }
        if (!created) {
          await client.query('ROLLBACK')
          return { success: false, error: 'Could not allocate a booking code, please retry' }
        }
        // Claim each night of the stay for this booking.
        await client.query(
          `INSERT INTO room_night_holds (room_type_id, booking_id, stay_date, units)
           SELECT $1, $2, d::date, $3 FROM unnest($4::date[]) AS d`,
          [room.id, created.id, payload.roomsCount, nights]
        )

        await client.query('COMMIT')
        return { success: true, booking: created }
      } catch (err: any) {
        await client.query('ROLLBACK')
        return { success: false, error: err.message || 'Transaction error during booking hold' }
      } finally {
        client.release()
      }
    }

    // In-Memory ACID Transaction simulation
    const prop = Array.from(this.memoryProperties.values()).find((p) => p.slug === payload.propertySlug)
    if (!prop) return { success: false, error: 'Property not found' }
    const room = Array.from(this.memoryRoomTypes.values()).find(
      (r) => r.property_id === prop.id && r.slug === payload.roomTypeSlug
    )
    if (!room) return { success: false, error: 'Room category not found' }
    if (!room.is_available) {
      return { success: false, error: 'This room category is currently unavailable' }
    }

    // Availability is per night: the busiest night in the range caps the stay,
    // under the same channel-manager ceilings and restrictions as Postgres.
    const nights = nightsBetween(payload.checkIn, payload.checkOut)
    const plan: MealPlan = payload.mealPlan ?? 'Room Only'
    const invRules = new Map<string, InventoryDayRecord>()
    for (const d of [...nights, payload.checkOut]) {
      const r = this.memoryInventoryDays.get(`${room.id}|${d}`)
      if (r) invRules.set(d, r)
    }
    const rateRules = new Map<string, RateDayRecord>()
    for (const d of nights) {
      const r = this.memoryRateDays.get(`${room.id}|${plan}|${d}`)
      if (r) rateRules.set(d, r)
    }
    const restriction = stayRestrictionProblem({
      checkIn: payload.checkIn, checkOut: payload.checkOut, nights, today: todayIso(),
      inventory: invRules, rates: rateRules,
    })
    if (restriction) return { success: false, error: restriction }

    const free = DatabaseEngine.freeUnitsAcross(nights, room.total_units, invRules, (d) =>
      (this.memoryNightHolds.get(`${room.id}|${d}`) || []).reduce((s, h) => s + h.units, 0)
    )
    if (free < payload.roomsCount) {
      return { success: false, error: `Only ${Math.max(0, free)} units available for these dates` }
    }

    let bookingCode = generateBookingCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = Array.from(this.memoryBookings.values()).some((b) => b.booking_code === bookingCode)
      if (!taken) break
      bookingCode = generateBookingCode()
    }
    const policy = policyFor(prop)
    const { extraAdults, extraChildren } = chargeableGuestsFor({
      adults: adultsCount,
      childAges,
      roomsCount: payload.roomsCount,
      childFreeUnderAge: policy.childFreeUnderAge,
      adultFromAge: policy.adultFromAge,
    })

    // Same percentage, same base rate. This branch needs the explicit argument:
    // the in-memory store holds bare room rows with no property price on them,
    // so without it the quote would fall back to the stored rupee columns and
    // this path could drift from the Postgres one.
    const breakdown = computeStayBreakdown({
      basePrice: prop.base_price,
      roomOffset: room.price_offset,
      mealOffset: mealOffsetFor(
        payload.mealPlan,
        room,
        baseRoomRateFor(prop.base_price, room.price_offset)
      ),
      weekendSurchargePercent: prop.weekend_surcharge_percent,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      roomsCount: payload.roomsCount,
      extraAdults,
      extraChildren,
      extraAdultPercent: policy.extraAdultPercent,
      childPercent: policy.childPercent,
      nightOverrides: nightOverridesFrom(prop, room, plan, nights, rateRules),
    })
    const totalAmount = breakdown.total

    const bookingRecord: BookingRecord = {
      id: `booking-${Date.now()}-${randomBytes(4).toString('hex')}`,
      booking_code: bookingCode,
      user_id: payload.userId ?? null,
      property_id: prop.id,
      room_type_id: room.id,
      guest_name: payload.guestName,
      guest_phone: payload.guestPhone,
      guest_email: payload.guestEmail,
      company_name: payload.companyName,
      gstin: payload.gstin,
      check_in: payload.checkIn,
      check_out: payload.checkOut,
      rooms_count: payload.roomsCount,
      guests_count: payload.guestsCount,
      adults_count: adultsCount,
      children_count: childrenCount,
      child_ages: childAges,
      extra_adults: extraAdults,
      extra_adult_percent: breakdown.extraAdultPercent,
      extra_adult_charge: breakdown.extraAdultChargePerNight,
      total_amount: totalAmount,
      meal_plan: plan,
      payment_mode: 'INSTANT_FULL_PAYMENT',
      payment_status: 'PENDING',
      booking_status: 'PENDING_PAYMENT',
      created_at: new Date(),
      updated_at: new Date(),
      cm_sync_status: 'NONE',
      cm_res_status: null,
      cm_attempts: 0,
    }
    this.memoryBookings.set(bookingRecord.id, bookingRecord)

    // Claim each night of the stay for this booking.
    for (const d of nights) {
      const key = `${room.id}|${d}`
      const holds = this.memoryNightHolds.get(key) || []
      holds.push({ bookingId: bookingRecord.id, units: payload.roomsCount })
      this.memoryNightHolds.set(key, holds)
    }

    return { success: true, booking: bookingRecord }
  }

  public async getBookingByCode(bookingCode: string, guestPhone?: string): Promise<BookingRecord | null> {
    if (!this.useInMemory && this.pool) {
      const query = guestPhone
        ? 'SELECT * FROM bookings WHERE booking_code = $1 AND guest_phone = $2'
        : 'SELECT * FROM bookings WHERE booking_code = $1'
      const params = guestPhone ? [bookingCode, guestPhone] : [bookingCode]
      const res = await this.pool.query(query, params)
      return res.rows[0] || null
    }
    const booking = Array.from(this.memoryBookings.values()).find(
      (b) => b.booking_code === bookingCode && (!guestPhone || b.guest_phone === guestPhone)
    )
    return booking || null
  }

  public async getPropertyById(id: string): Promise<PropertyRecord | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM properties WHERE id = $1', [id])
      return res.rows[0] || null
    }
    return this.memoryProperties.get(id) || null
  }

  /**
   * Accepts either identifier, matching how the admin routes address a
   * property elsewhere — the panel holds slugs, scripts tend to hold ids.
   */
  public async getPropertyByIdOrSlug(idOrSlug: string): Promise<PropertyRecord | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM properties WHERE id = $1 OR slug = $1', [idOrSlug]
      )
      return res.rows[0] || null
    }
    return Array.from(this.memoryProperties.values())
      .find((p) => p.id === idOrSlug || p.slug === idOrSlug) || null
  }

  public async getRoomTypeById(id: string): Promise<RoomTypeRecord | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(`${DatabaseEngine.ROOM_SELECT} WHERE rt.id = $1`, [id])
      return res.rows[0] || null
    }
    const room = this.memoryRoomTypes.get(id)
    return room ? this.withTonightAvailability(room) : null
  }

  public async updateBookingPayment(
    bookingCode: string,
    payload: {
      paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
      bookingStatus?: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'
      razorpayOrderId?: string
      razorpayPaymentId?: string
      razorpayPaymentLinkId?: string
    }
  ): Promise<BookingRecord | null> {
    const existing = await this.getBookingByCode(bookingCode)
    if (!existing) return null

    const newPaymentStatus = payload.paymentStatus || existing.payment_status
    const newBookingStatus = payload.bookingStatus || existing.booking_status
    const rzpOrder = payload.razorpayOrderId !== undefined ? payload.razorpayOrderId : existing.razorpay_order_id
    const rzpPayment = payload.razorpayPaymentId !== undefined ? payload.razorpayPaymentId : existing.razorpay_payment_id
    const rzpLink = payload.razorpayPaymentLinkId !== undefined ? payload.razorpayPaymentLinkId : existing.razorpay_payment_link_id

    const shouldReleaseInventory =
      existing.booking_status === 'PENDING_PAYMENT' &&
      (newBookingStatus === 'CANCELLED' || newBookingStatus === 'EXPIRED' || newPaymentStatus === 'FAILED')

    // What the channel manager is owed. A hold becoming CONFIRMED owes a
    // Confirm; a confirmed booking becoming CANCELLED owes a Cancel. Expiries,
    // failed payments and cancelled holds were never a reservation to
    // ResAvenue and owe nothing. Null means "leave the sync columns alone".
    const owed: BookingRecord['cm_res_status'] =
      newBookingStatus === 'CONFIRMED' && existing.booking_status !== 'CONFIRMED'
        ? 'Confirm'
        : newBookingStatus === 'CANCELLED' && existing.booking_status === 'CONFIRMED'
          ? 'Cancel'
          : null

    if (!this.useInMemory && this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        if (shouldReleaseInventory) {
          // Dropping the night rows returns exactly the nights this booking held.
          await client.query(`DELETE FROM room_night_holds WHERE booking_id = $1`, [existing.id])
        }
        const res = await client.query(
          `UPDATE bookings SET
             payment_status = $1,
             booking_status = $2,
             razorpay_order_id = $3,
             razorpay_payment_id = $4,
             razorpay_payment_link_id = $5,
             updated_at = NOW(),
             cm_sync_status = CASE WHEN $7::text IS NULL THEN cm_sync_status ELSE 'PENDING' END,
             cm_res_status = COALESCE($7::text, cm_res_status),
             cm_attempts = CASE WHEN $7::text IS NULL THEN cm_attempts ELSE 0 END,
             cm_last_error = CASE WHEN $7::text IS NULL THEN cm_last_error ELSE NULL END
           WHERE booking_code = $6 RETURNING *`,
          [newPaymentStatus, newBookingStatus, rzpOrder || null, rzpPayment || null, rzpLink || null, bookingCode, owed]
        )
        await client.query('COMMIT')
        return res.rows[0] || null
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }

    // In-memory update
    if (shouldReleaseInventory) {
      this.releaseNightHoldsInMemory(existing.id)
    }

    existing.payment_status = newPaymentStatus
    existing.booking_status = newBookingStatus
    if (rzpOrder !== undefined) existing.razorpay_order_id = rzpOrder
    if (rzpPayment !== undefined) existing.razorpay_payment_id = rzpPayment
    if (rzpLink !== undefined) existing.razorpay_payment_link_id = rzpLink
    existing.updated_at = new Date()
    if (owed) {
      existing.cm_sync_status = 'PENDING'
      existing.cm_res_status = owed
      existing.cm_attempts = 0
      existing.cm_last_error = null
    }

    this.memoryBookings.set(existing.id, existing)
    return existing
  }

  /* ------------------------------------------------------------------
   * Channel manager (ResAvenue) — see routes/ota.ts and lib/channel.ts
   * ------------------------------------------------------------------ */

  /** Every property, active or not: the channel manager maps by code, not by listing. */
  public async getAllProperties(): Promise<PropertyRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM properties ORDER BY id ASC')
      return res.rows
    }
    return Array.from(this.memoryProperties.values())
  }

  /** Every category of one property, including ones marked sold out. */
  public async getRoomTypesByPropertyId(propertyId: string): Promise<RoomTypeRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(`${DatabaseEngine.ROOM_SELECT} WHERE rt.property_id = $1 ORDER BY rt.id ASC`, [propertyId])
      return res.rows
    }
    return Array.from(this.memoryRoomTypes.values())
      .filter((r) => r.property_id === propertyId)
      .map((r) => this.withTonightAvailability(r))
  }

  public async getInventoryDays(roomTypeIds: string[], dates: string[]): Promise<InventoryDayRecord[]> {
    if (!roomTypeIds.length || !dates.length) return []
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT room_type_id, to_char(stay_date, 'YYYY-MM-DD') AS stay_date, inv_count, stop_sell,
                close_on_arrival, close_on_departure, cut_off, updated_at
           FROM room_inventory_days
          WHERE room_type_id = ANY($1) AND stay_date = ANY($2::date[])`,
        [roomTypeIds, dates]
      )
      return res.rows
    }
    const out: InventoryDayRecord[] = []
    for (const id of roomTypeIds) {
      for (const d of dates) {
        const r = this.memoryInventoryDays.get(`${id}|${d}`)
        if (r) out.push(r)
      }
    }
    return out
  }

  /**
   * Merges: a field the channel manager did not send keeps its stored value,
   * so an update that only flips StopSell does not silently reset the count.
   * All rows land in one transaction — a rejected row rejects the message.
   */
  public async upsertInventoryDays(rows: Array<Partial<InventoryDayRecord> & { room_type_id: string; stay_date: string }>): Promise<number> {
    if (!rows.length) return 0
    if (!this.useInMemory && this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        for (const r of rows) {
          await client.query(
            `INSERT INTO room_inventory_days
               (room_type_id, stay_date, inv_count, stop_sell, close_on_arrival, close_on_departure, cut_off, updated_at)
             VALUES ($1, $2, $3, COALESCE($4, FALSE), COALESCE($5, FALSE), COALESCE($6, FALSE), COALESCE($7, 0), NOW())
             ON CONFLICT (room_type_id, stay_date) DO UPDATE SET
               inv_count = COALESCE(EXCLUDED.inv_count, room_inventory_days.inv_count),
               stop_sell = COALESCE($4, room_inventory_days.stop_sell),
               close_on_arrival = COALESCE($5, room_inventory_days.close_on_arrival),
               close_on_departure = COALESCE($6, room_inventory_days.close_on_departure),
               cut_off = COALESCE($7, room_inventory_days.cut_off),
               updated_at = NOW()`,
            [r.room_type_id, r.stay_date, r.inv_count ?? null, r.stop_sell ?? null,
             r.close_on_arrival ?? null, r.close_on_departure ?? null, r.cut_off ?? null]
          )
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      return rows.length
    }
    for (const r of rows) {
      const key = `${r.room_type_id}|${r.stay_date}`
      const prev = this.memoryInventoryDays.get(key)
      this.memoryInventoryDays.set(key, {
        room_type_id: r.room_type_id,
        stay_date: r.stay_date,
        inv_count: r.inv_count !== undefined ? r.inv_count : prev?.inv_count ?? null,
        stop_sell: r.stop_sell ?? prev?.stop_sell ?? false,
        close_on_arrival: r.close_on_arrival ?? prev?.close_on_arrival ?? false,
        close_on_departure: r.close_on_departure ?? prev?.close_on_departure ?? false,
        cut_off: r.cut_off ?? prev?.cut_off ?? 0,
        updated_at: new Date(),
      })
    }
    return rows.length
  }

  public async getRateDays(roomTypeIds: string[], plans: MealPlan[], dates: string[]): Promise<RateDayRecord[]> {
    if (!roomTypeIds.length || !plans.length || !dates.length) return []
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT room_type_id, meal_plan, to_char(stay_date, 'YYYY-MM-DD') AS stay_date, single, double, triple,
                quad, extra_adult, extra_child, min_stay, max_stay, stop_sell, updated_at
           FROM room_rate_days
          WHERE room_type_id = ANY($1) AND meal_plan = ANY($2) AND stay_date = ANY($3::date[])`,
        [roomTypeIds, plans, dates]
      )
      return res.rows
    }
    const out: RateDayRecord[] = []
    for (const id of roomTypeIds) {
      for (const plan of plans) {
        for (const d of dates) {
          const r = this.memoryRateDays.get(`${id}|${plan}|${d}`)
          if (r) out.push(r)
        }
      }
    }
    return out
  }

  /** Same merge rule as upsertInventoryDays: unsent fields keep their stored value. */
  public async upsertRateDays(rows: Array<Partial<RateDayRecord> & { room_type_id: string; meal_plan: MealPlan; stay_date: string }>): Promise<number> {
    if (!rows.length) return 0
    if (!this.useInMemory && this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        for (const r of rows) {
          await client.query(
            `INSERT INTO room_rate_days
               (room_type_id, meal_plan, stay_date, single, double, triple, quad, extra_adult, extra_child,
                min_stay, max_stay, stop_sell, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, FALSE), NOW())
             ON CONFLICT (room_type_id, meal_plan, stay_date) DO UPDATE SET
               single = COALESCE(EXCLUDED.single, room_rate_days.single),
               double = COALESCE(EXCLUDED.double, room_rate_days.double),
               triple = COALESCE(EXCLUDED.triple, room_rate_days.triple),
               quad = COALESCE(EXCLUDED.quad, room_rate_days.quad),
               extra_adult = COALESCE(EXCLUDED.extra_adult, room_rate_days.extra_adult),
               extra_child = COALESCE(EXCLUDED.extra_child, room_rate_days.extra_child),
               min_stay = COALESCE(EXCLUDED.min_stay, room_rate_days.min_stay),
               max_stay = COALESCE(EXCLUDED.max_stay, room_rate_days.max_stay),
               stop_sell = COALESCE($12, room_rate_days.stop_sell),
               updated_at = NOW()`,
            [r.room_type_id, r.meal_plan, r.stay_date, r.single ?? null, r.double ?? null, r.triple ?? null,
             r.quad ?? null, r.extra_adult ?? null, r.extra_child ?? null, r.min_stay ?? null, r.max_stay ?? null,
             r.stop_sell ?? null]
          )
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      return rows.length
    }
    for (const r of rows) {
      const key = `${r.room_type_id}|${r.meal_plan}|${r.stay_date}`
      const prev = this.memoryRateDays.get(key)
      const pick = <K extends keyof RateDayRecord>(k: K): RateDayRecord[K] =>
        (r[k] !== undefined && r[k] !== null ? r[k] : prev?.[k] ?? null) as RateDayRecord[K]
      this.memoryRateDays.set(key, {
        room_type_id: r.room_type_id,
        meal_plan: r.meal_plan,
        stay_date: r.stay_date,
        single: pick('single'),
        double: pick('double'),
        triple: pick('triple'),
        quad: pick('quad'),
        extra_adult: pick('extra_adult'),
        extra_child: pick('extra_child'),
        min_stay: pick('min_stay'),
        max_stay: pick('max_stay'),
        stop_sell: r.stop_sell ?? prev?.stop_sell ?? false,
        updated_at: new Date(),
      })
    }
    return rows.length
  }

  /**
   * Reservations the channel manager should know about, changed between two
   * dates inclusive. Only bookings that were ever confirmed — an unpaid hold
   * or an expiry was never a reservation to ResAvenue.
   */
  public async getBookingsForChannelPull(propertyId: string, fromDate: string, toDate: string, limit = 500): Promise<BookingRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM bookings
          WHERE property_id = $1 AND cm_res_status IS NOT NULL
            AND updated_at >= $2::date AND updated_at < ($3::date + INTERVAL '1 day')
          ORDER BY updated_at ASC LIMIT $4`,
        [propertyId, fromDate, toDate, limit]
      )
      return res.rows
    }
    const from = new Date(`${fromDate}T00:00:00Z`).getTime()
    const to = new Date(`${toDate}T00:00:00Z`).getTime() + 86_400_000
    return Array.from(this.memoryBookings.values())
      .filter((b) => b.property_id === propertyId && !!b.cm_res_status)
      .filter((b) => {
        const t = new Date(b.updated_at ?? b.created_at).getTime()
        return t >= from && t < to
      })
      .sort((a, b) => new Date(a.updated_at ?? a.created_at).getTime() - new Date(b.updated_at ?? b.created_at).getTime())
      .slice(0, limit)
  }

  /** Reservations still owed to the channel manager, oldest first. */
  public async getBookingsPendingChannelSync(maxAttempts: number, limit = 50): Promise<BookingRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM bookings
          WHERE cm_sync_status IN ('PENDING', 'FAILED') AND cm_attempts < $1
          ORDER BY updated_at ASC LIMIT $2`,
        [maxAttempts, limit]
      )
      return res.rows
    }
    return Array.from(this.memoryBookings.values())
      .filter((b) => (b.cm_sync_status === 'PENDING' || b.cm_sync_status === 'FAILED') && (b.cm_attempts ?? 0) < maxAttempts)
      .sort((a, b) => new Date(a.updated_at ?? a.created_at).getTime() - new Date(b.updated_at ?? b.created_at).getTime())
      .slice(0, limit)
  }

  /**
   * Records one delivery attempt. `countAttempt` is false when ResAvenue
   * pulled the row itself — that is a delivery, not one of our tries.
   */
  public async markChannelSync(
    bookingId: string,
    status: 'SENT' | 'FAILED',
    error: string | null = null,
    countAttempt = true
  ): Promise<void> {
    if (!this.useInMemory && this.pool) {
      // Each parameter is cast once: $2 is both a column value and a text
      // comparison here, and Postgres refuses to infer one type for both
      // uses ("inconsistent types deduced for parameter $2"). This was
      // found by running against a real database — the in-memory tests
      // never see the SQL.
      await this.pool.query(
        `UPDATE bookings SET
           cm_sync_status = $2::text,
           cm_synced_at = CASE WHEN $2::text = 'SENT' THEN NOW() ELSE cm_synced_at END,
           cm_attempts = cm_attempts + $4::int,
           cm_last_error = $3::text
         WHERE id = $1`,
        [bookingId, status, error, countAttempt ? 1 : 0]
      )
      return
    }
    const b = this.memoryBookings.get(bookingId)
    if (!b) return
    b.cm_sync_status = status
    if (status === 'SENT') b.cm_synced_at = new Date()
    b.cm_attempts = (b.cm_attempts ?? 0) + (countAttempt ? 1 : 0)
    b.cm_last_error = error
    this.memoryBookings.set(b.id, b)
  }

  /** The stay date of a booking row, whichever store it came from. */
  public static isoDate(v: unknown): string {
    return toIsoDate(v)
  }

  public async cleanupExpiredHolds(expireThresholdMinutes: number = 15): Promise<number> {
    const thresholdDate = new Date(Date.now() - expireThresholdMinutes * 60 * 1000)
    if (!this.useInMemory && this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        const expiredRes = await client.query(
          `SELECT * FROM bookings WHERE booking_status = 'PENDING_PAYMENT' AND created_at < $1 FOR UPDATE SKIP LOCKED`,
          [thresholdDate]
        )
        let count = 0
        for (const booking of expiredRes.rows) {
          await client.query(`UPDATE bookings SET booking_status = 'EXPIRED' WHERE id = $1`, [booking.id])
          await client.query(`DELETE FROM room_night_holds WHERE booking_id = $1`, [booking.id])
          count++
        }
        await client.query('COMMIT')
        return count
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }

    // In-Memory Hold Cleanup
    let count = 0
    this.memoryBookings.forEach((booking) => {
      if (booking.booking_status === 'PENDING_PAYMENT' && booking.created_at < thresholdDate) {
        booking.booking_status = 'EXPIRED'
        this.releaseNightHoldsInMemory(booking.id)
        this.memoryBookings.set(booking.id, booking)
        count++
      }
    })
    return count
  }

  public async getAllBookings(limit: number = 50): Promise<BookingRecord[]> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT * FROM bookings ORDER BY created_at DESC LIMIT $1', [limit])
      return res.rows
    }
    const all = Array.from(this.memoryBookings.values())
    return all
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
  }

  public async getGlanceMetrics(): Promise<{
    todayCheckIns: number
    pendingHolds: number
    pendingEnquiries: number
    todayRevenue: number
  }> {
    const todayStr = new Date().toISOString().split('T')[0]

    if (!this.useInMemory && this.pool) {
      const checkInsRes = await this.pool.query(
        "SELECT COUNT(*) as count FROM bookings WHERE check_in = $1 AND booking_status = 'CONFIRMED'",
        [todayStr]
      )
      const holdsRes = await this.pool.query(
        "SELECT COUNT(*) as count FROM bookings WHERE booking_status = 'PENDING_PAYMENT'"
      )
      const enqRes = await this.pool.query(
        "SELECT COUNT(*) as count FROM enquiries WHERE status IN ('NEW', 'CONTACTED', 'LINK_SENT')"
      )
      const revRes = await this.pool.query(
        "SELECT SUM(total_amount) as total FROM bookings WHERE booking_status = 'CONFIRMED' AND DATE(created_at) = $1",
        [todayStr]
      )

      return {
        todayCheckIns: Number(checkInsRes.rows[0]?.count || 0),
        pendingHolds: Number(holdsRes.rows[0]?.count || 0),
        pendingEnquiries: Number(enqRes.rows[0]?.count || 0),
        todayRevenue: Number(revRes.rows[0]?.total || 0),
      }
    }

    const allBookings = Array.from(this.memoryBookings.values())
    const allEnquiries = Array.from(this.memoryEnquiries.values())

    const todayCheckIns = allBookings.filter(
      (b) => b.check_in === todayStr && b.booking_status === 'CONFIRMED'
    ).length

    const pendingHolds = allBookings.filter((b) => b.booking_status === 'PENDING_PAYMENT').length

    const pendingEnquiries = allEnquiries.filter((e) =>
      ['NEW', 'CONTACTED', 'LINK_SENT'].includes(e.status)
    ).length

    const todayRevenue = allBookings
      .filter(
        (b) =>
          b.booking_status === 'CONFIRMED' &&
          new Date(b.created_at).toISOString().split('T')[0] === todayStr
      )
      .reduce((sum, b) => sum + Number(b.total_amount), 0)

    return { todayCheckIns, pendingHolds, pendingEnquiries, todayRevenue }
  }

  /* ------------------------------------------------------------------
   * Admin editing
   *
   * Everything a hotel manager should be able to change without a developer:
   * the property record, its room categories and their rates. Each method
   * whitelists the columns it will write — a caller cannot rename a primary
   * key or flip a foreign key by posting extra fields.
   * ------------------------------------------------------------------ */

  /** Columns an admin may change on a property. */
  private static readonly PROPERTY_EDITABLE = [
    'name',
    'city',
    'address',
    'map_link',
    'phone',
    'whatsapp',
    'email',
    'base_price',
    'rating',
    'is_active',
    'weekend_surcharge_percent',
    'extra_adult_percent',
    'child_free_under_age',
    'child_percent',
    'adult_from_age',
    'lat',
    'lng',
    'place_id',
    'tier',
    'tier_label',
  ] as const

  /**
   * Columns an admin may change on a room category.
   *
   * breakfast_offset and all_meals_offset were on this list until 5 Aug 2026 and
   * are deliberately off it now. Meal plans became a group-wide percentage of
   * the base room rate that day, so those columns no longer decide what a guest
   * pays — they are a derived cache, rewritten from the percentage by the schema
   * migration on every boot.
   *
   * Accepting a write to them would open a window between the edit and the next
   * deploy in which the concierge quotes the typed figure while checkout charges
   * the percentage. Dropping them here closes it: the request still succeeds,
   * because the route schema still tolerates the fields, but the value is
   * ignored rather than stored and later contradicted. To change what breakfast
   * costs, change the percentage in lib/pricing.ts or the room's price_offset.
   */
  private static readonly ROOM_EDITABLE = [
    'name',
    'description',
    'size_sqft',
    'bed_type',
    'max_guests',
    'price_offset',
    'total_units',
    'is_available',
  ] as const

  private static pickEditable<T extends string>(
    patch: Record<string, unknown>,
    allowed: readonly T[]
  ): Array<[T, unknown]> {
    return allowed
      .filter((col) => patch[col] !== undefined)
      .map((col) => [col, patch[col]] as [T, unknown])
  }

  public async updateProperty(
    idOrSlug: string,
    patch: Record<string, unknown>
  ): Promise<PropertyRecord | null> {
    const fields = DatabaseEngine.pickEditable(patch, DatabaseEngine.PROPERTY_EDITABLE)
    if (fields.length === 0) return this.getPropertyById(idOrSlug)

    if (!this.useInMemory && this.pool) {
      const sets = fields.map(([col], i) => `${col} = $${i + 2}`).join(', ')
      const res = await this.pool.query(
        `UPDATE properties SET ${sets} WHERE id = $1 OR slug = $1 RETURNING *`,
        [idOrSlug, ...fields.map(([, v]) => v)]
      )
      return res.rows[0] || null
    }

    const prop = Array.from(this.memoryProperties.values()).find(
      (p) => p.id === idOrSlug || p.slug === idOrSlug
    )
    if (!prop) return null
    fields.forEach(([col, v]) => { (prop as any)[col] = v })
    this.memoryProperties.set(prop.id, prop)
    return prop
  }

  /**
   * Edits one room category.
   *
   * Matches on id only. Room slugs are shared across properties — every hotel
   * has a `deluxe-room` — so accepting a slug here would let an admin editing
   * one property's rate silently change a different property's instead.
   */
  public async updateRoomType(
    id: string,
    patch: Record<string, unknown>
  ): Promise<RoomTypeRecord | null> {
    const fields = DatabaseEngine.pickEditable(patch, DatabaseEngine.ROOM_EDITABLE)
    if (fields.length === 0) return this.getRoomTypeById(id)

    if (!this.useInMemory && this.pool) {
      const sets = fields.map(([col], i) => `${col} = $${i + 2}`).join(', ')
      const res = await this.pool.query(
        `UPDATE room_types SET ${sets} WHERE id = $1 RETURNING *`,
        [id, ...fields.map(([, v]) => v)]
      )
      return res.rows[0] || null
    }

    const room = this.memoryRoomTypes.get(id)
    if (!room) return null
    fields.forEach(([col, v]) => { (room as any)[col] = v })
    // total_units is the ceiling for availability; never leave a room claiming
    // more free units than it physically has.
    if (room.available_units > room.total_units) room.available_units = room.total_units
    this.memoryRoomTypes.set(room.id, room)
    return room
  }

  /* ---------- Admin PIN ---------- */

  /**
   * Null means "never changed" — the caller falls back to the ADMIN_PIN env
   * var, which exists only to bootstrap the very first sign-in. Once the
   * client sets her own PIN this row wins and the env var stops mattering.
   */
  public async getAdminPinHash(): Promise<string | null> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(`SELECT pin_hash FROM admin_credentials WHERE id = 'primary'`)
      return res.rows[0]?.pin_hash ?? null
    }
    return this.memoryAdminPinHash
  }

  public async setAdminPinHash(hash: string): Promise<void> {
    if (!this.useInMemory && this.pool) {
      await this.pool.query(
        `INSERT INTO admin_credentials (id, pin_hash, updated_at) VALUES ('primary', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = NOW()`,
        [hash]
      )
      return
    }
    this.memoryAdminPinHash = hash
  }

  /* ---------- Editable site copy ---------- */

  public async getSiteContent(): Promise<Record<string, string>> {
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query('SELECT key, value FROM site_content')
      return Object.fromEntries(res.rows.map((r: any) => [r.key, r.value]))
    }
    return Object.fromEntries(this.memorySiteContent)
  }

  public async setSiteContent(entries: Record<string, string>): Promise<Record<string, string>> {
    const pairs = Object.entries(entries).filter(([k]) => k.trim().length > 0)

    if (!this.useInMemory && this.pool) {
      for (const [key, value] of pairs) {
        await this.pool.query(
          `INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, value]
        )
      }
      return this.getSiteContent()
    }

    // An empty string means "fall back to what the component shipped with",
    // so clearing a field in the admin UI restores the default rather than
    // blanking the section.
    pairs.forEach(([key, value]) => {
      if (value === '') this.memorySiteContent.delete(key)
      else this.memorySiteContent.set(key, value)
    })
    return this.getSiteContent()
  }

  public async toggleRoomAvailability(
    roomTypeIdOrSlug: string,
    propertySlug?: string,
    explicitAvailable?: boolean
  ): Promise<RoomTypeRecord | null> {
    if (!this.useInMemory && this.pool) {
      let query = 'SELECT * FROM room_types WHERE id = $1 OR slug = $1'
      const params: any[] = [roomTypeIdOrSlug]
      if (propertySlug) {
        query = `SELECT rt.* FROM room_types rt
                 JOIN properties p ON p.id = rt.property_id
                 WHERE p.slug = $2 AND (rt.id = $1 OR rt.slug = $1)`
        params.push(propertySlug)
      }
      const res = await this.pool.query(query, params)
      if (res.rows.length === 0) return null
      const room = res.rows[0]
      const newStatus = explicitAvailable !== undefined ? explicitAvailable : !room.is_available
      const upd = await this.pool.query('UPDATE room_types SET is_available = $1 WHERE id = $2 RETURNING *', [
        newStatus,
        room.id,
      ])
      return upd.rows[0]
    }

    let targetRoom: RoomTypeRecord | undefined
    if (propertySlug) {
      const prop = Array.from(this.memoryProperties.values()).find((p) => p.slug === propertySlug)
      if (prop) {
        targetRoom = Array.from(this.memoryRoomTypes.values()).find(
          (r) => r.property_id === prop.id && (r.id === roomTypeIdOrSlug || r.slug === roomTypeIdOrSlug)
        )
      }
    } else {
      targetRoom = Array.from(this.memoryRoomTypes.values()).find(
        (r) => r.id === roomTypeIdOrSlug || r.slug === roomTypeIdOrSlug
      )
    }

    if (!targetRoom) return null
    targetRoom.is_available = explicitAvailable !== undefined ? explicitAvailable : !targetRoom.is_available
    this.memoryRoomTypes.set(targetRoom.id, targetRoom)
    return targetRoom
  }

  public async updateWeekendSurcharge(
    propertyIdOrSlug: string | 'all',
    surchargePercent: number
  ): Promise<PropertyRecord[]> {
    if (!this.useInMemory && this.pool) {
      if (propertyIdOrSlug === 'all') {
        await this.pool.query('UPDATE properties SET weekend_surcharge_percent = $1', [surchargePercent])
        const res = await this.pool.query('SELECT * FROM properties ORDER BY name ASC')
        return res.rows
      }
      await this.pool.query(
        'UPDATE properties SET weekend_surcharge_percent = $1 WHERE id = $2 OR slug = $2',
        [surchargePercent, propertyIdOrSlug]
      )
      const res = await this.pool.query('SELECT * FROM properties ORDER BY name ASC')
      return res.rows
    }

    if (propertyIdOrSlug === 'all') {
      this.memoryProperties.forEach((prop) => {
        prop.weekend_surcharge_percent = surchargePercent
        this.memoryProperties.set(prop.id, prop)
      })
    } else {
      const prop = Array.from(this.memoryProperties.values()).find(
        (p) => p.id === propertyIdOrSlug || p.slug === propertyIdOrSlug
      )
      if (prop) {
        prop.weekend_surcharge_percent = surchargePercent
        this.memoryProperties.set(prop.id, prop)
      }
    }
    return Array.from(this.memoryProperties.values())
  }

  public async searchHotelsForChat(query: {
    search?: string
    city?: string
    checkIn?: string
    checkOut?: string
    roomsCount?: number
  }): Promise<
    Array<{
      property: PropertyRecord
      rooms: Array<RoomTypeRecord & { currentPriceInr: number }>
    }>
  > {
    const allProps = await this.getPropertiesWithRooms()
    const result: Array<{
      property: PropertyRecord
      rooms: Array<RoomTypeRecord & { currentPriceInr: number }>
    }> = []

    for (const item of allProps) {
      if (query.city && !item.property.city.toLowerCase().includes(query.city.toLowerCase())) {
        continue
      }
      if (
        query.search &&
        !item.property.name.toLowerCase().includes(query.search.toLowerCase()) &&
        !item.property.slug.toLowerCase().includes(query.search.toLowerCase()) &&
        !item.property.city.toLowerCase().includes(query.search.toLowerCase())
      ) {
        continue
      }

      const matchingRooms = item.rooms
        .filter((r) => r.is_available && (!query.roomsCount || r.available_units >= query.roomsCount))
        .map((r) => ({
          ...r,
          currentPriceInr: Number(item.property.base_price) + Number(r.price_offset),
        }))

      if (matchingRooms.length > 0) {
        result.push({
          property: item.property,
          rooms: matchingRooms,
        })
      }
    }
    return result
  }

  public async createEnquiry(payload: Omit<EnquiryRecord, 'id' | 'status' | 'created_at'>): Promise<EnquiryRecord> {
    // `enquiries.id` is `UUID PRIMARY KEY DEFAULT gen_random_uuid()`, so the id
    // is the database's to mint. Passing our own `enq_<ts>_<rand>` made Postgres
    // reject every insert with "invalid input syntax for type uuid", which 500'd
    // every contact/banquet/corporate/room-hold submission on the live site.
    // Same shape as `INSERT INTO users` above: omit the column, let the default fire.
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `INSERT INTO enquiries (enquiry_type, property_id, guest_name, guest_phone, guest_email, event_date, guest_count, message, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          payload.enquiry_type,
          payload.property_id || null,
          payload.guest_name,
          payload.guest_phone,
          payload.guest_email || null,
          payload.event_date || null,
          payload.guest_count || null,
          payload.message || null,
          'NEW',
        ]
      )
      return res.rows[0]
    }

    // In-memory store keys off a plain string, so it mints its own id.
    const id = `enq_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const record: EnquiryRecord = {
      id,
      enquiry_type: payload.enquiry_type,
      property_id: payload.property_id,
      guest_name: payload.guest_name,
      guest_phone: payload.guest_phone,
      guest_email: payload.guest_email,
      event_date: payload.event_date,
      guest_count: payload.guest_count,
      message: payload.message,
      status: 'NEW',
      created_at: new Date(),
    }
    this.memoryEnquiries.set(id, record)
    return record
  }

  public async getEnquiries(status?: string): Promise<EnquiryRecord[]> {
    if (!this.useInMemory && this.pool) {
      if (status) {
        const res = await this.pool.query('SELECT * FROM enquiries WHERE status = $1 ORDER BY created_at DESC', [status])
        return res.rows
      }
      const res = await this.pool.query('SELECT * FROM enquiries ORDER BY created_at DESC')
      return res.rows
    }
    const all = Array.from(this.memoryEnquiries.values())
    if (status) return all.filter((e) => e.status === status)
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  public async getEnquiryById(id: string): Promise<EnquiryRecord | null> {
    if (!this.useInMemory && this.pool) {
      // Comparing a non-UUID string against a UUID column is a Postgres *error*,
      // not a miss, so a stale link or a typo'd id would surface as a 500 rather
      // than the 404 the routes already handle. Treat unparseable as "not found".
      if (!isUuid(id)) return null
      const res = await this.pool.query('SELECT * FROM enquiries WHERE id = $1', [id])
      return res.rows[0] || null
    }
    return this.memoryEnquiries.get(id) || null
  }

  public async updateEnquiryStatus(id: string, status: EnquiryRecord['status'], razorpayPaymentLinkId?: string): Promise<EnquiryRecord | null> {
    if (!this.useInMemory && this.pool) {
      if (!isUuid(id)) return null
      const res = await this.pool.query(
        `UPDATE enquiries SET status = $1, razorpay_payment_link_id = COALESCE($2, razorpay_payment_link_id) WHERE id = $3 RETURNING *`,
        [status, razorpayPaymentLinkId || null, id]
      )
      return res.rows[0] || null
    }
    const enq = this.memoryEnquiries.get(id)
    if (!enq) return null
    enq.status = status
    if (razorpayPaymentLinkId) enq.razorpay_payment_link_id = razorpayPaymentLinkId
    this.memoryEnquiries.set(id, enq)
    return enq
  }

  public async createChatLog(payload: Omit<ChatLogRecord, 'id' | 'created_at'>): Promise<ChatLogRecord> {
    // `chat_logs.id` is a UUID with a `gen_random_uuid()` default, same as
    // enquiries. Supplying `chat_${ts}_${rand}` threw on every insert — invisibly,
    // because routes/ai.ts wraps this call in try/catch, so the chat kept replying
    // 200 while every log row was silently lost.
    if (!this.useInMemory && this.pool) {
      const res = await this.pool.query(
        `INSERT INTO chat_logs (session_id, user_message, bot_response, tools_invoked, handoff_triggered)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          payload.session_id,
          payload.user_message,
          payload.bot_response,
          JSON.stringify(payload.tools_invoked || []),
          Boolean(payload.handoff_triggered),
        ]
      )
      return res.rows[0]
    }

    const id = `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const record: ChatLogRecord = {
      id,
      session_id: payload.session_id,
      user_message: payload.user_message,
      bot_response: payload.bot_response,
      tools_invoked: payload.tools_invoked || [],
      handoff_triggered: Boolean(payload.handoff_triggered),
      created_at: new Date(),
    }
    this.memoryChatLogs.set(id, record)
    return record
  }
}

export const db = new DatabaseEngine()
