import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHmac } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>

/**
 * Password hashing and session tokens on Node's own crypto — no extra
 * dependency, no supply-chain surface.
 *
 * Passwords use scrypt with a per-user random salt: deliberately slow, so a
 * stolen table is expensive to crack. Never store or log the plaintext.
 */

const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, KEYLEN)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const derived = await scrypt(password, salt, KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  // Length check first: timingSafeEqual throws on a mismatch.
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

/** Secret for signing sessions. Absent in production, we refuse to issue any. */
function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') return null
  return 'quadis-dev-only-session-secret'
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export interface SessionPayload {
  sub: string // user id
  email: string
  exp: number // unix seconds
  /**
   * Only ever `'admin'`, and only on tokens minted by POST /api/admin/auth.
   *
   * Guest sessions must never carry it. `requireAdmin` accepts a session token
   * solely on this claim, so a guest login that picked it up would be a
   * privilege escalation from "signed up on the website" to "can re-price
   * rooms and read every guest's phone number".
   */
  role?: 'admin'
}

/** Compact HMAC-signed token. Same shape as a JWT, without the dependency. */
export function signSession(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string | null {
  const secret = sessionSecret()
  if (!secret) return null
  const body: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const data = b64url(JSON.stringify(body))
  const sig = b64url(createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}

export function verifySession(token: string): SessionPayload | null {
  const secret = sessionSecret()
  if (!secret) return null

  const [data, sig] = token.split('.')
  if (!data || !sig) return null

  const expected = b64url(createHmac('sha256', secret).update(data).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64').toString()) as SessionPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
