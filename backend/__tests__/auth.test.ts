import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'

const app = createApp()

const GUEST = {
  fullName: 'Ananya Verma',
  email: 'Ananya.Verma@example.com',
  phone: '9811223344',
  password: 'correct-horse-battery',
}

describe('Guest accounts', () => {
  beforeAll(() => db.initializeInMemorySeed())

  let token = ''

  it('registers a guest and returns a session, never the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(GUEST)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.data.email).toBe('ananya.verma@example.com') // normalised
    expect(JSON.stringify(res.body)).not.toMatch(/password/i)
    token = res.body.token
  })

  it('stores the password hashed, not in plaintext', async () => {
    const user = await db.getUserByEmail(GUEST.email)
    expect(user).toBeTruthy()
    expect(user!.password_hash).not.toContain(GUEST.password)
    expect(user!.password_hash.startsWith('scrypt$')).toBe(true)
  })

  it('rejects a duplicate email regardless of casing', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...GUEST, email: 'ANANYA.VERMA@example.com' })
    expect(res.status).toBe(409)
  })

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...GUEST, email: 'other@example.com', password: 'short' })
    expect(res.status).toBe(400)
  })

  it('signs in with the right password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: GUEST.email, password: GUEST.password })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.token).toBe('string')
  })

  it('refuses the wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: GUEST.email, password: 'wrong-password' })
    expect(res.status).toBe(401)
  })

  it('gives the same answer for an unknown email, so accounts cannot be enumerated', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'x' })
    const wrong = await request(app).post('/api/auth/login').send({ email: GUEST.email, password: 'wrong-password' })
    expect(unknown.status).toBe(wrong.status)
    expect(unknown.body.error).toBe(wrong.body.error)
  })

  it('resolves the current user from the session token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.full_name).toBe(GUEST.fullName)
  })

  it('refuses a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token.slice(0, -2)}xx`)
    expect(res.status).toBe(401)
  })

  it('refuses a missing token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
