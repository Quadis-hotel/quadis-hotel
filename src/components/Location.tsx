import { useEffect, useRef, useState } from 'react'
import type { Hotel, HotelCoords } from '../types.ts'
import { IconPin, IconPhone } from './icons.tsx'

/**
 * Location system for a single property.
 *
 * Two rules run through all of it:
 *  - Address a *place*, not a string. With coords we query `lat,lng` so the pin
 *    is the front door; without them we fall back to the old text search.
 *  - Never state a fact we don't have. Every transit row is optional and the
 *    whole block disappears rather than showing a plausible guess.
 */

/** Google only receives a request once the guest asks for the interactive map. */
export function MapFacade({ hotel }: { hotel: Hotel }) {
  const [active, setActive] = useState(false)
  const [near, setNear] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Don't even build the facade markup until it's close to the viewport.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setNear(true); io.disconnect() } }),
      { threshold: 0, rootMargin: '0px 0px 200px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const q = hotel.coords
    ? `${hotel.coords.lat},${hotel.coords.lng}`
    : `${hotel.name}, ${hotel.address}`

  return (
    <div className="map-plate" ref={ref}>
      {active ? (
        <iframe
          title={`Map showing ${hotel.name}`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="map-plate__frame"
        />
      ) : (
        <button
          type="button"
          className="map-plate__facade"
          onClick={() => setActive(true)}
          aria-label={`Load interactive map for ${hotel.name}`}
        >
          {near && <span className="map-plate__grid" aria-hidden="true" />}
          <span className="map-plate__pin" aria-hidden="true"><IconPin /></span>
          <span className="map-plate__area">{hotel.area}, {hotel.city}</span>
          <span className="map-plate__cta">Tap for interactive map</span>
          {!hotel.coords && (
            <span className="map-plate__note">Approximate — located by address</span>
          )}
        </button>
      )}
    </div>
  )
}

const TRANSIT_ORDER: Array<keyof NonNullable<Hotel['transit']>> = ['metro', 'airport', 'rail', 'landmark']

/** Renders nothing until at least one fact has been verified for this property. */
export function GettingHere({ transit }: { transit?: Hotel['transit'] }) {
  const rows = TRANSIT_ORDER.map((k) => transit?.[k]).filter(Boolean) as NonNullable<Hotel['transit']>['metro'][]
  if (!rows.length) return null

  return (
    <div className="getting-here">
      <span className="overline">GETTING HERE</span>
      <h3 className="h3 getting-here__title">Four facts a map can&rsquo;t tell you</h3>
      <dl className="getting-here__list">
        {rows.map((f) => (
          <div className="getting-here__row" key={f!.name}>
            <dt>
              {f!.name}
              {f!.note && <span className="getting-here__note"> · {f!.note}</span>}
            </dt>
            {f!.value && <dd>{f!.value}</dd>}
          </div>
        ))}
      </dl>
    </div>
  )
}

const directionsUrl = (hotel: Hotel): string => {
  const c: HotelCoords | undefined = hotel.coords
  if (c) {
    const base = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
    return c.placeId ? `${base}&destination_place_id=${encodeURIComponent(c.placeId)}` : base
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${hotel.name}, ${hotel.address}`)}`
}

/** The same four actions, in the same order, on every property. */
export function LocationActions({ hotel, phone }: { hotel: Hotel; phone: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${hotel.name}, ${hotel.address}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context or denied permission) — the address
      // is already on screen directly above, so there is nothing to recover.
    }
  }

  const share = `https://wa.me/?text=${encodeURIComponent(`${hotel.name}\n${hotel.address}\n${directionsUrl(hotel)}`)}`

  return (
    <div className="loc-actions">
      <a className="loc-actions__btn loc-actions__btn--primary" href={directionsUrl(hotel)} target="_blank" rel="noopener noreferrer">
        Get directions
      </a>
      <button type="button" className="loc-actions__btn" onClick={copy}>
        {copied ? 'Address copied' : 'Copy address'}
      </button>
      <a className="loc-actions__btn" href={`tel:${phone.replace(/\s/g, '')}`}>
        <IconPhone /> Call property
      </a>
      <a className="loc-actions__btn" href={share} target="_blank" rel="noopener noreferrer">
        Share on WhatsApp
      </a>
      <span aria-live="polite" className="visually-hidden">{copied ? 'Address copied to clipboard' : ''}</span>
    </div>
  )
}
