import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'
import { requireAdmin } from '../src/middleware/auth'
import { signSession } from '../src/lib/auth'

const app = createApp()

/**
 * A FAKE pin. The test sets `process.env.ADMIN_PIN` to it below, so any six
 * digits work and the real one buys nothing.
 *
 * This constant held the LIVE production PIN from `/quadis/admin-pin` until
 * 3 Aug, caught while staging this file for its first commit. This repo is
 * public (§3b), so committing it would have published the admin PIN for
 * quadishotels.com/admin. Never paste a real credential in here — not even a
 * "temporary" one, because tests are the files people forget to reread.
 */
const BOOTSTRAP_PIN = '246813'

describe('Admin PIN — the client can change it herself', () => {
  beforeEach(() => {
    db.initializeInMemorySeed()
    db.memoryAdminPinHash = null
    process.env.ADMIN_PIN = BOOTSTRAP_PIN
    process.env.ADMIN_PASSWORD = 'test-admin-token'
    process.env.SESSION_SECRET = 'test-session-secret'
  })

  describe('sign-in', () => {
    it('accepts the bootstrap PIN and flags that it still needs changing', async () => {
      const res = await request(app).post('/api/admin/auth').send({ pin: BOOTSTRAP_PIN })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeTruthy()
      expect(res.body.mustChangePin).toBe(true)
    })

    it('rejects a wrong PIN', async () => {
      const res = await request(app).post('/api/admin/auth').send({ pin: '000000' })
      expect(res.status).toBe(401)
    })

    it('no longer returns ADMIN_PASSWORD as the token', async () => {
      // The old endpoint handed back the permanent admin secret itself, so a
      // single intercepted sign-in response was the credential, for ever.
      const res = await request(app).post('/api/admin/auth').send({ pin: BOOTSTRAP_PIN })
      expect(res.body.token).not.toBe('test-admin-token')
    })
  })

  describe('changing it', () => {
    it('replaces the PIN, and the old one stops working', async () => {
      const change = await request(app)
        .post('/api/admin/change-pin')
        .send({ currentPin: BOOTSTRAP_PIN, newPin: '739154' })
      expect(change.status).toBe(200)

      const withOld = await request(app).post('/api/admin/auth').send({ pin: BOOTSTRAP_PIN })
      expect(withOld.status).toBe(401)

      const withNew = await request(app).post('/api/admin/auth').send({ pin: '739154' })
      expect(withNew.status).toBe(200)
      // Changed once, so the nag is gone.
      expect(withNew.body.mustChangePin).toBe(false)
    })

    it('never stores the PIN in plaintext', async () => {
      await request(app)
        .post('/api/admin/change-pin')
        .send({ currentPin: BOOTSTRAP_PIN, newPin: '739154' })

      expect(db.memoryAdminPinHash).toBeTruthy()
      expect(db.memoryAdminPinHash).not.toContain('739154')
      expect(db.memoryAdminPinHash!.startsWith('scrypt$')).toBe(true)
    })

    it('refuses a wrong current PIN, so an unattended dashboard cannot lock the owner out', async () => {
      const res = await request(app)
        .post('/api/admin/change-pin')
        .send({ currentPin: '111111', newPin: '739154' })

      expect(res.status).toBe(401)
      expect(db.memoryAdminPinHash).toBeNull()
    })

    // A plain loop rather than it.each().
    //
    // tsconfig.json excludes **/*.test.ts, so `npx tsc --noEmit` never sees this
    // file and ts-jest compiles it outside the program — where the jest globals
    // resolve to a narrower type that has `it` but not `it.each`, and the suite
    // fails to compile rather than failing a test. It passed on the machine that
    // wrote it only because ts-jest had a warm cache for the file.
    const WEAK_PINS: Array<[string, string]> = [
      ['000000', 'same digit six times'],
      ['123456', 'ascending run'],
      ['987654', 'descending run'],
      ['1234', 'too short'],
      ['abcdef', 'not digits'],
    ]

    for (const [pin, why] of WEAK_PINS) {
      it(`rejects ${pin} (${why})`, async () => {
        const res = await request(app)
          .post('/api/admin/change-pin')
          .send({ currentPin: BOOTSTRAP_PIN, newPin: pin })

        expect(res.status).toBe(400)
        expect(db.memoryAdminPinHash).toBeNull()
      })
    }
  })

  /**
   * requireAdmin short-circuits under NODE_ENV=test, so these drive the
   * middleware directly with the env flipped. Without this block the whole
   * guard is untested — which is how the escalation below would ship unseen.
   */
  describe('requireAdmin (env flipped to production)', () => {
    const original = process.env.NODE_ENV

    beforeEach(() => { process.env.NODE_ENV = 'production' })
    afterEach(() => { process.env.NODE_ENV = original })

    const run = (authorization?: string) => {
      const req: any = { headers: authorization ? { authorization } : {} }
      const res: any = {
        statusCode: 0,
        body: null,
        status(code: number) { this.statusCode = code; return this },
        json(payload: any) { this.body = payload; return this },
      }
      const next = jest.fn()
      requireAdmin(req, res, next)
      return { res, next }
    }

    it('accepts a session carrying role=admin', () => {
      const token = signSession({ sub: 'admin', email: '', role: 'admin' }, 60)
      const { next } = run(`Bearer ${token}`)
      expect(next).toHaveBeenCalled()
    })

    it('REJECTS a valid guest session — signing up must not grant admin', () => {
      // The escalation this guards: verifySession() validates ordinary guest
      // logins too, so a guard that accepted "any valid session" would promote
      // every registered guest to full admin.
      const guest = signSession({ sub: 'user-123', email: 'guest@example.com' }, 60)
      const { res, next } = run(`Bearer ${guest}`)

      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(401)
    })

    it('rejects a guest session that tries to forge the claim', () => {
      // Forged payload, signed with the wrong secret — the HMAC must catch it.
      const forged = signSession({ sub: 'user-123', email: 'g@example.com', role: 'admin' } as any, 60)
      const realSecret = process.env.SESSION_SECRET
      process.env.SESSION_SECRET = 'a-different-secret'
      const { res, next } = run(`Bearer ${forged}`)
      process.env.SESSION_SECRET = realSecret

      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(401)
    })

    it('rejects an expired admin session', () => {
      const expired = signSession({ sub: 'admin', email: '', role: 'admin' }, -10)
      const { res, next } = run(`Bearer ${expired}`)

      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(401)
    })

    it('still accepts the raw ADMIN_PASSWORD as break-glass', () => {
      const { next } = run('Bearer test-admin-token')
      expect(next).toHaveBeenCalled()
    })

    it('rejects no token at all', () => {
      const { res, next } = run()
      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(401)
    })
  })

  /**
   * The 4 Aug 2026 lockout — "Ye invalid show kr raha h", 4:36 pm, with a
   * photo of the /admin login card reading `Invalid Admin PIN`.
   *
   * The masked field in that photo holds SEVEN dots, not six (counted off the
   * original at four thresholds: seven evenly-spaced blobs, regular ~7px
   * pitch). These pin down what the server does with input of that shape, and
   * why the fix had to go in the field rather than in here.
   */
  describe('the 4 Aug 2026 lockout', () => {
    /**
     * A fresh app per test, because /api/admin/auth carries a
     * 10-attempts-per-15-minutes limiter (app.ts) whose counter lives on the
     * app instance — the block above has already spent most of the shared
     * budget, and without this these assertions start reading 429 instead of
     * the 401/200 they are about.
     *
     * That limit is part of the client-facing story too: ten fumbled attempts
     * and she is locked out of her own panel for a quarter of an hour, with a
     * message that is not the one she screenshotted. It is the right limit for
     * a six-digit PIN; it is also why the panel must stop a malformed PIN
     * before it is spent.
     */
    let freshApp: ReturnType<typeof createApp>
    beforeEach(() => { freshApp = createApp() })

    it('rejects the right PIN with one extra character — the shape her screenshot shows', async () => {
      // Seven characters against a six-digit PIN. A paste out of WhatsApp
      // brings the trailing space with it and the old field, maxLength={10}
      // with no filter, took it silently.
      for (const submitted of [`${BOOTSTRAP_PIN} `, ` ${BOOTSTRAP_PIN}`, `${BOOTSTRAP_PIN}\n`, `${BOOTSTRAP_PIN}7`]) {
        const res = await request(freshApp).post('/api/admin/auth').send({ pin: submitted })
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Invalid Admin PIN')
      }
    })

    it('gives a malformed PIN the exact same 401 as a wrong one, which is why the panel must catch it', async () => {
      // The dead end itself: from the browser these two are indistinguishable,
      // so nothing on the login screen could tell her she had typed 7 digits.
      // AdminDashboard.tsx now blocks a non-6-digit submission locally.
      const malformed = await request(freshApp).post('/api/admin/auth').send({ pin: `${BOOTSTRAP_PIN} ` })
      const wrong = await request(freshApp).post('/api/admin/auth').send({ pin: '135790' })

      expect(malformed.status).toBe(wrong.status)
      expect(malformed.body.error).toBe(wrong.body.error)
    })

    it('accepts the exact six digits — there is no always-fail defect in the compare', async () => {
      // Guards the other half of the diagnosis. If the bootstrap compare were
      // broken (a stray newline on ADMIN_PIN out of SSM, say), no PIN would
      // ever work and the input fix would be treating the wrong thing.
      const res = await request(freshApp).post('/api/admin/auth').send({ pin: BOOTSTRAP_PIN })
      expect(res.status).toBe(200)
    })

    it('accepts the exact six digits through the stored-hash path too', async () => {
      await request(freshApp)
        .post('/api/admin/change-pin')
        .send({ currentPin: BOOTSTRAP_PIN, newPin: '739154' })

      const res = await request(freshApp).post('/api/admin/auth').send({ pin: '739154' })
      expect(res.status).toBe(200)
      expect(res.body.mustChangePin).toBe(false)

      // ...and the same one extra character fails on that path as well, so the
      // fix holds whichever mode production is actually in.
      const withSpace = await request(freshApp).post('/api/admin/auth').send({ pin: '739154 ' })
      expect(withSpace.status).toBe(401)
    })

    it('stops honouring ADMIN_PIN once she has set her own — the other way this lockout happens', async () => {
      // She was still in bootstrap mode at the 3 Aug deploy (admin_credentials
      // verified as existing with zero rows). If she has used the change-PIN
      // form since, the PIN we sent on WhatsApp is dead and only she knows the
      // replacement. Nothing about that is a bug; it needs a different answer
      // to her, which is what the mode= line on the rejection is for.
      await request(freshApp)
        .post('/api/admin/change-pin')
        .send({ currentPin: BOOTSTRAP_PIN, newPin: '739154' })

      const res = await request(freshApp).post('/api/admin/auth').send({ pin: BOOTSTRAP_PIN })
      expect(res.status).toBe(401)
    })

    it('does not let ADMIN_PASSWORD in through the PIN box — break-glass is not a browser route', async () => {
      // Worth pinning so nobody "helps" a locked-out owner by widening this.
      // The break-glass token is accepted by requireAdmin, not by /auth, so
      // recovery is a curl or an operator, never a second thing to type here.
      const res = await request(freshApp).post('/api/admin/auth').send({ pin: 'test-admin-token' })
      expect(res.status).toBe(401)
    })

    it('never echoes the submitted PIN back to the caller', async () => {
      const res = await request(freshApp).post('/api/admin/auth').send({ pin: `${BOOTSTRAP_PIN} ` })
      expect(JSON.stringify(res.body)).not.toContain(BOOTSTRAP_PIN)
    })
  })
})
