import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../db'
import { razorpayService } from '../services/RazorpayService'
import { notificationService } from '../services/NotificationService'
import { imageStore } from '../services/ImageStore'
import { hashPassword, verifyPassword, signSession } from '../lib/auth'
import multer from 'multer'

export const adminRouter = Router()

/**
 * Public router — mounted ahead of the requireAdmin guard, because you cannot
 * present a token you have not been issued yet. Everything else on /api/admin
 * stays behind the guard.
 */
export const adminAuthRouter = Router()

/** 12 hours: a front desk shift, so staff sign in once a day, not once an hour. */
const ADMIN_SESSION_TTL = 60 * 60 * 12

/**
 * Six digits. Rejects the two shapes that make a PIN worthless — every digit
 * the same (`000000`) and a straight run (`123456`, `987654`) — because those
 * are the first guesses anyone makes and the client picking one silently is
 * worse than her picking nothing.
 */
function pinProblem(pin: unknown): string | null {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return 'PIN must be exactly 6 digits'
  if (/^(\d)\1{5}$/.test(pin)) return 'PIN cannot be the same digit six times'
  const digits = pin.split('').map(Number)
  const run = (step: number) => digits.every((d, i) => i === 0 || d === digits[i - 1] + step)
  if (run(1) || run(-1)) return 'PIN cannot be six digits in a row'
  return null
}

// POST /api/admin/auth — exchange the staff PIN for a signed admin session.
adminAuthRouter.post('/auth', async (req: Request, res: Response) => {
  const bootstrapPin = process.env.ADMIN_PIN
  const adminToken = process.env.ADMIN_PASSWORD

  // Fail closed rather than shipping a guessable default PIN.
  if (!bootstrapPin || !adminToken) {
    console.error('ADMIN_PIN / ADMIN_PASSWORD are not set — refusing admin sign-in.')
    return res.status(503).json({ success: false, error: 'Admin access is not configured' })
  }

  const { pin } = req.body ?? {}
  if (typeof pin !== 'string') {
    return res.status(401).json({ success: false, error: 'Invalid Admin PIN' })
  }

  // The stored PIN wins once it exists; ADMIN_PIN only ever bootstraps the
  // first sign-in on a fresh database.
  const storedHash = await db.getAdminPinHash()
  const usingBootstrap = storedHash === null
  const ok = usingBootstrap ? pin === bootstrapPin : await verifyPassword(pin, storedHash)

  if (!ok) {
    // The client was locked out on 4 Aug 2026 and this endpoint had said
    // nothing at all about it — the box logged no failed sign-in, so telling
    // "she is on the WhatsApp PIN and mistyped it" from "she changed her PIN
    // from the dashboard and forgot it" meant opening psql on production.
    // Those need completely different answers to her, so the difference has to
    // be in the journal.
    //
    // Length of the REJECTED attempt only, never the value, and never anything
    // about the accepted one: what is printed here is the caller's own input,
    // so it tells an attacker nothing they did not just type. A `stored` line
    // for an attempt of the right length is the signature of a forgotten
    // self-set PIN; `bootstrap` with a wrong length is a paste or a typo.
    console.warn(
      `Admin sign-in rejected — mode=${usingBootstrap ? 'bootstrap' : 'stored'} ` +
      `submitted_length=${pin.length} (expected 6)`
    )
    return res.status(401).json({ success: false, error: 'Invalid Admin PIN' })
  }

  const token = signSession({ sub: 'admin', email: '', role: 'admin' }, ADMIN_SESSION_TTL)
  if (!token) {
    // signSession returns null under NODE_ENV=production with no SESSION_SECRET.
    console.error('SESSION_SECRET is not set — cannot mint an admin session.')
    return res.status(503).json({ success: false, error: 'Admin access is not configured' })
  }

  res.json({
    success: true,
    token,
    expiresInSeconds: ADMIN_SESSION_TTL,
    // Drives the "change your PIN" prompt: true means she is still on the PIN
    // we generated and sent over WhatsApp, which is not a secret worth keeping.
    mustChangePin: usingBootstrap,
    message: 'Authenticated successfully as Hotel Management',
  })
})

// POST /api/admin/change-pin — the client sets her own PIN, no redeploy needed.
adminRouter.post('/change-pin', async (req: Request, res: Response) => {
  try {
    const { currentPin, newPin } = req.body ?? {}

    const problem = pinProblem(newPin)
    if (problem) return res.status(400).json({ success: false, error: problem })

    const storedHash = await db.getAdminPinHash()
    const bootstrapPin = process.env.ADMIN_PIN

    // Re-check the current PIN even though the caller already holds a valid
    // admin session: an unattended open dashboard must not be enough to lock
    // the owner out of her own panel.
    const currentOk =
      storedHash === null
        ? typeof currentPin === 'string' && !!bootstrapPin && currentPin === bootstrapPin
        : typeof currentPin === 'string' && (await verifyPassword(currentPin, storedHash))

    if (!currentOk) {
      return res.status(401).json({ success: false, error: 'Current PIN is incorrect' })
    }

    if (newPin === currentPin) {
      return res.status(400).json({ success: false, error: 'New PIN must be different from the current one' })
    }

    await db.setAdminPinHash(await hashPassword(newPin))

    // Existing sessions stay valid — including this one, so she is not logged
    // out mid-change. They expire on their own within ADMIN_SESSION_TTL.
    res.json({ success: true, message: 'Admin PIN updated' })
  } catch (err: any) {
    console.error('Error changing admin PIN:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to change PIN' })
  }
})

// GET /api/admin/dashboard — retrieve daily glance metrics, inventory, bookings, and leads
adminRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const metrics = await db.getGlanceMetrics()
    const properties = await db.getPropertiesWithRooms()
    const bookings = await db.getAllBookings(15)
    const enquiries = await db.getEnquiries()

    res.json({
      success: true,
      data: {
        metrics,
        properties,
        recentBookings: bookings,
        recentEnquiries: enquiries.slice(0, 15),
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch admin dashboard data' })
  }
})

// PATCH /api/admin/room-availability — one-tap mobile inventory toggle ([ Available ] vs [ Sold Out ])
adminRouter.patch('/room-availability', async (req: Request, res: Response) => {
  try {
    const { roomTypeId, propertySlug, isAvailable } = req.body
    if (!roomTypeId) {
      return res.status(400).json({ success: false, error: 'roomTypeId is required' })
    }

    const updatedRoom = await db.toggleRoomAvailability(roomTypeId, propertySlug, isAvailable)
    if (!updatedRoom) {
      return res.status(404).json({ success: false, error: 'Room category not found' })
    }

    res.json({
      success: true,
      message: `Room category status updated to ${updatedRoom.is_available ? 'AVAILABLE' : 'SOLD OUT'}`,
      data: updatedRoom,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to toggle room availability' })
  }
})

/* ---------------------------------------------------------------------------
 * Content editing
 *
 * Everything a hotel manager should be able to change without a developer.
 * Each schema is strict — unknown keys are rejected rather than silently
 * dropped, so a typo in the admin UI surfaces instead of appearing to save.
 * ------------------------------------------------------------------------- */

const money = z.number().nonnegative('Must be zero or more').max(1_000_000, 'Unreasonably large')

const propertyPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(128),
    city: z.enum(['Noida', 'New Delhi']),
    address: z.string().trim().min(5),
    map_link: z.string().trim().url('Must be a valid URL').or(z.literal('')),
    phone: z.string().trim().min(10).max(20),
    whatsapp: z.string().trim().min(10).max(20),
    email: z.string().trim().email(),
    base_price: money,
    rating: z.number().min(0, 'Rating cannot be negative').max(5, 'Rating cannot exceed 5'),
    is_active: z.boolean(),
    weekend_surcharge_percent: z.number().min(0).max(100, 'Surcharge cannot exceed 100%'),
    // Occupancy policy. Capped so a slipped decimal cannot quietly multiply a
    // guest's bill, and the free-child age is bounded to childhood.
    extra_adult_percent: z
      .number()
      .min(0, 'Cannot be negative')
      .max(200, 'A triple-occupancy uplift above 200% looks wrong — check the figure'),
    child_percent: z.coerce.number().min(0).max(100).optional(),
  adult_from_age: z.coerce.number().int().min(0).max(30).optional(),
  child_free_under_age: z
      .number()
      .int('Enter a whole number of years')
      .min(0, 'Cannot be negative')
      .max(18, 'Guests 18 and over are adults'),
  })
  .partial()
  .strict()

const roomPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(128),
    description: z.string().trim().max(2000),
    size_sqft: z.string().trim().max(32),
    bed_type: z.string().trim().max(64),
    max_guests: z.number().int().min(1).max(20),
    price_offset: money,
    // Accepted, then ignored by the DB layer — they are no longer in
    // ROOM_EDITABLE. Meal plans went group-wide percentage on 5 Aug 2026
    // (EP 0 / CP 25 / MAP 50) and the admin form stopped sending these.
    //
    // They stay listed ONLY because this schema is .strict(): dropping them
    // turns a harmless no-op into a 400 for any manager whose browser is still
    // running the previous bundle. Remove them once no stale tab can be live —
    // a deploy or two from now, not in the same release that stops sending them.
    breakfast_offset: money,
    all_meals_offset: money,
    total_units: z.number().int().min(0).max(500),
    is_available: z.boolean(),
  })
  .partial()
  .strict()

// PATCH /api/admin/properties/:idOrSlug — edit a property record
adminRouter.patch('/properties/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const parsed = propertyPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid property update',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const updated = await db.updateProperty(req.params.idOrSlug!, parsed.data)
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Property not found' })
    }

    res.json({ success: true, message: `${updated.name} updated`, data: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update property' })
  }
})

// PATCH /api/admin/room-types/:id — edit a room category and its rates.
// Id only: `deluxe-room` is a slug shared by every property.
adminRouter.patch('/room-types/:id', async (req: Request, res: Response) => {
  try {
    const parsed = roomPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room update',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const updated = await db.updateRoomType(req.params.id!, parsed.data)
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Room category not found' })
    }

    res.json({ success: true, message: `${updated.name} updated`, data: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update room category' })
  }
})

/* ------------------------------------------------------------------
 * Property photography
 *
 * Photos used to require a developer, a rebuild and a redeploy. These three
 * routes are what make them editable, and they answer the client's actual
 * complaint — that some hotels display other hotels' rooms.
 * ------------------------------------------------------------------ */

/**
 * In memory, then straight to storage: the file is resized before it is kept,
 * so writing the original to disk first would only add a temp file to clean up.
 * 12 MB is comfortably above a phone photo and well under what would let a
 * single request exhaust the instance.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    // Trust the decoder, not the extension — sharp rejects anything that is not
    // really an image, and this only filters the obvious cases early.
    if (/^image\/(jpe?g|png|webp|avif|heic|heif)$/i.test(file.mimetype)) return cb(null, true)
    cb(new Error(`Unsupported file type: ${file.mimetype}`))
  },
})

/** 503 rather than a silent success when storage is not configured. */
const requireStore = (res: Response): boolean => {
  if (imageStore) return true
  res.status(503).json({
    success: false,
    error: 'Photo storage is not configured. Set IMAGE_BUCKET on the server.',
  })
  return false
}

// POST /api/admin/properties/:idOrSlug/images — upload one or more photos.
adminRouter.post('/properties/:idOrSlug/images', upload.array('photos', 10), async (req: Request, res: Response) => {
  try {
    if (!requireStore(res)) return

    const property = await db.getPropertyByIdOrSlug(req.params.idOrSlug!)
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' })

    const files = (req.files as Express.Multer.File[]) || []
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'No photos were attached' })
    }

    const saved = []
    for (const file of files) {
      const stored = await imageStore!.save({
        buffer: file.buffer,
        propertySlug: property.slug,
        originalName: file.originalname,
      })
      saved.push(await db.addPropertyImage({
        property_id: property.id,
        url: stored.url,
        thumb_url: stored.thumbUrl,
        storage_key: stored.storageKey,
        alt_text: typeof req.body?.alt_text === 'string' ? req.body.alt_text.slice(0, 255) : null,
      }))
    }

    res.status(201).json({
      success: true,
      message: `${saved.length} photo${saved.length === 1 ? '' : 's'} added to ${property.name}`,
      data: saved,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Upload failed' })
  }
})

// DELETE /api/admin/images/:id — remove a photo and its stored files.
adminRouter.delete('/images/:id', async (req: Request, res: Response) => {
  try {
    const img = await db.getPropertyImageById(req.params.id!)
    if (!img) return res.status(404).json({ success: false, error: 'Photo not found' })

    // Row first: an orphaned object costs pennies, a row pointing at a deleted
    // file renders a broken image on the live site.
    await db.deletePropertyImage(img.id)
    if (imageStore) await imageStore.remove(img.storage_key)

    res.json({ success: true, message: 'Photo removed' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Delete failed' })
  }
})

const reorderSchema = z.object({ order: z.array(z.string()).min(1) })

// PATCH /api/admin/properties/:idOrSlug/images/order — set the display order.
adminRouter.patch('/properties/:idOrSlug/images/order', async (req: Request, res: Response) => {
  try {
    const parsed = reorderSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Expected { order: [imageId, ...] }' })
    }
    const property = await db.getPropertyByIdOrSlug(req.params.idOrSlug!)
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' })

    await db.reorderPropertyImages(property.id, parsed.data.order)
    res.json({ success: true, data: await db.getPropertyImages(property.id) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Reorder failed' })
  }
})

const contentSchema = z.object({
  // Values only — keys are defined by the components that read them.
  entries: z.record(z.string(), z.string().max(5000, 'Text block is too long')),
})

// PUT /api/admin/content — overwrite editable copy blocks
adminRouter.put('/content', async (req: Request, res: Response) => {
  try {
    const parsed = contentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid content payload',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const saved = await db.setSiteContent(parsed.data.entries)
    res.json({ success: true, message: 'Website content updated', data: saved })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to save content' })
  }
})

// PATCH /api/admin/surcharge — weekend / seasonal +15% surcharge toggle
adminRouter.patch('/surcharge', async (req: Request, res: Response) => {
  try {
    const { surchargePercent, propertyId } = req.body
    if (typeof surchargePercent !== 'number' || surchargePercent < 0) {
      return res.status(400).json({ success: false, error: 'Valid surchargePercent (>= 0) is required' })
    }

    await db.updateWeekendSurcharge(propertyId || 'all', surchargePercent)
    const updatedProperties = await db.getPropertiesWithRooms()
    res.json({
      success: true,
      message: `Weekend surcharge updated to ${surchargePercent}% across ${propertyId === 'all' || !propertyId ? 'all properties' : 'selected property'}`,
      data: updatedProperties,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update weekend surcharge' })
  }
})

// POST /api/admin/payment-link — instant payment link generator for walk-ins / inquiries
adminRouter.post('/payment-link', async (req: Request, res: Response) => {
  try {
    const { phone, amount, description, guestName, propertyName } = req.body
    if (!phone || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Guest phone and positive amount are required' })
    }

    const enq = await db.createEnquiry({
      enquiry_type: 'ROOM_HOLD',
      guest_name: guestName || 'Walk-in / Custom Guest',
      guest_phone: phone,
      message: description || `Instant admin payment link (${propertyName || 'Quadis Hotel'})`,
    })

    const linkRes = await razorpayService.createEnquiryPaymentLink({
      enquiryId: enq.id,
      amount: Number(amount),
      guestName: enq.guest_name,
      guestPhone: enq.guest_phone,
      description: description || `Payment for ${propertyName || 'Quadis Hotel'}`,
    })

    if (linkRes.paymentLinkId) {
      await db.updateEnquiryStatus(enq.id, 'LINK_SENT', linkRes.paymentLinkId)
    }

    res.json({
      success: true,
      message: 'Instant payment link generated and recorded',
      data: {
        enquiryId: enq.id,
        paymentLinkId: linkRes.paymentLinkId,
        shortUrl: linkRes.shortUrl,
        isSimulated: linkRes.isSimulated,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate admin payment link' })
  }
})
