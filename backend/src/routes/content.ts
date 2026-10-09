import { Router, Request, Response } from 'express'
import { db } from '../db'

export const contentRouter = Router()

/**
 * GET /api/content — admin-edited copy overrides for the public site.
 *
 * Public and read-only: this is the text every visitor already sees. Writing to
 * it is PUT /api/admin/content, which sits behind requireAdmin.
 *
 * Returns only the keys an admin has actually overridden. Components hold their
 * own default string and use it whenever a key is absent, so an empty response
 * renders exactly the site as shipped — the API being down or unmigrated can
 * never blank a headline.
 */
contentRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const data = await db.getSiteContent()
    res.json({ success: true, data })
  } catch (err: any) {
    // Never fail the page over editable copy — an error here just means the
    // visitor sees the shipped defaults.
    console.error('Failed to load site content:', err)
    res.json({ success: true, data: {} })
  }
})
