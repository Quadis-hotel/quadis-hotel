import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { propertiesRouter } from './routes/properties'
import { bookingsRouter } from './routes/bookings'
import { paymentsRouter } from './routes/payments'
import { webhooksRouter } from './routes/webhooks'
import { enquiriesRouter } from './routes/enquiries'
import { adminRouter, adminAuthRouter } from './routes/admin'
import { aiRouter } from './routes/ai'
import { authRouter } from './routes/auth'
import { contentRouter } from './routes/content'
import { otaRouter } from './routes/ota'
import { requireAdmin } from './middleware/auth'
import { db } from './db'

// Re-exported for existing importers; the implementation lives in middleware/auth
// so routers can depend on it without importing this module back.
export { requireAdmin }

export function createApp(): Express {
  const app = express()

  // 0. Trust exactly one proxy hop — nginx, on this same box.
  //
  // Without this every request appears to come from 127.0.0.1, because nginx
  // proxies to 127.0.0.1:3001. Express then hands the rate limiters below a
  // single key for the entire internet: one shared 100-per-15-min bucket.
  //
  // That breaks checkout specifically. awaitServerConfirmation polls up to 36
  // times per checkout (90s / 2.5s) against /api/bookings, so a handful of
  // simultaneous guests exhaust the shared bucket and start 429ing each other
  // *after* their money has left — the payment succeeds and the confirmation
  // never lands.
  //
  // `1`, not `true`. Blanket-trusting lets a caller spoof X-Forwarded-For and
  // walk straight past the 10-attempt limiter on /api/admin/auth; trusting one
  // hop means only nginx's appended value is believed. Off outside production
  // because there is no proxy in front of the dev server or the test suite,
  // and trusting a header nobody is setting is the same spoofing hole.
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false)

  // 1. Security Headers
  app.use(helmet())

  // 2. Strict CORS — allowlist only.
  // In production the frontend is served same-origin behind the CloudFront /api
  // proxy, so no cross-origin grant is needed unless CORS_ORIGIN says otherwise.
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  const devOrigins = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]

  app.use(cors({
    origin: (origin, callback) => {
      // No Origin header: same-origin navigation, curl, or a server-to-server
      // call such as the Razorpay webhook. Nothing to authorise.
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      if (process.env.NODE_ENV !== 'production' && devOrigins.some((re) => re.test(origin))) {
        return callback(null, true)
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`))
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }))

  // 3. Webhook parsing (keep raw body for signature verification)
  //
  // The channel manager's messages come first with a larger limit: one
  // OTA_HotelRateAmountNotifRQ can carry every rate plan of every room for a
  // year, which is well past the 100 kb default. body-parser skips a request it
  // has already parsed, so the general parser below leaves these alone.
  app.use('/api/ota', express.json({ limit: '2mb' }))
  app.use(express.json({
    verify: (req, _res, buf) => {
      ;(req as any).rawBody = buf.toString()
    }
  }))

  // Browsers post CSP violation reports as application/csp-report (or
  // application/reports+json), neither of which the JSON parser above accepts,
  // so without this the body arrives empty and every report reads as blank.
  app.use(express.json({ type: ['application/csp-report', 'application/reports+json'] }))

  // POST /api/csp-report — collector for the Report-Only policy in
  // deploy/nginx/security-headers.conf.
  //
  // The policy ships in report-only mode first because a wrong script-src
  // silently blocks the Razorpay checkout script: the button does nothing, no
  // error reaches the guest, and no error reaches us. This endpoint is how the
  // allowlist gets verified against real traffic before anything is enforced.
  //
  // Tightly rate limited and truncated. It is unauthenticated by necessity —
  // the browser sends it — so it is an open log-write for anyone who finds it.
  const cspLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.post('/api/csp-report', cspLimiter, (req: Request, res: Response) => {
    const r = (req.body?.['csp-report'] ?? req.body?.body ?? req.body) as Record<string, unknown> | undefined
    if (r) {
      const at = (k: string) => String(r[k] ?? '').slice(0, 200)
      console.warn(
        `[CSP] blocked=${at('blocked-uri') || at('blockedURL')} ` +
        `directive=${at('violated-directive') || at('effectiveDirective')} ` +
        `on=${at('document-uri') || at('documentURL')}`
      )
    }
    // 204: the browser wants nothing back, and a body here is pure waste.
    res.status(204).end()
  })

  // 4. Rate Limiting for public endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/enquiries', apiLimiter)
  app.use('/api/bookings', apiLimiter)
  app.use('/api/ai/chat', apiLimiter)

  // A short PIN is brute-forceable in minutes at 100 req/15min. Keep this tight.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many sign-in attempts. Try again later.' },
  })
  app.use('/api/admin/auth', authLimiter)
  // Guest sign-in is equally brute-forceable; registration equally spammable.
  app.use('/api/auth', authLimiter)

  // The channel manager authenticates on every message, so it needs a much
  // looser bucket than the public forms — and still a bucket, because the
  // credential is a password in a JSON body.
  const otaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { OTA_ErrorRS: { Status: 'Failure', Remark: 'Too many requests. Try again later.' } },
  })
  app.use('/api/ota', otaLimiter)

  // Health check endpoint.
  //
  // This used to return a static `status: 'healthy'` without touching anything.
  // That is the §7 failure mode exactly: both serious incidents on this project
  // held every check green while production was down, and a health endpoint
  // that reports on nothing is the purest form of it.
  //
  // Two distinct failures are worth reporting, and they are not the same:
  //
  //   1. Postgres is configured but not answering. Everything data-backed is
  //      broken; the frontend still serves.
  //   2. The process is running IN MEMORY on production. Nothing errors — it
  //      serves the 9 seeded properties, accepts bookings, issues booking
  //      codes, and silently loses every row on restart. `install.sh` hard
  //      fails when /quadis/db-password is missing so a normal deploy cannot
  //      reach this state, but nothing DETECTS it if one ever does.
  //
  // In-memory off production is ordinary — that is how the tests and local dev
  // run — so it is only degraded when NODE_ENV=production.
  app.get('/api/health', async (_req: Request, res: Response) => {
    const probe = await db.ping()
    const inMemoryOnProd = probe.storage === 'in-memory' && process.env.NODE_ENV === 'production'
    const healthy = probe.reachable && !inMemoryOnProd

    const body: Record<string, unknown> = {
      success: healthy,
      service: 'Quadis Hotels API Server',
      version: '1.0.0',
      status: healthy ? 'healthy' : 'degraded',
      storage: probe.storage,
      database: probe.reachable ? 'ok' : 'unreachable',
    }

    if (!probe.reachable) body.error = probe.error
    if (inMemoryOnProd) {
      body.error = 'Running in memory on production — DATABASE_URL is unset. Bookings will not survive a restart.'
    }

    // 503 so the deploy and cutover scripts fail loudly rather than printing
    // "api ok" over a broken box. install.sh:246 and cutover.sh:101/222/240 all
    // curl this with -f, which is the point: an install that leaves the app
    // without its database must not report success.
    res.status(healthy ? 200 : 503).json(body)
  })

  // Mount API route handlers
  app.use('/api/properties', propertiesRouter)
  app.use('/api/content', contentRouter)
  app.use('/api/bookings', bookingsRouter)
  app.use('/api/payments', paymentsRouter)
  app.use('/api/webhooks', webhooksRouter)
  app.use('/api/enquiries', enquiriesRouter)
  app.use('/api/auth', authRouter)
  // ResAvenue channel manager — see routes/ota.ts.
  app.use('/api/ota', otaRouter)

  // Sign-in must be reachable without a token; everything else is guarded.
  app.use('/api/admin', adminAuthRouter)
  app.use('/api/admin', requireAdmin, adminRouter)
  app.use('/api/ai', aiRouter) // /ai/logs carries requireAdmin on the route itself

  // Global 404 fallback
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' })
  })

  return app
}
