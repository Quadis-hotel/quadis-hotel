import { readFileSync } from 'fs'
import { join } from 'path'
import { db } from './index'
import { seedPostgres } from './seedPostgres'

/**
 * Applies db/schema.sql on boot.
 *
 * schema.sql existed from the first commit but nothing ever ran it, so pointing
 * DATABASE_URL at a real PostgreSQL instance produced a server that started
 * cleanly and then failed every query with "relation does not exist". The file
 * is written to be idempotent — CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT
 * EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS — so running it on every boot is
 * safe and doubles as the migration path for new columns.
 *
 * No-ops in in-memory mode, which seeds itself in the DatabaseEngine constructor.
 */
export async function runMigrations(): Promise<void> {
  if (db.useInMemory) {
    console.log('🗃️  In-memory store — skipping SQL migrations.')
    return
  }

  const pool = db.pool
  if (!pool) return

  // Resolve next to this module so it works from both src/ (ts-node) and dist/.
  // tsc does not copy .sql, so dist/db/ has no schema.sql — fall back to src/.
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ]

  let sql: string | null = null
  for (const path of candidates) {
    try {
      sql = readFileSync(path, 'utf8')
      break
    } catch {
      // Try the next candidate.
    }
  }

  if (!sql) {
    throw new Error(`Could not locate schema.sql. Looked in: ${candidates.join(', ')}`)
  }

  await pool.query(sql)
  console.log('🗃️  Database schema applied.')

  // Tables without rows are not a working site. Seeding is idempotent and never
  // overwrites an existing row, so it is safe on every boot — see seedPostgres.
  await seedPostgres(pool)
}
