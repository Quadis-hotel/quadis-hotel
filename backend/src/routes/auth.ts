import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../db'
import { hashPassword, verifyPassword, signSession, verifySession } from '../lib/auth'
import { requireUser } from '../middleware/auth'
import type { PublicUser, UserRecord } from '../types'

export const authRouter = Router()

/** Never let password_hash reach a client. */
const toPublic = (u: UserRecord): PublicUser => ({
  id: u.id,
  full_name: u.full_name,
  email: u.email,
  phone: u.phone,
})

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().min(10, 'Enter a valid 10-digit mobile number').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
})

// POST /api/auth/register — create a guest account
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid registration details',
        details: parsed.error.flatten().fieldErrors,
      })
    }
    const data = parsed.data

    const existing = await db.getUserByEmail(data.email)
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' })
    }

    const user = await db.createUser({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone || undefined,
      passwordHash: await hashPassword(data.password),
    })

    const token = signSession({ sub: user.id, email: user.email })
    if (!token) {
      console.error('SESSION_SECRET is not set — refusing to issue a session.')
      return res.status(503).json({ success: false, error: 'Sign-in is not configured on this server' })
    }

    res.status(201).json({ success: true, token, data: toPublic(user) })
  } catch (err: any) {
    console.error('Registration failed:', err)
    res.status(500).json({ success: false, error: 'Could not create your account' })
  }
})

// POST /api/auth/login — exchange credentials for a session token
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Enter your email and password' })
    }

    const user = await db.getUserByEmail(parsed.data.email)

    // Same response and roughly the same work whether or not the account
    // exists, so this endpoint can't be used to discover who has registered.
    const ok = user ? await verifyPassword(parsed.data.password, user.password_hash) : false
    if (!user || !ok) {
      return res.status(401).json({ success: false, error: 'Email or password is incorrect' })
    }

    const token = signSession({ sub: user.id, email: user.email })
    if (!token) {
      console.error('SESSION_SECRET is not set — refusing to issue a session.')
      return res.status(503).json({ success: false, error: 'Sign-in is not configured on this server' })
    }

    res.json({ success: true, token, data: toPublic(user) })
  } catch (err: any) {
    console.error('Login failed:', err)
    res.status(500).json({ success: false, error: 'Could not sign you in' })
  }
})

// GET /api/auth/me — resolve the current session
authRouter.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Not signed in' })
  }

  const session = verifySession(header.slice('Bearer '.length))
  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired' })
  }

  const user = await db.getUserById(session.sub)
  if (!user) {
    return res.status(401).json({ success: false, error: 'Account no longer exists' })
  }

  res.json({ success: true, data: toPublic(user) })
})

// GET /api/auth/bookings — the signed-in guest's own stays
authRouter.get('/bookings', requireUser, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session as { sub: string; email: string }
    const bookings = await db.getBookingsForUser(session.sub, session.email)

    // Join in the names a guest actually recognises — a property id is useless
    // on a "My bookings" page.
    const enriched = await Promise.all(
      bookings.map(async (b) => {
        const [prop, room] = await Promise.all([
          db.getPropertyById(b.property_id),
          db.getRoomTypeById(b.room_type_id),
        ])
        return {
          ...b,
          property_name: prop?.name ?? 'Quadis Hotel',
          property_address: prop?.address ?? '',
          property_slug: prop?.slug ?? '',
          room_type_name: room?.name ?? '',
        }
      })
    )

    res.json({ success: true, count: enriched.length, data: enriched })
  } catch (err: any) {
    console.error('Failed to load bookings:', err)
    res.status(500).json({ success: false, error: 'Could not load your bookings' })
  }
})
