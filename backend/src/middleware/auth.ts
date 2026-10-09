import { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { verifySession } from '../lib/auth'

/**
 * Lives in its own module on purpose: routers need this guard, and app.ts needs
 * the routers. Importing it from app.ts creates a cycle that resolves to
 * `undefined` at module-eval time and takes the whole server down on boot.
 */

/** Constant-time compare so the token can't be recovered by timing the response. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Resolves a guest session, or 401s. Attaches `req.session`. */
export const requireUser = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Not signed in' })
  }
  const session = verifySession(header.slice('Bearer '.length))
  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired' })
  }
  ;(req as any).session = session
  next()
}

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'test') return next()

  const expected = process.env.ADMIN_PASSWORD
  // Fail closed. An unconfigured deploy must not expose guest conversations
  // and admin controls to anyone who guesses the path.
  if (!expected) {
    console.error('ADMIN_PASSWORD is not set — refusing to serve admin routes.')
    return res.status(503).json({ success: false, error: 'Admin access is not configured' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  const presented = authHeader.slice('Bearer '.length)

  // Preferred path: a signed, expiring session minted by POST /api/admin/auth.
  //
  // `role === 'admin'` is the whole check and it is not optional. verifySession
  // also validates ordinary guest logins, so accepting any valid session here
  // would promote every registered guest to full admin.
  const session = verifySession(presented)
  if (session?.role === 'admin') {
    ;(req as any).session = session
    return next()
  }

  // Break-glass: the raw ADMIN_PASSWORD still works, so a lost or un-migrated
  // PIN never locks the client out of her own live site. It has no expiry,
  // which is exactly why it is the fallback and not the front door.
  if (tokensMatch(presented, expected)) return next()

  return res.status(401).json({ success: false, error: 'Unauthorized' })
}
