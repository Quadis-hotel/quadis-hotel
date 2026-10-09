import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Hotel } from '../types.ts'
import { inr } from '../data/hotels.ts'

/**
 * City-level locator: one map for the whole list, never a map per card.
 *
 * A compact numbered list sits beside the map and the two are bound together —
 * hover a row and its pin lifts, hover a pin and its row highlights. That is
 * the question a page of nine addresses can't answer: how they sit relative to
 * each other across NCR.
 *
 * Deliberately schematic rather than a tile map: no API key, no third-party
 * request, no cookies, and it stays in the brand palette. Renders nothing
 * unless real coordinates exist, so it can never show an invented pin.
 */

interface Props {
  hotels: Hotel[]
}

// Padding keeps pins clear of the plate edge when properties cluster tightly.
const PAD = 0.14

export default function NcrLocatorMap({ hotels }: Props) {
  const [active, setActive] = useState<string | null>(null)
  const located = useMemo(() => hotels.filter((h) => h.coords), [hotels])

  const points = useMemo(() => {
    if (!located.length) return []
    const lats = located.map((h) => h.coords!.lat)
    const lngs = located.map((h) => h.coords!.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    // Guard the single-property case, where the span would be zero.
    const spanLat = maxLat - minLat || 0.01
    const spanLng = maxLng - minLng || 0.01

    return located.map((h, i) => ({
      hotel: h,
      n: i + 1,
      x: (PAD + (1 - 2 * PAD) * ((h.coords!.lng - minLng) / spanLng)) * 100,
      // y inverts: higher latitude is further north, which is up.
      y: (PAD + (1 - 2 * PAD) * (1 - (h.coords!.lat - minLat) / spanLat)) * 100,
    }))
  }, [located])

  if (!points.length) return null

  const unmapped = hotels.length - points.length

  return (
    <section className="section locator">
      <div className="container">
        <span className="overline on-dark">HOTEL LIST · ONE MAP, NUMBERED PINS</span>

        <div className="locator__grid">
          <ol className="locator__list">
            {points.map((p) => (
              <li key={p.hotel.slug}>
                <Link
                  to={`/hotels/${p.hotel.slug}`}
                  className={`locator__row ${active === p.hotel.slug ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(p.hotel.slug)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(p.hotel.slug)}
                  onBlur={() => setActive(null)}
                >
                  <span className="locator__n">{p.n}</span>
                  <span className="locator__meta">
                    <span className="locator__name">{p.hotel.name}</span>
                    <span className="locator__area">{p.hotel.area}, {p.hotel.city}</span>
                  </span>
                  <span className="locator__price">{inr(p.hotel.price)}</span>
                </Link>
              </li>
            ))}
          </ol>

          <div className="locator__plate">
            <span className="locator__grid-lines" aria-hidden="true" />
            {points.map((p) => (
              <div
                key={p.hotel.slug}
                className={`locator__pin ${active === p.hotel.slug ? 'is-active' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onMouseEnter={() => setActive(p.hotel.slug)}
                onMouseLeave={() => setActive(null)}
              >
                <Link to={`/hotels/${p.hotel.slug}`} className="locator__dot">
                  {p.n}
                  <span className="visually-hidden">{p.hotel.name}</span>
                </Link>
                <span className="locator__tip" role="tooltip">
                  <strong>{p.hotel.name}</strong>
                  <span>{p.hotel.area}, {p.hotel.city}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="locator__note">
          Pins are placed from each property&rsquo;s stored coordinates, not a search of its address.
          {unmapped > 0 && ` ${unmapped} propert${unmapped === 1 ? 'y is' : 'ies are'} not yet mapped.`}
        </p>
      </div>
    </section>
  )
}
