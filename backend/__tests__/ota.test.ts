import request from 'supertest'
import { createApp } from '../src/app'
import { db } from '../src/db'
import { seedRoomTypes } from '../src/data/seed'
import { runChannelSyncOnce } from '../src/workers/channelSync'
import { propertyOtaCode, roomOtaCode, ratePlanOtaCode } from '../src/lib/channel'

/**
 * The ResAvenue channel-manager API, exercised the way ResAvenue will call it:
 * one JSON message per request, credentials in the POS block, and every reply
 * checked against the shapes in the v2.0 guide.
 *
 * Credentials are test-only values set here, never a real pair (AGENTS.md
 * §2 rule 1b — this repo is public).
 */
const USER = 'resavenue-test'
const PASS = 'not-a-real-password'

const app = createApp()

/** Quadis Sector 51: prop-2, HotelCode 2, Deluxe 201, Super 202. */
const HOTEL = '2'
const DELUXE = 'room-prop-2-deluxe-room'
const DELUXE_CODE = 201
const DELUXE_EP = 2011
const DELUXE_CP = 2012
const deluxeKeys = seedRoomTypes.find((r) => r.id === DELUXE)!.total_units

const fetchPos = { Username: USER, Password: PASS, ID_Context: 'REV' }
const updatePos = { RequestorID: { User: USER, ID_Context: '', Password: PASS } }

const ota = (path: string, body: object) => request(app).post(`/api/ota${path}`).send(body)

/** A future date, N days from today, as YYYY-MM-DD. */
const daysAhead = (n: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Far enough out that the tests never collide with the cut-off test, which
// works in days from today, and never with a real calendar's weekend surcharge
// (seeded at 0 anyway).
const D1 = '2027-03-10'
const D2 = '2027-03-11'
const D3 = '2027-03-12'

const holdPayload = (overrides: Record<string, unknown> = {}) => ({
  propertySlug: 'hotel-quadis-sector-51-noida',
  roomTypeSlug: 'deluxe-room',
  checkIn: D1,
  checkOut: D3,
  roomsCount: 1,
  guestsCount: 2,
  guestName: 'Priya Sharma',
  guestPhone: '9876543210',
  guestEmail: 'priya@example.com',
  ...overrides,
})

describe('ResAvenue OTA API', () => {
  beforeEach(() => {
    db.initializeInMemorySeed()
    process.env.RESAVENUE_OTA_USERNAME = USER
    process.env.RESAVENUE_OTA_PASSWORD = PASS
    delete process.env.RESAVENUE_OTA_ID_CONTEXT
    delete process.env.RESAVENUE_PUSH_URL
  })

  describe('codes', () => {
    test('are derived from the seed ids and stable', () => {
      expect(propertyOtaCode({ id: 'prop-2' })).toBe(2)
      expect(roomOtaCode({ property_id: 'prop-2', slug: 'deluxe-room' })).toBe(DELUXE_CODE)
      expect(roomOtaCode({ property_id: 'prop-11', slug: 'superior-room' })).toBe(1103)
      expect(ratePlanOtaCode({ property_id: 'prop-2', slug: 'deluxe-room' }, 'With Breakfast')).toBe(DELUXE_CP)
    })
  })

  describe('authentication', () => {
    test('fails closed with 503 when no credentials are configured', async () => {
      delete process.env.RESAVENUE_OTA_USERNAME
      const res = await ota('/property-details', { OTA_HotelDetailsRQ: { POS: fetchPos, HotelCode: HOTEL } })
      expect(res.status).toBe(503)
      expect(res.body.OTA_HotelDetailsRS.Status).toBe('Failure')
    })

    test('rejects a wrong password and a missing POS block with 401', async () => {
      const wrong = await ota('/property-details', {
        OTA_HotelDetailsRQ: { POS: { ...fetchPos, Password: 'nope' }, HotelCode: HOTEL },
      })
      expect(wrong.status).toBe(401)
      expect(wrong.body.OTA_HotelDetailsRS.Remark).toBe('Authentication failed')

      const missing = await ota('/property-details', { OTA_HotelDetailsRQ: { HotelCode: HOTEL } })
      expect(missing.status).toBe(401)
    })

    test('accepts HTTP Basic auth in place of the POS block, and PUT as well as POST', async () => {
      const res = await request(app)
        .put('/api/ota/property-details')
        .auth(USER, PASS)
        .send({ OTA_HotelDetailsRQ: { HotelCode: HOTEL } })
      expect(res.status).toBe(200)
      expect(res.body.OTA_HotelDetailsRS[0].HotelDetail.hotel_id).toBe(2)
    })

    test('checks ID_Context only when one is configured', async () => {
      process.env.RESAVENUE_OTA_ID_CONTEXT = 'QUADIS'
      const bad = await ota('/property-details', { OTA_HotelDetailsRQ: { POS: fetchPos, HotelCode: HOTEL } })
      expect(bad.status).toBe(401)
      const good = await ota('/property-details', {
        OTA_HotelDetailsRQ: { POS: { ...fetchPos, ID_Context: 'QUADIS' }, HotelCode: HOTEL },
      })
      expect(good.status).toBe(200)
    })
  })

  describe('II. Property Details — Fetch', () => {
    test('returns the hotel, its rooms and three rate plans per room', async () => {
      const res = await ota('/property-details', {
        OTA_HotelDetailsRQ: { POS: fetchPos, TimeStamp: '20151015T15:22:50', EchoToken: 'abc1323', HotelCode: HOTEL },
      })
      expect(res.status).toBe(200)
      const [hotel] = res.body.OTA_HotelDetailsRS
      expect(hotel.HotelDetail).toEqual({ hotel_id: 2, hotel_name: 'Hotel Quadis Sector 51' })
      expect(hotel.RoomTypes).toHaveLength(2)
      const deluxe = hotel.RoomTypes.find((r: any) => r.room_id === DELUXE_CODE)
      expect(deluxe.room_name).toBe('Deluxe Room')
      expect(deluxe.base_occupancy).toBe(2)
      expect(deluxe.room_status).toBe('active')
      expect(deluxe.RatePlans.map((p: any) => p.rate_id)).toEqual([2011, 2012, 2013])
      expect(deluxe.RatePlans[1].rate_name).toBe('Deluxe Room - CP (With Breakfast)')
      expect(deluxe.RatePlans[0].valid_from <= deluxe.RatePlans[0].valid_to).toBe(true)
    })

    test('accepts the slug or the id as HotelCode and rejects an unknown one', async () => {
      const bySlug = await ota('/property-details', {
        OTA_HotelDetailsRQ: { POS: fetchPos, HotelCode: 'hotel-amar-inn' },
      })
      expect(bySlug.body.OTA_HotelDetailsRS[0].HotelDetail.hotel_id).toBe(10)

      const unknown = await ota('/property-details', { OTA_HotelDetailsRQ: { POS: fetchPos, HotelCode: '999' } })
      expect(unknown.status).toBe(200)
      expect(unknown.body.OTA_HotelDetailsRS.Status).toBe('Failure')
      expect(unknown.body.OTA_HotelDetailsRS.Remark).toMatch(/Unknown HotelCode/)
    })
  })

  describe('III / IV. Inventory', () => {
    const fetchInv = (codes: unknown, start = D1, end = D2) =>
      ota('/inventory/fetch', {
        OTA_HotelInventoryRQ: { POS: fetchPos, EchoToken: 'e1', HotelCode: HOTEL, Start: start, End: end, InvCodes: codes },
      })

    test('fetch reports sellable units per night, net of holds', async () => {
      const before = await fetchInv([DELUXE_CODE, 202])
      expect(before.status).toBe(200)
      const rs = before.body.OTA_HotelInventoryRS
      expect(rs.HotelCode).toBe('2')
      expect(rs.POS.Password).toBe('')
      expect(rs.EchoToken).toBe('e1')
      expect(rs.Inventories).toHaveLength(2)
      const deluxe = rs.Inventories.find((i: any) => i.InvCode === DELUXE_CODE)
      expect(deluxe.Inventory).toEqual([
        { Date: D1, InvCount: deluxeKeys, StopSell: false, CloseOnArrival: false, CloseOnDeparture: false, CutOff: 0 },
        { Date: D2, InvCount: deluxeKeys, StopSell: false, CloseOnArrival: false, CloseOnDeparture: false, CutOff: 0 },
      ])

      const hold = await request(app).post('/api/bookings/initiate').send(holdPayload({ roomsCount: 2, guestsCount: 4 }))
      expect(hold.status).toBe(201)

      const after = await fetchInv('201')
      const nights = after.body.OTA_HotelInventoryRS.Inventories[0].Inventory
      expect(nights[0].InvCount).toBe(deluxeKeys - 2)
      expect(nights[1].InvCount).toBe(deluxeKeys - 2)
    })

    test('fetch defaults End to Start and rejects an unknown InvCode', async () => {
      const one = await ota('/inventory/fetch', {
        OTA_HotelInventoryRQ: { POS: fetchPos, HotelCode: HOTEL, Start: D1, InvCodes: [DELUXE_CODE] },
      })
      expect(one.body.OTA_HotelInventoryRS.Inventories[0].Inventory).toHaveLength(1)

      const bad = await fetchInv([999])
      expect(bad.body.OTA_HotelInventoryRS.Status).toBe('Failure')
      expect(bad.body.OTA_HotelInventoryRS.Remark).toMatch(/Unknown InvCode/)
    })

    test('update sets the count and restrictions, and the booking engine obeys them', async () => {
      const res = await ota('/inventory/update', {
        OTA_HotelInvCountNotifRQ: {
          EchoToken: 'abc1323', TimeStamp: '2015-10-15T15:22:50', Target: 'Production', Version: '',
          HotelCode: HOTEL, HotelName: 'Demo Hotel', POS: updatePos,
          Inventories: [
            {
              StatusApplicationControl: { Start: D1, End: D2, InvTypeCode: String(DELUXE_CODE) },
              InvCounts: { InvCount: '3', CutOff: '0', CloseOnArrival: 'False', CloseOnDeparture: 'False', StopSell: 'False' },
            },
            {
              StatusApplicationControl: { Start: D3, End: D3, InvTypeCode: String(DELUXE_CODE) },
              InvCounts: { StopSell: 'True' },
            },
          ],
        },
      })
      expect(res.status).toBe(200)
      expect(res.body.OTA_HotelInvCountNotifRS).toMatchObject({ EchoToken: 'abc1323', Target: 'Production', Status: 'Success', Remark: '' })

      const inv = (await fetchInv(DELUXE_CODE, D1, D3)).body.OTA_HotelInventoryRS.Inventories[0].Inventory
      expect(inv[0]).toMatchObject({ Date: D1, InvCount: 3, StopSell: false })
      expect(inv[2]).toMatchObject({ Date: D3, InvCount: deluxeKeys, StopSell: true })

      // The site now sells at most 3 on those nights, not the 25 keys.
      const tooMany = await request(app).post('/api/bookings/initiate').send(holdPayload({ roomsCount: 4, guestsCount: 8 }))
      expect(tooMany.status).toBe(400)
      expect(tooMany.body.error).toBe('Only 3 units available for these dates')

      const ok = await request(app).post('/api/bookings/initiate').send(holdPayload({ roomsCount: 3, guestsCount: 6 }))
      expect(ok.status).toBe(201)

      // A stop-sold night blocks any stay that includes it.
      const closed = await request(app).post('/api/bookings/initiate').send(holdPayload({ checkIn: D2, checkOut: '2027-03-13' }))
      expect(closed.status).toBe(400)
      expect(closed.body.error).toBe(`This room is closed for sale on ${D3}`)
      expect(await db.getAvailableUnits(DELUXE, D2, '2027-03-13')).toBe(0)
    })

    test('closed arrival, closed departure and cut-off each block a stay', async () => {
      await ota('/inventory/update', {
        OTA_HotelInvCountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          Inventories: [
            { StatusApplicationControl: { Start: D1, End: D1, InvTypeCode: String(DELUXE_CODE) }, InvCounts: { CloseOnArrival: 'True' } },
            { StatusApplicationControl: { Start: D3, End: D3, InvTypeCode: String(DELUXE_CODE) }, InvCounts: { CloseOnDeparture: 'True' } },
          ],
        },
      })
      const arrival = await request(app).post('/api/bookings/initiate').send(holdPayload({ checkIn: D1, checkOut: D2 }))
      expect(arrival.body.error).toBe(`Arrivals are closed on ${D1}`)
      const departure = await request(app).post('/api/bookings/initiate').send(holdPayload({ checkIn: D2, checkOut: D3 }))
      expect(departure.body.error).toBe(`Departures are closed on ${D3}`)

      const soon = daysAhead(2)
      await ota('/inventory/update', {
        OTA_HotelInvCountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          Inventories: [{ StatusApplicationControl: { Start: soon, End: soon, InvTypeCode: String(DELUXE_CODE) }, InvCounts: { CutOff: '5' } }],
        },
      })
      const late = await request(app).post('/api/bookings/initiate').send(holdPayload({ checkIn: soon, checkOut: daysAhead(3) }))
      expect(late.body.error).toBe('This room must be booked at least 5 days before arrival')
    })

    test('the Days filter limits an update to the named weekdays', async () => {
      // 2027-03-10 is a Wednesday. Close Wed only across a Wed–Fri range.
      await ota('/inventory/update', {
        OTA_HotelInvCountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          Inventories: [{
            StatusApplicationControl: { Start: D1, End: D3, InvTypeCode: String(DELUXE_CODE) },
            InvCounts: { Days: [{ Mon: 'False', Tue: 'False', Weds: 'True', Thur: 'False', Fri: 'False', Sat: 'False', Sun: 'False' }], InvCount: '1' },
          }],
        },
      })
      const inv = (await fetchInv(DELUXE_CODE, D1, D3)).body.OTA_HotelInventoryRS.Inventories[0].Inventory
      expect(inv.map((n: any) => n.InvCount)).toEqual([1, deluxeKeys, deluxeKeys])
    })

    test('update is all-or-nothing and reports the bad entry', async () => {
      const res = await ota('/inventory/update', {
        OTA_HotelInvCountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          Inventories: [
            { StatusApplicationControl: { Start: D1, End: D1, InvTypeCode: String(DELUXE_CODE) }, InvCounts: { InvCount: '2' } },
            { StatusApplicationControl: { Start: D1, End: D1, InvTypeCode: '999' }, InvCounts: { InvCount: '2' } },
          ],
        },
      })
      expect(res.status).toBe(200)
      expect(res.body.OTA_HotelInvCountNotifRS.Status).toBe('Failure')
      expect(res.body.OTA_HotelInvCountNotifRS.Remark).toMatch(/Inventories\[1\]: unknown InvTypeCode "999"/)
      const inv = (await fetchInv(DELUXE_CODE)).body.OTA_HotelInventoryRS.Inventories[0].Inventory
      expect(inv[0].InvCount).toBe(deluxeKeys)
    })
  })

  describe('V / VI. Rates', () => {
    const fetchRates = (codes: unknown, start = D1, end = D2) =>
      ota('/rates/fetch', {
        OTA_HotelRateRQ: { POS: fetchPos, EchoToken: 'r1', HotelCode: HOTEL, Start: start, End: end, RateCodes: codes },
      })

    test("fetch reports the site's own pricing when nothing has been pushed", async () => {
      const res = await fetchRates([DELUXE_EP, DELUXE_CP])
      expect(res.status).toBe(200)
      const rs = res.body.OTA_HotelRateRS
      expect(rs.HotelCode).toBe('2')
      expect(rs.Rates).toHaveLength(2)
      // Quadis 51 Deluxe is ₹1,500 for two; +30% extra adult, +20% child; CP +25%.
      expect(rs.Rates[0].RateCode).toBe(DELUXE_EP)
      expect(rs.Rates[0].Rate[0]).toEqual({
        Date: D1, Single: 1500, Double: 1500, Triple: 1950, Quad: 2400,
        ExtraPax: 450, ExtraChild: 300, MinStay: 1, MaxStay: 30, StopSell: false,
      })
      expect(rs.Rates[1].Rate[0]).toMatchObject({ Single: 1875, Double: 1875, ExtraPax: 563 })
    })

    test('update stores the pushed figures and the checkout charges them', async () => {
      const res = await ota('/rates/update', {
        OTA_HotelRateAmountNotifRQ: {
          EchoToken: 'abc1323', Target: 'Production', HotelCode: HOTEL, POS: updatePos,
          RateAmountMessages: [{
            StatusApplicationControl: { InvTypeCode: String(DELUXE_CODE), RatePlanCode: String(DELUXE_EP), Start: D1, End: D2 },
            Rates: {
              Days: [{ Mon: 'True', Tue: 'True', Weds: 'True', Thur: 'True', Fri: 'True', Sat: 'True', Sun: 'True' }],
              BaseByGuestAmts: [
                { Amount: '1201.0', NumberOfGuests: '1' },
                { Amount: '1700.0', NumberOfGuests: '2' },
              ],
              AdditionalGuestAmounts: [
                { GuestType: 'ExtraAdult1', Amount: '200' },
                { GuestType: 'Child1', Amount: '100' },
              ],
              MinStay: '1', MaxStay: '10', StopSell: 'False',
            },
          }],
        },
      })
      expect(res.status).toBe(200)
      expect(res.body.OTA_HotelRateAmountNotifRS).toMatchObject({ EchoToken: 'abc1323', Status: 'Success' })

      const night = (await fetchRates(DELUXE_EP)).body.OTA_HotelRateRS.Rates[0].Rate[0]
      // Sent occupancies are taken as given; unsent ones follow the new double.
      expect(night).toEqual({
        Date: D1, Single: 1201, Double: 1700, Triple: 1900, Quad: 2100,
        ExtraPax: 200, ExtraChild: 100, MinStay: 1, MaxStay: 10, StopSell: false,
      })
      // The CP plan is a separate rate plan and was not touched.
      const cp = (await fetchRates(DELUXE_CP)).body.OTA_HotelRateRS.Rates[0].Rate[0]
      expect(cp.Double).toBe(1875)

      // Two nights for two adults at the pushed rate.
      const hold = await request(app).post('/api/bookings/initiate').send(holdPayload())
      expect(hold.status).toBe(201)
      expect(Number(hold.body.data.total_amount)).toBe(3400)
      expect(hold.body.data.meal_plan).toBe('Room Only')

      // A third adult pays the pushed ₹200 a night, not 30%.
      const triple = await request(app).post('/api/bookings/initiate').send(holdPayload({ guestsCount: 3, adultsCount: 3, childAges: [] }))
      expect(triple.status).toBe(201)
      expect(Number(triple.body.data.total_amount)).toBe(3800)

      // Breakfast was not repriced, so it still costs the site's own figure.
      const cpHold = await request(app).post('/api/bookings/initiate').send(holdPayload({ mealPlan: 'With Breakfast' }))
      expect(Number(cpHold.body.data.total_amount)).toBe(3750)
    })

    test('min stay, max stay and a rate-level stop sell bound the stay', async () => {
      await ota('/rates/update', {
        OTA_HotelRateAmountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          RateAmountMessages: [{
            StatusApplicationControl: { InvTypeCode: String(DELUXE_CODE), RatePlanCode: String(DELUXE_EP), Start: D1, End: D1 },
            Rates: { BaseByGuestAmts: [{ Amount: '1500', NumberOfGuests: '2' }], MinStay: '3' },
          }],
        },
      })
      const short = await request(app).post('/api/bookings/initiate').send(holdPayload())
      expect(short.body.error).toBe(`A minimum stay of 3 nights applies from ${D1}`)

      await ota('/rates/update', {
        OTA_HotelRateAmountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          RateAmountMessages: [{
            StatusApplicationControl: { InvTypeCode: String(DELUXE_CODE), RatePlanCode: String(DELUXE_CP), Start: D2, End: D2 },
            Rates: { BaseByGuestAmts: [{ Amount: '1800', NumberOfGuests: '2' }], StopSell: 'True' },
          }],
        },
      })
      const closedCp = await request(app).post('/api/bookings/initiate').send(holdPayload({ checkIn: D2, checkOut: D3, mealPlan: 'With Breakfast' }))
      expect(closedCp.body.error).toBe(`This rate is closed for sale on ${D2}`)
      // Room Only on the same night is a different rate plan and still sells.
      const openEp = await request(app).post('/api/bookings/initiate').send(holdPayload({ checkIn: D2, checkOut: D3 }))
      expect(openEp.status).toBe(201)
    })

    test('update validates codes, amounts and plan ownership', async () => {
      const mismatch = await ota('/rates/update', {
        OTA_HotelRateAmountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          RateAmountMessages: [{
            StatusApplicationControl: { InvTypeCode: '202', RatePlanCode: String(DELUXE_EP), Start: D1, End: D1 },
            Rates: { BaseByGuestAmts: [{ Amount: '1500', NumberOfGuests: '2' }] },
          }],
        },
      })
      expect(mismatch.body.OTA_HotelRateAmountNotifRS.Status).toBe('Failure')
      expect(mismatch.body.OTA_HotelRateAmountNotifRS.Remark).toMatch(/does not belong to InvTypeCode 202/)

      const tooBig = await ota('/rates/update', {
        OTA_HotelRateAmountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          RateAmountMessages: [{
            StatusApplicationControl: { InvTypeCode: String(DELUXE_CODE), RatePlanCode: String(DELUXE_EP), Start: D1, End: D1 },
            Rates: { BaseByGuestAmts: [{ Amount: '99999999', NumberOfGuests: '2' }] },
          }],
        },
      })
      expect(tooBig.body.OTA_HotelRateAmountNotifRS.Remark).toMatch(/between 1 and 1000000/)

      const badDate = await ota('/rates/update', {
        OTA_HotelRateAmountNotifRQ: {
          HotelCode: HOTEL, POS: updatePos,
          RateAmountMessages: [{
            StatusApplicationControl: { InvTypeCode: String(DELUXE_CODE), RatePlanCode: String(DELUXE_EP), Start: '2027-02-30', End: D1 },
            Rates: { BaseByGuestAmts: [{ Amount: '1500', NumberOfGuests: '2' }] },
          }],
        },
      })
      expect(badDate.body.OTA_HotelRateAmountNotifRS.Remark).toMatch(/Start must be a date/)
    })
  })

  describe('single-URL dispatcher', () => {
    test('routes on the root key and rejects an unknown message', async () => {
      const res = await ota('/resavenue', { OTA_HotelDetailsRQ: { POS: fetchPos, HotelCode: HOTEL } })
      expect(res.status).toBe(200)
      expect(res.body.OTA_HotelDetailsRS[0].HotelDetail.hotel_id).toBe(2)

      const unknown = await ota('/resavenue', { OTA_SomethingElseRQ: {} })
      expect(unknown.body.OTA_ErrorRS.Status).toBe('Failure')
    })

    test('GET /codes lists the mapping for whoever configures ResAvenue', async () => {
      const res = await request(app).get('/api/ota/codes').auth(USER, PASS)
      expect(res.status).toBe(200)
      const hotel = res.body.data.find((h: any) => h.HotelCode === 2)
      expect(hotel.RoomTypes[0]).toMatchObject({ InvTypeCode: DELUXE_CODE, room_name: 'Deluxe Room' })
      expect(hotel.RoomTypes[0].RatePlans.map((p: any) => p.RatePlanCode)).toEqual([2011, 2012, 2013])

      const anon = await request(app).get('/api/ota/codes')
      expect(anon.status).toBe(401)
    })
  })

  describe('VII. Booking pull and push', () => {
    /** Hold, then confirm through the simulated Razorpay webhook. */
    const confirmedBooking = async (overrides: Record<string, unknown> = {}) => {
      const hold = await request(app).post('/api/bookings/initiate').send(holdPayload(overrides))
      expect(hold.status).toBe(201)
      const code = hold.body.data.booking_code as string
      const hook = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', 'simulated')
        .send({ simulated_event: 'payment.captured', bookingCode: code, paymentId: `pay_${code}` })
      expect(hook.status).toBe(200)
      return (await db.getBookingByCode(code))!
    }

    test('an unpaid hold owes nothing; a paid booking owes a Confirm', async () => {
      const hold = await request(app).post('/api/bookings/initiate').send(holdPayload())
      expect(hold.body.data.cm_sync_status).toBe('NONE')

      const booking = await confirmedBooking({ guestsCount: 3, adultsCount: 2, childAges: [10] })
      expect(booking.cm_sync_status).toBe('PENDING')
      expect(booking.cm_res_status).toBe('Confirm')
    })

    test('pull returns confirmed reservations in the window, in the guide shape, and marks them delivered', async () => {
      const booking = await confirmedBooking({ guestsCount: 3, adultsCount: 2, childAges: [10], companyName: 'Acme Ltd', gstin: '07AAAAA0000A1Z5' })
      const today = new Date().toISOString().slice(0, 10)

      const res = await ota('/bookings/pull', {
        OTA_HotelResNotifRQ: { POS: fetchPos, EchoToken: 'p1', Target: 'Production', PropertyId: HOTEL, FromDate: today, ToDate: today },
      })
      expect(res.status).toBe(200)
      const rq = res.body.OTA_HotelResNotifRQ
      expect(rq.EchoToken).toBe('p1')
      expect(rq.Version).toBe('1.0')
      expect(rq.HotelReservations).toHaveLength(1)
      const r = rq.HotelReservations[0].HotelReservation[0]
      expect(r.UniqueID).toEqual({ ID: booking.booking_code, OTA: 'Quadis Hotels', BookingSource: 'quadishotels.com' })
      expect(r.ResStatus).toBe('Confirm')
      const stay = r.RoomStays.RoomStay[0]
      expect(stay.TimeSpan).toEqual({ Start: D1, End: D3 })
      expect(stay.BasicPropertyInfo).toEqual({ HotelCode: '2', HotelName: 'Hotel Quadis Sector 51' })
      expect(stay.GuestCounts.GuestCount).toEqual([
        { Count: '2', AgeQualifyingCode: '10' },
        { Count: '1', AgeQualifyingCode: '8' },
      ])
      expect(stay.RoomTypes.RoomType).toEqual({ NumberOfUnits: '1', RoomDescription: { Name: 'Deluxe Room' }, RoomTypeCode: '201' })
      expect(stay.RatePlans.RatePlan).toEqual({ RatePlanName: 'Deluxe Room - EP (Room Only)', RatePlanCode: '2011' })
      // Two adults and a 10-year-old: 1500 + 20% child = 1800 a night, two nights.
      expect(stay.Total).toEqual({ CurrencyCode: 'INR', Amount: 3600 })
      expect(stay.RoomRates.RoomRate.Rates).toEqual([
        { Amount: 1800, EffectiveDate: D1 },
        { Amount: 1800, EffectiveDate: D2 },
      ])
      expect(r.ResGlobalInfo.Total).toMatchObject({ CurrencyCode: 'INR', TaxType: 'Inclusive', TotalBookingAmount: 3600, Commission: 0 })
      expect(r.ResGlobalInfo.Total.TotalTax).toBeCloseTo(171.43, 2)
      expect(r.ResGlobalInfo.SpecialRequest).toBe('Corporate guest: Acme Ltd (GSTIN 07AAAAA0000A1Z5)')
      expect(r.PayAtHotel).toBe('N')
      expect(r.CreateDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.0$/)
      const guest = r.ResGuests.ResGuest[0].Profiles.ProfileInfo.Profile.Customer
      expect(guest.PersonName).toEqual({ GivenName: 'Priya', Surname: 'Sharma' })
      expect(guest.Email).toBe('priya@example.com')

      const after = await db.getBookingByCode(booking.booking_code)
      expect(after?.cm_sync_status).toBe('SENT')
      expect(after?.cm_attempts).toBe(0)

      // A window before the booking existed returns nothing.
      const empty = await ota('/bookings/pull', {
        OTA_HotelResNotifRQ: { POS: fetchPos, PropertyId: HOTEL, FromDate: '2020-01-01', ToDate: '2020-01-31' },
      })
      expect(empty.body.OTA_HotelResNotifRQ.HotelReservations).toEqual([])
    })

    test('pull is refused without credentials, since it carries guest details', async () => {
      const res = await ota('/bookings/pull', { OTA_HotelResNotifRQ: { PropertyId: HOTEL, FromDate: D1, ToDate: D3 } })
      expect(res.status).toBe(401)
      expect(res.body.OTA_HotelResNotifRS.Status).toBe('Failure')
    })

    test('push sends the guide message to RESAVENUE_PUSH_URL and records the outcome', async () => {
      const booking = await confirmedBooking()
      process.env.RESAVENUE_PUSH_URL = 'https://cm.example.test/quadis/reservations'
      process.env.RESAVENUE_PUSH_AUTHORIZATION = 'Bearer test-token'

      const calls: Array<{ url: string; init: any }> = []
      const realFetch = global.fetch
      global.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), init })
        return new Response(JSON.stringify({ OTA_HotelResNotifRS: { Status: 'Success', Remark: '' } }), { status: 200 })
      }) as any
      try {
        const first = await runChannelSyncOnce()
        expect(first).toEqual({ attempted: 1, sent: 1 })
        expect(calls).toHaveLength(1)
        expect(calls[0].url).toBe('https://cm.example.test/quadis/reservations')
        expect(calls[0].init.headers.Authorization).toBe('Bearer test-token')
        const sent = JSON.parse(calls[0].init.body).OTA_HotelResNotifRQ
        expect(sent.Target).toBe('Production')
        expect(sent.HotelReservations.HotelReservation).toHaveLength(1)
        expect(sent.HotelReservations.HotelReservation[0].UniqueID.ID).toBe(booking.booking_code)
        expect(sent.HotelReservations.HotelReservation[0].ResStatus).toBe('Confirm')

        const after = await db.getBookingByCode(booking.booking_code)
        expect(after?.cm_sync_status).toBe('SENT')
        expect(after?.cm_attempts).toBe(1)

        // Delivered once; the worker has nothing more to send.
        expect(await runChannelSyncOnce()).toEqual({ attempted: 0, sent: 0 })
      } finally {
        global.fetch = realFetch
        delete process.env.RESAVENUE_PUSH_AUTHORIZATION
      }
    })

    test('a failed push is recorded with the remark and retried later', async () => {
      const booking = await confirmedBooking()
      process.env.RESAVENUE_PUSH_URL = 'https://cm.example.test/down'
      const realFetch = global.fetch
      global.fetch = (async () =>
        new Response(JSON.stringify({ OTA_HotelResNotifRS: { Status: 'Failure', Remark: 'Room type not mapped' } }), { status: 200 })) as any
      try {
        expect(await runChannelSyncOnce()).toEqual({ attempted: 1, sent: 0 })
        const after = await db.getBookingByCode(booking.booking_code)
        expect(after?.cm_sync_status).toBe('FAILED')
        expect(after?.cm_last_error).toBe('Room type not mapped')
        expect(after?.cm_attempts).toBe(1)
        // Still owed, so the next run tries again.
        expect((await runChannelSyncOnce()).attempted).toBe(1)
      } finally {
        global.fetch = realFetch
      }
    })

    test('a confirmed booking that is cancelled owes a Cancel', async () => {
      const booking = await confirmedBooking()
      await db.markChannelSync(booking.id, 'SENT')
      await db.updateBookingPayment(booking.booking_code, { bookingStatus: 'CANCELLED', paymentStatus: 'REFUNDED' })
      const after = await db.getBookingByCode(booking.booking_code)
      expect(after?.cm_sync_status).toBe('PENDING')
      expect(after?.cm_res_status).toBe('Cancel')

      const today = new Date().toISOString().slice(0, 10)
      const res = await ota('/bookings/pull', {
        OTA_HotelResNotifRQ: { POS: fetchPos, PropertyId: HOTEL, FromDate: today, ToDate: today },
      })
      expect(res.body.OTA_HotelResNotifRQ.HotelReservations[0].HotelReservation[0].ResStatus).toBe('Cancel')
    })
  })
})
