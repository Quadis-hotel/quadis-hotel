import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'
import { seedProperties } from '../src/data/seed'

const app = createApp()

beforeEach(() => {
  db.initializeInMemorySeed()
})

describe('PATCH /api/admin/properties/:idOrSlug', () => {
  it('updates the fields a hotel manager owns', async () => {
    const res = await request(app)
      .patch('/api/admin/properties/hotel-quadis-sector-51-noida')
      .send({ name: 'Hotel Quadis Sector 51 — Renamed', base_price: 1899, rating: 4.8 })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Hotel Quadis Sector 51 — Renamed')
    expect(res.body.data.base_price).toBe(1899)
    expect(res.body.data.rating).toBe(4.8)
  })

  it('makes the new price the price a guest is actually charged', async () => {
    await request(app)
      .patch('/api/admin/properties/hotel-quadis-sector-51-noida')
      .send({ base_price: 2000 })

    const booking = await request(app).post('/api/bookings/initiate').send({
      propertySlug: 'hotel-quadis-sector-51-noida',
      roomTypeSlug: 'deluxe-room',
      checkIn: '2027-03-01',
      checkOut: '2027-03-03',
      roomsCount: 1,
      guestsCount: 2,
      guestName: 'Rate Check',
      guestPhone: '9876543210',
    })

    expect(booking.status).toBe(201)
    expect(Number(booking.body.data.total_amount)).toBe(2000 * 2)
  })

  it('surfaces the edit on the public properties endpoint', async () => {
    await request(app)
      .patch('/api/admin/properties/hotel-quadis-sector-51-noida')
      .send({ name: 'Publicly Visible Name' })

    const pub = await request(app).get('/api/properties/hotel-quadis-sector-51-noida')
    expect(pub.body.data.name).toBe('Publicly Visible Name')
  })

  it('can deactivate a property so it leaves the public list', async () => {
    const before = await request(app).get('/api/properties')
    const beforeCount = before.body.count

    await request(app)
      .patch('/api/admin/properties/hotel-quadis-sector-51-noida')
      .send({ is_active: false })

    const after = await request(app).get('/api/properties')
    expect(after.body.count).toBe(beforeCount - 1)
  })

  it('rejects a rating outside 0–5', async () => {
    const res = await request(app)
      .patch('/api/admin/properties/hotel-quadis-sector-51-noida')
      .send({ rating: 9 })

    expect(res.status).toBe(400)
  })

  it('refuses unknown fields rather than silently dropping them', async () => {
    const res = await request(app)
      .patch('/api/admin/properties/hotel-quadis-sector-51-noida')
      .send({ id: 'hijacked', slug: 'hijacked' })

    expect(res.status).toBe(400)
  })

  it('404s on a property that does not exist', async () => {
    const res = await request(app).patch('/api/admin/properties/no-such-hotel').send({ rating: 4 })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/room-types/:idOrSlug', () => {
  it('updates a room rate, and ignores a meal offset because meals are a percentage now', async () => {
    const res = await request(app)
      .patch('/api/admin/room-types/room-prop-2-deluxe-room')
      .send({ price_offset: 250, breakfast_offset: 400 })

    expect(res.status).toBe(200)
    expect(res.body.data.price_offset).toBe(250)

    // Not 400. Since 5 Aug 2026 breakfast is 25% of the base room rate, so this
    // column is derived rather than set — accepting the write would leave the
    // concierge quoting ₹400 while checkout charged the percentage. The request
    // still succeeds; the meal figure simply is not the admin's to type.
    expect(res.body.data.breakfast_offset).not.toBe(400)
  })

  it('flows the new room rate into the booking total', async () => {
    await request(app).patch('/api/admin/room-types/room-prop-2-deluxe-room').send({ price_offset: 500 })

    const booking = await request(app).post('/api/bookings/initiate').send({
      propertySlug: 'hotel-quadis-sector-51-noida',
      roomTypeSlug: 'deluxe-room',
      checkIn: '2027-03-01',
      checkOut: '2027-03-02',
      roomsCount: 1,
      guestsCount: 2,
      guestName: 'Offset Check',
      guestPhone: '9876543210',
    })

    // Read the base rate off the seed rather than hardcoding it — this test is
    // about the offset flowing through, not about what the room costs.
    const baseRate = Number(
      seedProperties.find((p) => p.slug === 'hotel-quadis-sector-51-noida')!.base_price
    )
    expect(Number(booking.body.data.total_amount)).toBe(baseRate + 500)
  })

  it('rejects a negative rate', async () => {
    const res = await request(app).patch('/api/admin/room-types/room-prop-2-deluxe-room').send({ price_offset: -100 })
    expect(res.status).toBe(400)
  })
})

describe('Editable site content', () => {
  it('starts empty so components render their shipped defaults', async () => {
    const res = await request(app).get('/api/content')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({})
  })

  it('saves an override and serves it publicly', async () => {
    const put = await request(app)
      .put('/api/admin/content')
      .send({ entries: { 'home.hero.title': 'Stay well in Delhi NCR' } })

    expect(put.status).toBe(200)

    const pub = await request(app).get('/api/content')
    expect(pub.body.data['home.hero.title']).toBe('Stay well in Delhi NCR')
  })

  it('clearing a value removes the override rather than blanking the section', async () => {
    await request(app).put('/api/admin/content').send({ entries: { 'home.hero.title': 'Temporary' } })
    await request(app).put('/api/admin/content').send({ entries: { 'home.hero.title': '' } })

    const pub = await request(app).get('/api/content')
    expect(pub.body.data['home.hero.title']).toBeUndefined()
  })

  it('rejects a text block beyond the length limit', async () => {
    const res = await request(app)
      .put('/api/admin/content')
      .send({ entries: { 'home.hero.title': 'x'.repeat(5001) } })

    expect(res.status).toBe(400)
  })
})
