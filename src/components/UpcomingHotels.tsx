import { useCallback, useEffect, useRef, useState } from 'react'

import { SectionHeader } from './ui.tsx'
import { Reveal } from './blocks.tsx'
import { IconArrowLeft, IconArrowRight } from './icons.tsx'

import { UPCOMING_HOTELS } from '../data/hotels.ts'
import { useContent } from '../data/content.ts'

export default function UpcomingHotels() {
  const { t } = useContent()
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  // The track has always scrolled, but its scrollbar is hidden by design, so
  // there was no signal that more cities existed — the seventh card just looked
  // clipped. Client flagged it on 28 Jul. Arrows restore the affordance without
  // dropping a card: hotels.ts must keep all seven or DestinationsGrid wraps.
  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    // 1px of slack: fractional scroll widths on zoomed or scaled displays
    // otherwise leave "next" enabled forever at the right-hand end.
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft
    setCanPrev(el.scrollLeft > 1)
    setCanNext(remaining > 1)
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    // Cards are a fixed width, so a viewport change alters how many fit and
    // therefore whether the track scrolls at all.
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [sync])

  const scrollByCard = (direction: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    // Measure the real card rather than hardcoding 280px, so this keeps working
    // if the card width or gap is restyled.
    const card = el.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(el).columnGap || '24') || 24
    const step = card ? card.offsetWidth + gap : el.clientWidth * 0.8
    el.scrollBy({ left: step * direction, behavior: 'smooth' })
  }

  return (
    <section id="upcoming" className="section bg-warm">
      <div className="container">
        <SectionHeader overline={t('upcoming.overline')} title={t('upcoming.title')} align="center" />

        {/* Reveal owns the entrance animation and binds its own internal ref,
            so the scroll track has to be a plain child we can measure. */}
        <Reveal className="upcoming-shell">
          <div className="upcoming-grid" ref={trackRef}>
            {UPCOMING_HOTELS.map((hotel) => (
              <article key={hotel.name} className="upcoming-card">
                <div className="upcoming-card__media">
                  {hotel.image ? (
                    <img src={hotel.image} alt={hotel.name} className="photo__img" loading="lazy" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                  ) : (
                    <div className="photo__ph">
                      <span className="photo__ph-label">{hotel.name}</span>
                    </div>
                  )}
                  {hotel.badge && <span className="upcoming-card__badge">{hotel.badge}</span>}
                </div>
                <div className="upcoming-card__body">
                  <h3 className="h3 upcoming-card__title">{hotel.name}</h3>
                  <p className="upcoming-card__location">{hotel.location}</p>
                </div>
              </article>
            ))}
          </div>

          {/* Rendered only when the track actually overflows, so the controls
              never sit there permanently greyed out on a wide desktop. */}
          {(canPrev || canNext) && (
            <div className="upcoming-nav">
              <button
                type="button"
                className="upcoming-nav__btn"
                onClick={() => scrollByCard(-1)}
                disabled={!canPrev}
                aria-label="Show previous locations"
              >
                <IconArrowLeft />
              </button>
              <button
                type="button"
                className="upcoming-nav__btn"
                onClick={() => scrollByCard(1)}
                disabled={!canNext}
                aria-label="Show more locations"
              >
                <IconArrowRight />
              </button>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}
