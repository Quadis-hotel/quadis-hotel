import { useEffect, useRef, useState } from 'react'
import { GUESTS_SERVED_CLAIM } from '../data/site.ts'
import { PARTNER_LOGOS } from '../data/logos.ts'
import { SectionHeader } from './ui.tsx'
import { Reveal } from './blocks.tsx'
import { IconArrowLeft, IconArrowRight } from './icons.tsx'

/**
 * Real reviews only — every quote and name below was supplied by the client
 * (change order item 13).
 *
 * A card carries the quote and the guest's name and nothing else. The per-card
 * "Stayed at <hotel>" line and the "5.0 ★" badge were removed on 5 Aug 2026 at
 * the client's request — item 3 of her written feedback, `Remove "ratings &
 * stayed at hotels name"`. Only a third of the supplied reviews came with
 * either field, so the carousel was also showing two different kinds of card
 * depending on which review happened to be in view. The aggregate
 * "★ 4.5 Rating | 95% Repeat Guests" pill in the header is a separate element
 * and stays.
 */
interface GuestReview {
  quote: string
  name: string
}

const VERIFIED_GUEST_REVIEWS: GuestReview[] = [
  {
    quote: 'Good room sizes and very well maintained bathroom. Very welcoming staff and professional service quality with nice behaviour of room service operator.',
    name: 'Ramesh Kumar',
  },
  {
    quote: 'Excellent location, well connected to all important places. Clean, comfortable property with very nice and helpful staff. Overall, a very comfortable stay.',
    name: 'Sanjeev Talwar',
  },
  {
    quote: "I appreciate the environmentally friendly practices of the hotel. It's good to see them taking steps towards sustainability and providing clean linen daily.",
    name: 'Miss Shubdha',
  },
  {
    quote: 'Rooms are luxurious and location is easy located near to good market and metro station. Atmosphere inside has a positive vibe and hotel staff is friendly as well as professional in the conduct. Will highly recommend to all to visit this property especially if you are visiting Lajpat Nagar once. It has great value for money in comparison to the rates offered and services being provided.',
    name: 'Mayank Sharma',
  },
  {
    quote: 'Had an amazing stay at this hotel! The staff were super friendly and helpful, making sure I had everything I needed. The room was spotless, comfy bed, and the view was stunning. Loved the breakfast spread — plenty of options to start the day right. Highly recommend this place for a relaxing and rejuvenating getaway!',
    name: 'J2 Gamer',
  },
  {
    quote: "Amazing hospitality! The staff were incredibly welcoming and attentive throughout our stay. The room was spacious, well-maintained, and offered all the comforts of home. The hotel's amenities were excellent, and the location was convenient. Every aspect of our visit was enjoyable, making it a truly outstanding experience.",
    name: 'Rahul',
  },
  {
    quote: 'Excellent stay! The hotel exceeded all expectations with its clean, spacious rooms and exceptional service. Staff were friendly, professional, and always ready to help. The location was convenient, breakfast was delicious, and the facilities were well-maintained. I felt comfortable throughout my stay and would highly recommend this hotel to anyone.',
    name: 'Akash',
  },
  {
    quote: 'I had a wonderful stay at this hotel. The cleanliness was outstanding — rooms, bathrooms, corridors, and all common areas were spotless and well-maintained. Housekeeping did an excellent job every day, keeping everything fresh and organized. The staff was polite, professional, and always ready to help.',
    name: 'Ajeet',
  },
  {
    quote: 'I have come twice and due to work I have to check in a little early at the hotel. I was allowed to check in early on the second time also. There was a lady at the reception — she was very cooperative and very politely allowed me to check in early. My experience has been very good.',
    name: 'Aman',
  },
  {
    quote: 'The staff was incredibly welcoming and helpful, providing top-notch service throughout. Rooms were comfortable, featuring excellent amenities. Highly recommended for both business and leisure trips — the overall experience was fantastic, making it a place to definitely visit again and again.',
    name: 'Raina Ji',
  },
  {
    // Left in the guest's own Hinglish. Cleaning it into formal English would
    // make a real review read like marketing copy.
    quote: 'Hotel ka location bahut hi accha hai, easily reachable from main road. Rooms clean & spacious hain, ambience bhi kaafi peaceful hai. Staff ka behaviour polite aur helpful raha. All services like housekeeping, room service, food quality — sabhi cheezein really good thi. Overall experience excellent raha.',
    name: 'Mandeep',
  },
  {
    // Supplied with Google's auto-translation followed by an "(Original)"
    // Hinglish copy of the same text; the duplicate is dropped here.
    quote: 'My stay here was very comfortable. The rooms were neat and clean and the ambiance was also good. The staff support was very good and the service was timely. Both safety and privacy have been taken care of properly. The location is convenient which makes travel easy. The facilities were better than expected. It is also a suitable place for a family stay.',
    name: 'Nisha',
  },
]

const PER_VIEW_DESKTOP = 3
const AUTOPLAY_MS = 7000

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return reduced
}

function GuestReviewSlider() {
  const [start, setStart] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>()
  const reducedMotion = useReducedMotion()

  const total = VERIFIED_GUEST_REVIEWS.length
  const go = (d: number) => setStart((v) => (v + d + total) % total)

  useEffect(() => {
    // Autoplay pauses on hover and on keyboard focus, and is off entirely under
    // prefers-reduced-motion. Nothing to advance when everything already fits.
    if (paused || reducedMotion || total <= PER_VIEW_DESKTOP) return
    timer.current = setInterval(() => setStart((v) => (v + 1) % total), AUTOPLAY_MS)
    return () => clearInterval(timer.current)
  }, [paused, reducedMotion, total])

  // Wraps, so the last page is never a short row.
  const visible = Array.from({ length: Math.min(PER_VIEW_DESKTOP, total) }, (_, k) => {
    const idx = (start + k) % total
    return { ...VERIFIED_GUEST_REVIEWS[idx]!, key: `${idx}-${k}` }
  })

  const canPage = total > PER_VIEW_DESKTOP

  return (
    <div
      className="guest-reviews"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="guest-reviews-grid">
        {visible.map((review) => (
          <div key={review.key} className="guest-review-card">
            <p className="guest-review-quote">&ldquo;{review.quote}&rdquo;</p>
            <div className="guest-review-footer">
              <h4 className="guest-review-name">{review.name}</h4>
            </div>
          </div>
        ))}
      </div>

      {canPage && (
        <div className="guest-reviews__nav">
          <button
            type="button"
            className="guest-reviews__arrow"
            onClick={() => go(-1)}
            aria-label="Previous testimonials"
          >
            <IconArrowLeft />
          </button>
          <button
            type="button"
            className="guest-reviews__arrow"
            onClick={() => go(1)}
            aria-label="Next testimonials"
          >
            <IconArrowRight />
          </button>
        </div>
      )}
    </div>
  )
}

export default function HappyClientsSection() {
  return (
    <section className="section bg-cream">
      <div className="container">
        {/* Our Happy Clients */}
        <div className="happy-clients-container">
          <SectionHeader overline="CORPORATE TRUST" title="Our Corporate Clients" />
          <p className="intro__body text-center happy-clients-intro">
            Proudly hosting executives and corporate teams from India&rsquo;s most respected enterprises.
          </p>

          {/*
            Infinite right-to-left marquee (change order item 9). The list is
            duplicated once and the track translates by exactly -50%, so the
            wrap is invisible. The duplicate half is aria-hidden with empty alt
            text — a screen reader announces 15 clients, not 30.
          */}
          <Reveal className="logo-marquee">
            <div className="logo-marquee__track">
              {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((client, i) => {
                const isClone = i >= PARTNER_LOGOS.length
                return (
                  <div key={`${client.name}-${i}`} className="happy-client-logo-card" aria-hidden={isClone}>
                    <img
                      className="logo-mark"
                      src={client.src}
                      alt={isClone ? '' : client.name}
                      loading="lazy"
                    />
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>

        <div className="guest-experience-banner">
          <div className="guest-experience-header">
            <div>
              <span className="guest-experience-overline">GUEST EXPERIENCE</span>
              <h3 className="h3 on-dark" style={{ marginTop: '4px' }}>
                Trusted by <span className="gold-text">{GUESTS_SERVED_CLAIM}</span> verified guests
              </h3>
            </div>
            <div className="guest-experience-stats">
              <span className="stat-rating">★ 4.5 Rating</span>
              <span className="stat-divider">|</span>
              <span className="stat-repeat">95% Repeat Guests</span>
            </div>
          </div>

          <GuestReviewSlider />
        </div>
      </div>
    </section>
  )
}
