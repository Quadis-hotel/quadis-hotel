import type { Pool } from 'pg'
import { seedProperties, seedRoomTypes } from '../data/seed'

/**
 * Loads the nine properties and their room types into a real PostgreSQL
 * database.
 *
 * Why this exists: `seedProperties` and `seedRoomTypes` were only ever read by
 * `DatabaseEngine.initializeInMemorySeed()`, which runs exclusively when
 * DATABASE_URL is unset. Point DATABASE_URL at real Postgres and the boot
 * sequence created every table and inserted nothing — so the first production
 * deploy served a site with zero hotels, zero room types and nothing bookable,
 * while the frontend quietly fell back to STATIC_HOTELS and looked healthy.
 *
 * ---------------------------------------------------------------------------
 * The one rule this file must never break: it must not overwrite live data.
 * ---------------------------------------------------------------------------
 *
 * It runs on every boot, and by then the hotel may have spent weeks editing
 * rates, inventory and descriptions from the admin panel. So every statement is
 * INSERT ... ON CONFLICT DO NOTHING. A row that already exists is left exactly
 * as it is, including all admin edits. A row that does not exist is created.
 *
 * That also makes adding a tenth property a matter of appending it to
 * data/seed.ts — the next deploy inserts it and touches nothing else.
 *
 * `available_units` is deliberately seeded equal to `total_units`. It is only
 * meaningful on a fresh row; live availability is derived from room_night_holds
 * per night, not from this column.
 */
export async function seedPostgres(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let propertiesInserted = 0
    for (const p of seedProperties) {
      const res = await client.query(
        `INSERT INTO properties (
           id, slug, name, city, address, map_link, phone, whatsapp, email,
           base_price, rating, is_active, weekend_surcharge_percent,
           extra_adult_percent, child_free_under_age,
           lat, lng, place_id, tier, tier_label
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id, p.slug, p.name, p.city, p.address, p.map_link ?? null,
          p.phone, p.whatsapp, p.email,
          p.base_price, p.rating, p.is_active, p.weekend_surcharge_percent,
          p.extra_adult_percent, p.child_free_under_age,
          p.lat ?? null, p.lng ?? null, p.place_id ?? null,
          p.tier ?? 'central', p.tier_label ?? 'Quadis Central',
        ]
      )
      propertiesInserted += res.rowCount ?? 0
    }

    let roomsInserted = 0
    for (const r of seedRoomTypes) {
      const res = await client.query(
        `INSERT INTO room_types (
           id, property_id, slug, name, description, size_sqft, bed_type,
           max_guests, price_offset, breakfast_offset, all_meals_offset,
           total_units, available_units, is_available
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.property_id, r.slug, r.name, r.description, r.size_sqft,
          r.bed_type, r.max_guests, r.price_offset, r.breakfast_offset,
          r.all_meals_offset, r.total_units, r.total_units, r.is_available,
        ]
      )
      roomsInserted += res.rowCount ?? 0
    }

    await client.query('COMMIT')

    if (propertiesInserted || roomsInserted) {
      console.log(
        `🌱 Seeded ${propertiesInserted} propert${propertiesInserted === 1 ? 'y' : 'ies'} ` +
        `and ${roomsInserted} room type${roomsInserted === 1 ? '' : 's'}.`
      )
    } else {
      console.log('🌱 Seed data already present — nothing inserted.')
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
