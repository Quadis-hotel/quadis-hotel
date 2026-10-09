import { Router, Request, Response } from 'express'
import { db } from '../db'

export const propertiesRouter = Router()

// GET /api/properties - list all active properties
propertiesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const properties = await db.getProperties()
    // Photography travels with the list, not just the detail record: the
    // frontend's useHotels() reads this endpoint and every hotel card renders
    // from it, so omitting images here would leave cards on the bundled photos
    // while detail pages showed the uploaded ones.
    const withImages = await Promise.all(
      properties.map(async (p) => ({ ...p, images: await db.getPropertyImages(p.id) }))
    )
    res.json({ success: true, count: withImages.length, data: withImages })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch properties' })
  }
})

// GET /api/properties/:slug - get detailed property + room types
propertiesRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params
    const { property, roomTypes } = await db.getPropertyBySlug(slug)
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' })
    }
    // Uploaded photography, in the hotel's chosen order. Empty for a property
    // nobody has uploaded to yet, and the frontend then falls back to the
    // bundled images — so this is additive and never blanks a page.
    const images = await db.getPropertyImages(property.id)
    res.json({ success: true, data: { ...property, rooms: roomTypes, images } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch property details' })
  }
})
