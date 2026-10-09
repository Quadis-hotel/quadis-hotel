import { useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import type { MealPlan } from '../types.ts'
import { useHotels, priceNight, inr, getHotelRooms } from '../data/hotels.ts'
import { computeStayBreakdown, countWeekendNights, chargeableGuestsFor, policyFor } from '../lib/pricing.ts'
import { readStayParams, todayIso, nextDay } from '../data/stay.ts'
import { imagesForHotel, roomImages } from '../data/images.ts'
import { HotelCard, Button } from '../components/ui.tsx'
import { CtaBand } from '../components/blocks.tsx'
import { MapFacade, GettingHere, LocationActions } from '../components/Location.tsx'
import { QUADIS_PHONE } from '../data/site.ts'
import Gallery from '../components/Gallery.tsx'
import { Photo } from '../components/media.tsx'
import { IconPin, IconStar, IconWifi, IconAc, IconBreakfast, IconParking, IconDesk, IconRoom } from '../components/icons.tsx'
import NotFound from './NotFound.tsx'
import { CheckoutModal } from '../components/CheckoutModal.tsx'
import Seo from '../components/Seo.tsx'
import { hotelSeo } from '../data/seo.ts'
import { useContent } from '../data/content.ts'

interface Amenity { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }
const AMENITIES: Amenity[] = [
  { icon: IconWifi, label: 'Free Wi-Fi' },
  { icon: IconAc, label: 'Air Conditioning' },
  { icon: IconBreakfast, label: 'Breakfast' },
  { icon: IconParking, label: 'Parking' },
  { icon: IconDesk, label: '24h Front Desk' },
  { icon: IconRoom, label: 'Room Service' },
]

function nights(a: string, b: string): number {
  if (!a || !b) return 0
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  return d > 0 ? Math.round(d) : 0
}

export default function HotelDetail() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const hotels = useHotels()
  const { t } = useContent()
  const hotel = hotels.find((h) => h.slug === slug)
  const images = hotel ? imagesForHotel(hotel) : []
  const hotelRooms = useMemo(() => (hotel ? getHotelRooms(hotel) : []), [hotel])

  /*
   * Seed the booking panel from the search the guest already did. Read once as
   * the initial state rather than synced on every render, so typing a new date
   * here is not immediately overwritten by the stale value still in the URL.
   */
  const initialStay = useMemo(() => readStayParams(params), [params])

  const [checkin, setCheckin] = useState(initialStay.checkin)
  const [checkout, setCheckout] = useState(initialStay.checkout)
  const [rooms, setRooms] = useState(1)
  const [adults, setAdults] = useState(initialStay.adults)
  const [childAges, setChildAges] = useState<number[]>(() =>
    // Default every carried-over child to an age that stays free, so the quote
    // can never jump upward on arrival. The guest sets the real ages below.
    Array.from({ length: initialStay.children }, () => 6)
  )
  const [confirmed, setConfirmed] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [selectedMealPlan, setSelectedMealPlan] = useState<MealPlan>('Room Only')
  const [cardMealPlans, setCardMealPlans] = useState<Record<string, MealPlan>>({})
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)

  const nearby = useMemo(() => {
    if (!hotel) return []
    const same = hotels.filter((h) => h.slug !== slug && h.city === hotel.city)
    // >= 1, not >= 3. New Delhi has three properties, so any Delhi hotel had
    // only two siblings, fell through, and listed Noida hotels 25 km away
    // under "Nearby stays".
    const pool = same.length >= 1 ? same : hotels.filter((h) => h.slug !== slug)
    return pool.slice(0, 3)
  }, [hotel, slug, hotels])

  if (!hotel) return <NotFound />

  const activeRoom = hotelRooms.find((r) => r.id === selectedRoomId) ?? hotelRooms[0] ?? null
  const activeMeal = activeRoom?.mealOptions.find((m) => m.plan === selectedMealPlan) ?? activeRoom?.mealOptions[0] ?? { plan: 'Room Only' as MealPlan, priceOffset: 0 }
  const roomOffset = activeRoom?.basePriceOffset ?? 0
  const mealOffset = activeMeal?.priceOffset ?? 0
  const effectiveNightPrice = hotel.price + roomOffset + mealOffset

  const surchargePercent = hotel.weekendSurchargePercent ?? 0
  const n = nights(checkin, checkout)

  const guests = adults + childAges.length

  // The hotel's own occupancy policy, delivered with the property record and
  // set in the admin panel. Mirrors the server rule exactly: two adults per room
  // included, under-8s free, 8-12 at the child rate, 13+ as an adult. The quote
  // the guest sees here must match what the server charges, so both sides call
  // the same function.
  const policy = policyFor(hotel)
  const { extraAdults, extraChildren } = chargeableGuestsFor({
    adults,
    childAges,
    roomsCount: rooms,
    childFreeUnderAge: policy.childFreeUnderAge,
    adultFromAge: policy.adultFromAge,
  })

  const breakdown = n > 0
    ? computeStayBreakdown({
        basePrice: hotel.price,
        roomOffset,
        mealOffset,
        weekendSurchargePercent: surchargePercent,
        checkIn: checkin,
        checkOut: checkout,
        roomsCount: rooms,
        extraAdults,
        extraChildren,
        extraAdultPercent: policy.extraAdultPercent,
        childPercent: policy.childPercent,
      })
    : null
  const total = breakdown?.total ?? 0

  const hasWeekendNight = surchargePercent > 0 && checkin && checkout
    ? countWeekendNights(checkin, checkout) > 0
    : false

  const setChildCount = (count: number) =>
    setChildAges((prev) =>
      Array.from({ length: count }, (_, i) => prev[i] ?? 6)
    )

  const mapQuery = encodeURIComponent(`${hotel.name}, ${hotel.address}`)

  const book = (e: React.FormEvent) => {
    e.preventDefault()
    setShowCheckoutModal(true)
  }

  return (
    <>
      {/* The nine hotel pages are the ones guests actually search for — "hotel
          in sector 51 noida" and the like — so the title leads with the area
          and city rather than the brand. `canonicalPath` drops the ?checkIn=
          search params, which would otherwise split one page into hundreds of
          near-duplicate URLs in the index.

          Templated from src/data/hotels.ts via hotelSeo() as of 5 Aug 2026, so
          a tenth property gets its meta, canonical and sitemap entry with no
          edit here — that scattering was the complaint her SEO person raised. */}
      <Seo {...hotelSeo(hotel, images[0])} />
      <section className="section bg-cream detail-top">
        <div className="container">
          <Link to="/hotels" className="back-link">← All hotels</Link>
          <Gallery images={images} alt={hotel.name} />

          <div className="detail-head">
            <div>
              {/* Was hotel.tierLabel — "Quadis Central" on every property, and
                  the tier is a roadmap rather than a current attribute. */}
              <span className="overline mb-2" style={{ display: 'block', color: 'var(--text-muted)' }}>
                {hotel.area}, {hotel.city}
              </span>
              <h1 className="h2 detail-head__name">{hotel.name}</h1>
              <p className="detail-head__addr">
                <IconPin /> <span>{hotel.address}</span>
                <a className="map-link ext" href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noopener noreferrer">View on map</a>
              </p>
            </div>
            <div className="detail-head__meta">
              <span className="detail-head__rating"><IconStar /> {hotel.rating.toFixed(1)}</span>
              <span className="detail-head__price">{priceNight(effectiveNightPrice)}</span>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-main">
              <section className="detail-block">
                <span className="overline">AMENITIES</span>
                <div className="amenities">
                  {AMENITIES.map(({ icon: Icon, label }) => (
                    <div className="amenity" key={label}><Icon /> <span>{label}</span></div>
                  ))}
                </div>
              </section>

              {/* These three read from the admin's editable copy. The fields
                  existed in the panel with nothing rendering them, so a client
                  edit saved and then appeared nowhere. Check-in and check-out
                  are also the two things guests most often ask reception. */}
              {/* --policy is a hook for the mobile reorder only: at 900px and
                  below this block is moved to sit directly under the room list,
                  which is where the client asked for it on 5 Aug 2026 (item 7).
                  The move is flex order in pages.css, so the block stays third
                  on desktop and the reading and tab order never change. */}
              <section className="detail-block detail-block--policy">
                <span className="overline">STAY POLICY</span>
                <div className="stay-policy">
                  <div className="stay-policy__times">
                    <div className="stay-policy__time">
                      <span className="stay-policy__label">Check-in</span>
                      <span className="stay-policy__value">{t('policy.checkIn')}</span>
                    </div>
                    <div className="stay-policy__time">
                      <span className="stay-policy__label">Check-out</span>
                      <span className="stay-policy__value">{t('policy.checkOut')}</span>
                    </div>
                  </div>
                  <p className="stay-policy__note">{t('policy.cancellation')}</p>
                </div>
              </section>

              <section className="detail-block" id="choose-room">
                <span className="overline">AVAILABLE ACCOMMODATIONS</span>
                <h2 className="h3" style={{ marginTop: 6, marginBottom: 20 }}>Choose your room</h2>
                <div className="rooms-grid">
                  {hotelRooms.map((r) => {
                    const rPhotos = slug ? roomImages(slug, r.id) : []
                    const activeMealForCard = r.mealOptions.find((m) => m.plan === (cardMealPlans[r.id] ?? selectedMealPlan)) ?? r.mealOptions[0] ?? { plan: 'Room Only' as MealPlan, priceOffset: 0 }
                    const cardPrice = hotel.price + r.basePriceOffset + activeMealForCard.priceOffset
                    const isSelected = activeRoom && activeRoom.id === r.id && selectedMealPlan === activeMealForCard.plan

                    return (
                      <article className={`room-card ${isSelected ? 'room-card--selected' : ''}`} key={r.id}>
                        <div className="room-card__img">
                          <Photo src={rPhotos[0]} ratio="16 / 10" label={r.name} alt={r.name} />
                        </div>
                        <div className="room-card__body">
                          <div className="room-card__head">
                            <div>
                              <h3 className="h4 room-card__title">{r.name}</h3>
                              <p className="room-card__specs">
                                <span>{r.size}</span> • <span>{r.bed}</span> • <span>Up to {r.maxGuests} guests</span>
                              </p>
                            </div>
                            <div className="room-card__price">
                              <strong>{inr(cardPrice)}</strong>
                              <span>/ night</span>
                            </div>
                          </div>
                          <p className="room-card__desc">{r.description}</p>
                          <div className="room-card__meals">
                            <span className="room-card__meals-label">Meal options:</span>
                            <div className="room-card__meal-chips">
                              {r.mealOptions.map((m) => {
                                const chipSelected = activeMealForCard.plan === m.plan
                                return (
                                  <button
                                    key={m.plan}
                                    type="button"
                                    className={`meal-chip ${chipSelected ? 'is-active' : ''}`}
                                    onClick={() => setCardMealPlans((prev) => ({ ...prev, [r.id]: m.plan }))}
                                  >
                                    {m.plan} {m.priceOffset > 0 ? `(+${inr(m.priceOffset)})` : ''}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="room-card__cta">
                            <Button
                              variant={isSelected ? 'primary' : 'ghost'}
                              onClick={() => {
                                setSelectedRoomId(r.id)
                                setSelectedMealPlan(activeMealForCard.plan)
                              }}
                            >
                              {isSelected ? 'SELECTED ✓' : 'SELECT ROOM'}
                            </Button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className="detail-block">
                <span className="overline">ABOUT THIS HOTEL</span>
                <h2 className="h3">Considered comfort in {hotel.area}</h2>
                <p className="prose__p">
                  {hotel.name} offers refined, well-appointed rooms in {hotel.area}, {hotel.city} — a calm base
                  with warm, attentive service and easy access to the neighbourhood. Every stay is designed
                  around considered comfort: quiet rooms, thoughtful amenities and a team that anticipates what you need.
                </p>
                <p className="prose__p">
                  Located at {hotel.address}, the property is well connected for both leisure and business travellers
                  across Delhi NCR.
                </p>

                <div className="quote-block mt-8">
                  <blockquote className="quote-block__text">
                    &ldquo;Every stay in {hotel.name} is underpinned by our commitment to attentive human warmth, spotless rooms, and effortless booking.&rdquo;
                  </blockquote>
                  <cite className="quote-block__cite">— Quadis Guest Satisfaction Standard</cite>
                </div>
              </section>

              <section className="detail-block">
                <span className="overline">LOCATION</span>
                <div className="loc-split">
                  <MapFacade hotel={hotel} />
                  <GettingHere transit={hotel.transit} />
                </div>
                <LocationActions hotel={hotel} phone={QUADIS_PHONE} />
              </section>
            </div>

            {/* Sticky booking card */}
            <aside className="book-card">
              <form onSubmit={book}>
                <div className="book-card__summary">
                  <p className="book-card__price"><strong>{inr(effectiveNightPrice)}</strong> <span>/ night</span></p>
                  {activeRoom && (
                    <p className="book-card__selection">
                      Selected: <strong>{activeRoom.name}</strong> • <em>{activeMeal.plan}</em>
                    </p>
                  )}
                </div>
                <div className="book-card__row">
                  <label className="field">
                    <span className="field__label">Check-in</span>
                    <input type="date" className="field__input" value={checkin} min={todayIso()}
                      onChange={(e) => { setCheckin(e.target.value); if (checkout && e.target.value && e.target.value >= checkout) setCheckout('') }} required />
                  </label>
                  <label className="field">
                    <span className="field__label">Check-out</span>
                    {/* Day after check-in: a same-day range is zero nights and the
                        server rejects it, so it must not be selectable. */}
                    <input type="date" className="field__input" value={checkout}
                      min={checkin ? nextDay(checkin) : todayIso()}
                      onChange={(e) => setCheckout(e.target.value)} required />
                  </label>
                </div>
                <div className="book-card__row book-card__row--three">
                  <label className="field">
                    <span className="field__label">Rooms</span>
                    <select className="field__input" value={rooms} onChange={(e) => setRooms(+e.target.value)}>
                      {[1, 2, 3, 4, 5].map((r) => (<option key={r} value={r}>{r}</option>))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Adults</span>
                    <select className="field__input" value={adults} onChange={(e) => setAdults(+e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (<option key={g} value={g}>{g}</option>))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Children</span>
                    <select className="field__input" value={childAges.length} onChange={(e) => setChildCount(+e.target.value)}>
                      {Array.from({ length: 9 }, (_, i) => i).map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </label>
                </div>

                {/* An age per child, because the price depends on it: under
                    the property's threshold shares existing bedding at no charge. */}
                {childAges.length > 0 && (
                  <div className="book-card__children">
                    <span className="field__label">Age of each child</span>
                    <div className="book-card__ages">
                      {childAges.map((age, i) => (
                        <label className="field field--age" key={i}>
                          <span className="field__label field__label--sr">Child {i + 1} age</span>
                          <select
                            className="field__input"
                            value={age}
                            aria-label={`Age of child ${i + 1}`}
                            onChange={(e) => setChildAges((prev) => prev.map((a, j) => (j === i ? +e.target.value : a)))}
                          >
                            {Array.from({ length: 18 }, (_, a) => a).map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <p className="book-card__note book-card__note--soft">
                      {policy.childFreeUnderAge >= 18
                        ? 'Children stay free on existing bedding — no extra charge.'
                        : `Children under ${policy.childFreeUnderAge} stay free on existing bedding.`}
                    </p>
                  </div>
                )}

                {breakdown && (extraAdults > 0 || extraChildren > 0) && (
                  <div className="book-card__line">
                    <span>{inr(effectiveNightPrice)} × {n} night{n > 1 ? 's' : ''} × {rooms} room{rooms > 1 ? 's' : ''}</span>
                    <span>{inr(breakdown.roomTotal)}</span>
                  </div>
                )}
                {breakdown && extraAdults > 0 && (
                  <div className="book-card__line">
                    <span>
                      {/* Name the percentage, not just the rupees: it is the rule
                          the hotel quotes, and it explains why the figure changes
                          on a weekend-surcharged night. A hotel can set 0%, in
                          which case "× 0%  — ₹0" reads like a bug. */}
                      Extra adult{extraAdults > 1 ? 's' : ''}
                      {breakdown.extraAdultPercent > 0
                        ? ` (${extraAdults} × ${breakdown.extraAdultPercent}% of room rate)`
                        : ` (${extraAdults})`}
                    </span>
                    <span>
                      {breakdown.extraAdultTotal > 0 ? inr(breakdown.extraAdultTotal) : 'No charge'}
                    </span>
                  </div>
                )}

                {/* Children in the concession band are billed at their own rate,
                    so they get their own line. Folding them into "extra adults"
                    would show a family a number that does not reconcile against
                    the percentage next to it. Under-8s never appear — they are
                    free and listing them at ₹0 invites the question. */}
                {breakdown && extraChildren > 0 && (
                  <div className="book-card__line">
                    <span>
                      {extraChildren} child{extraChildren > 1 ? 'ren' : ''} aged {policy.childFreeUnderAge}–{policy.adultFromAge - 1}
                      {breakdown.childPercent > 0 ? ` (× ${breakdown.childPercent}% of room rate)` : ''}
                    </span>
                    <span>
                      {breakdown.extraChildTotal > 0 ? inr(breakdown.extraChildTotal) : 'No charge'}
                    </span>
                  </div>
                )}

                <div className="book-card__total">
                  <span>
                    {n > 0
                      ? extraAdults > 0
                        ? 'Total'
                        : `${inr(effectiveNightPrice)} × ${n} night${n > 1 ? 's' : ''} × ${rooms} room${rooms > 1 ? 's' : ''}`
                      : 'Select your dates'}
                  </span>
                  <strong>{n > 0 ? inr(total) : '—'}</strong>
                </div>
                {hasWeekendNight && (
                  <p className="book-card__note">
                    Includes a {surchargePercent}% weekend surcharge on Friday and Saturday nights.
                  </p>
                )}
                {extraAdults > 0 && (
                  <p className="book-card__note">
                    Rates include {rooms * 2} adult{rooms * 2 > 1 ? 's' : ''}
                    {rooms > 1 ? ` (2 per room)` : ''}; {extraAdults} extra adult
                    {extraAdults > 1 ? 's' : ''}{' '}
                    {policy.extraAdultPercent > 0
                      ? `at +${policy.extraAdultPercent}% of the room rate per night.`
                      : 'at no extra charge.'}
                  </p>
                )}

                {/* Disabled until the dates make a real stay. This used to open
                    checkout on a zero-night range showing "1 Night" and ₹0, and
                    the guest only found out when the server refused the hold. */}
                <Button as="button" type="submit" variant="primary" className="book-card__cta" disabled={n === 0}>
                  {n === 0 ? 'SELECT YOUR DATES' : 'BOOK NOW'}
                </Button>
                {confirmed && (
                  <p className="book-card__ok" role="status">
                    Dates held. Complete payment in the checkout window to confirm your booking.
                  </p>
                )}
              </form>
            </aside>
          </div>
        </div>
      </section>

      <section className="section bg-warm">
        <div className="container">
          <span className="overline">YOU MIGHT ALSO LIKE</span>
          <h2 className="h2" style={{ marginTop: 8, marginBottom: 32 }}>Nearby stays</h2>
          <div className="card-grid">
            {nearby.map((h) => (<HotelCard key={h.slug} hotel={h} />))}
          </div>
        </div>
      </section>

      {/* This page IS the booking page — send the guest up to the room list,
          not back to /hotels, which is where the default `to` would take them. */}
      <CtaBand href="#choose-room" />

      {showCheckoutModal && activeRoom && (
        <CheckoutModal
          propertySlug={hotel.slug}
          propertyName={hotel.name}
          propertyAddress={hotel.address}
          roomTypeSlug={activeRoom.id}
          roomTypeName={activeRoom.name}
          checkIn={checkin}
          checkOut={checkout}
          roomsCount={rooms}
          guestsCount={guests}
          adultsCount={adults}
          childAges={childAges}
          mealPlan={activeMeal.plan}
          totalAmount={total}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={(code) => {
            console.log('Payment successful for booking:', code)
            setConfirmed(true)
          }}
        />
      )}
    </>
  )
}
