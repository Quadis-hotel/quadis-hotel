import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

/**
 * The endpoint these cover used to be `res.json({ status: 'healthy' })` with no
 * inputs at all — it could not fail, which meant it could not report anything.
 * Both serious incidents on this project (AGENTS.md §7) held every automated
 * check green while production was down.
 */
describe('/api/health reports on storage it actually probed', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    jest.restoreAllMocks()
  })

  it('is healthy in memory off production — that is how dev and tests run', async () => {
    process.env.NODE_ENV = 'test'
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
    expect(res.body.storage).toBe('in-memory')
    expect(res.body.database).toBe('ok')
  })

  it('is DEGRADED in memory on production, even though nothing has errored', async () => {
    // The dangerous state, and the one the old endpoint could never see: the
    // app serves the 9 seeded properties, accepts bookings and issues booking
    // codes, then loses every row on restart. No request fails on the way.
    process.env.NODE_ENV = 'production'
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.storage).toBe('in-memory')
    expect(res.body.error).toMatch(/in memory/i)
  })

  it('is DEGRADED when Postgres is configured but not answering', async () => {
    jest.spyOn(db, 'ping').mockResolvedValue({
      storage: 'postgres',
      reachable: false,
      error: 'connection terminated unexpectedly',
    })

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.database).toBe('unreachable')
    expect(res.body.error).toMatch(/connection terminated/)
  })

  it('is healthy when Postgres answers', async () => {
    jest.spyOn(db, 'ping').mockResolvedValue({ storage: 'postgres', reachable: true })

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
    expect(res.body.storage).toBe('postgres')
    expect(res.body.database).toBe('ok')
  })

  it('reports the storage mode at all — the old endpoint named no dependency', async () => {
    const res = await request(app).get('/api/health')
    expect(res.body).toHaveProperty('storage')
    expect(res.body).toHaveProperty('database')
  })
})

describe('db.ping', () => {
  it('says in-memory when there is no pool, and does not pretend to be Postgres', async () => {
    const probe = await db.ping()
    expect(probe.storage).toBe('in-memory')
    expect(probe.reachable).toBe(true)
  })
})
