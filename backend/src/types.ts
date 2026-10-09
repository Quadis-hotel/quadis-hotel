// Shared domain types exactly matching frontend src/types.ts (§5 single source of truth)
// Plus backend database record interfaces for PostgreSQL.

export type City = 'Noida' | 'New Delhi'

export type MealPlan = 'Room Only' | 'With Breakfast' | 'All Meals Included'

export interface RoomMealOption {
  plan: MealPlan
  priceOffset: number
}

export interface HotelRoom {
  id: string
  name: string
  description: string
  size: string
  bed: string
  maxGuests: number
  basePriceOffset: number
  mealOptions: RoomMealOption[]
}

export interface Hotel {
  slug: string
  name: string
  area: string
  city: City
  address: string
  price: number
  rating: number
  rooms?: HotelRoom[]
}

export interface BanquetVenue {
  slug: string
  name: string
  area: string
  city: City
  capacity: number
  hallArea: string
  catering: string
  parking: string
}

/* ---------- Form payloads ---------- */

export type ContactType = 'General' | 'Booking' | 'Banquet' | 'Corporate' | 'Feedback'

export interface ContactPayload {
  name: string
  email: string
  phone: string
  type: ContactType
  message: string
}

export interface EnquiryPayload {
  name: string
  phone: string
  email: string
  date: string
  guests: string
  message: string
}

export type BanquetEnquiryPayload = EnquiryPayload

export interface CorporateRFPPayload {
  company: string
  person: string
  email: string
  phone: string
  city: string
  rooms: string
  message: string
}

export interface BookingQuery {
  hotelSlug: string
  checkin: string
  checkout: string
  rooms: number
  guests: number
  roomType?: string
  mealPlan?: MealPlan
}

export type BookingRequest = BookingQuery

/* ---------- Database Record Interfaces (PostgreSQL / In-Memory Store) ---------- */

export interface PropertyRecord {
  id: string
  slug: string
  name: string
  city: City
  address: string
  map_link?: string
  phone: string
  whatsapp: string
  email: string
  base_price: number
  rating: number
  is_active: boolean
  weekend_surcharge_percent: number
  /** Percentage of the nightly room rate added per extra adult. Admin-set. */
  extra_adult_percent: number
  /** Below this age a guest stays free. Admin-set. */
  child_free_under_age: number
  /** Percentage added per child between child_free_under_age and adult_from_age. */
  child_percent?: number
  /** At this age and above, a guest is charged as an adult. */
  adult_from_age?: number
  /** Null until a real coordinate is confirmed; the UI falls back to address search. */
  lat?: number | null
  lng?: number | null
  place_id?: string | null
  tier?: string
  tier_label?: string
}

/** A photo uploaded from the admin panel, stored in object storage. */
export interface PropertyImageRecord {
  id: string
  property_id: string
  url: string
  thumb_url: string | null
  /** Handle for the stored object, so a delete removes the file too. */
  storage_key: string
  alt_text: string | null
  /** Lowest first. The first image is the property hero. */
  sort_order: number
  created_at?: Date
}

export interface UserRecord {
  id: string
  full_name: string
  email: string
  phone?: string
  /** Salted scrypt digest. Never serialise this to a client. */
  password_hash: string
  created_at: Date | string
}

/** A user as the API is allowed to return it. */
export interface PublicUser {
  id: string
  full_name: string
  email: string
  phone?: string
}

export interface RoomTypeRecord {
  id: string
  property_id: string
  slug: string
  name: string
  description: string
  size_sqft: string
  bed_type: string
  max_guests: number
  price_offset: number
  breakfast_offset: number
  all_meals_offset: number
  total_units: number
  available_units: number
  is_available: boolean
}

export interface BookingRecord {
  id: string
  booking_code: string
  /** Null for guest checkout. */
  user_id?: string | null
  property_id: string
  room_type_id: string
  guest_name: string
  guest_phone: string
  guest_email?: string
  company_name?: string
  gstin?: string
  check_in: string
  check_out: string
  rooms_count: number
  /** Total headcount (adults + children). Kept for display and older rows. */
  guests_count: number
  adults_count: number
  children_count: number
  /** One age per child. Below the property's child_free_under_age stays free. */
  child_ages: number[]
  /** Adults beyond two per room, each charged the extra-bed rate per night. */
  extra_adults: number
  /**
   * The uplift as it stood when this booking was made — the percentage, and the
   * rupees per extra adult per night it produced. Frozen on the row so an admin
   * repricing the property later cannot change what an already issued invoice
   * appears to say.
   */
  extra_adult_percent: number
  extra_adult_charge: number
  total_amount: number
  payment_mode: 'INSTANT_FULL_PAYMENT' | 'TOKEN_DEPOSIT' | 'ENQUIRY_PAYMENT_LINK'
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_payment_link_id?: string
  booking_status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'
  /**
   * The plan the guest chose. Null on rows written before the channel-manager
   * integration, which needed it to name a RatePlanCode on the reservation it
   * sends to ResAvenue; until then the plan priced the hold and was dropped.
   */
  meal_plan?: MealPlan | null
  created_at: Date
  /** Bumped on every status change, so a booking pull can ask "what changed since". */
  updated_at?: Date | string
  /**
   * Channel-manager delivery state for this reservation.
   *
   * NONE     never needed sending (unpaid holds, expiries, failed payments)
   * PENDING  a Confirm or Cancel is owed to ResAvenue and has not gone yet
   * SENT     delivered, by push or by ResAvenue pulling it
   * FAILED   the last push attempt errored; the sync worker retries it
   */
  cm_sync_status?: 'NONE' | 'PENDING' | 'SENT' | 'FAILED'
  /** The ResStatus owed or last delivered: Confirm or Cancel. */
  cm_res_status?: 'Confirm' | 'Cancel' | null
  cm_synced_at?: Date | string | null
  cm_attempts?: number
  cm_last_error?: string | null
}

/* ---------- Channel manager (ResAvenue) per-night overrides ---------- */

/**
 * One room's inventory and restrictions on one night, as set by the channel
 * manager through OTA_HotelInvCountNotifRQ. Absent row = the site's own
 * figures (total_units, nothing closed).
 */
export interface InventoryDayRecord {
  room_type_id: string
  stay_date: string
  /** Sellable units that night. Null keeps total_units as the ceiling. */
  inv_count: number | null
  stop_sell: boolean
  close_on_arrival: boolean
  close_on_departure: boolean
  /** Fewest days before arrival a booking may be made. 0 = no limit. */
  cut_off: number
  updated_at?: Date | string
}

/**
 * One rate plan's figures on one night, as set by the channel manager through
 * OTA_HotelRateAmountNotifRQ. Every amount is nullable: an update that sends
 * only two occupancies leaves the rest on the site's computed value.
 */
export interface RateDayRecord {
  room_type_id: string
  meal_plan: MealPlan
  stay_date: string
  single: number | null
  double: number | null
  triple: number | null
  quad: number | null
  extra_adult: number | null
  extra_child: number | null
  min_stay: number | null
  max_stay: number | null
  stop_sell: boolean
  updated_at?: Date | string
}

export interface EnquiryRecord {
  id: string
  enquiry_type: 'ROOM_HOLD' | 'BANQUET' | 'CORPORATE_RFP' | 'GENERAL'
  property_id?: string
  guest_name: string
  guest_phone: string
  guest_email?: string
  event_date?: string
  guest_count?: number
  message?: string
  status: 'NEW' | 'CONTACTED' | 'LINK_SENT' | 'CONVERTED' | 'CLOSED'
  razorpay_payment_link_id?: string
  created_at: Date | string
}

export interface ChatLogRecord {
  id: string
  session_id: string
  user_message: string
  bot_response: string
  tools_invoked?: string[]
  handoff_triggered: boolean
  created_at: Date | string
}
