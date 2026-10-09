import { useState, useEffect, useMemo, useRef } from 'react'
import { useContent } from '../data/content.ts'
import type { MouseEvent, TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { PhotoHero } from '../components/blocks.tsx'
import { Button } from '../components/ui.tsx'
import { inr, STATIC_HOTELS } from '../data/hotels.ts'
import { GALLERY_COUNT } from '../data/site.ts'
import {
  SPATIAL_STOPS,
  TOUR_PROPERTIES,
  TOUR_ZONES,
  type TourProperty,
  type TourZone,
  type HotspotPin,
} from '../data/virtualTourData.ts'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

type TourMode = 'walkthrough' | 'discovery' | 'customizer'

export default function VirtualTour() {
  const { t } = useContent()
  const [activeProperty, setActiveProperty] = useState<TourProperty>('all')
  const [activeZone, setActiveZone] = useState<TourZone>('lobby')
  const [activeMode, setActiveMode] = useState<TourMode>('walkthrough')
  const [activePin, setActivePin] = useState<HotspotPin | null>(null)

  // Splitter state (percentage 0-100)
  const [splitterPos, setSplitterPos] = useState<number>(50)
  const isDraggingSplitter = useRef(false)

  // Customizer selections
  const [selectedFirmness, setSelectedFirmness] = useState('plush')
  const [selectedView, setSelectedView] = useState('courtyard')
  const [selectedAmenity, setSelectedAmenity] = useState('fruit')

  // Mouse Parallax coordinates (subtle, stable 3D tilt)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const touchStartX = useRef<number | null>(null)

  // Filter available stops
  const filteredStops = useMemo(() => {
    const matched = SPATIAL_STOPS.filter((s) => {
      const propMatch = activeProperty === 'all' || s.property === activeProperty
      const zoneMatch = s.zone === activeZone
      return propMatch && zoneMatch
    })
    // Safety guard: if filter yields empty array for any edge reason, fallback to SPATIAL_STOPS
    return matched.length > 0 ? matched : SPATIAL_STOPS
  }, [activeProperty, activeZone])

  const [currentIndex, setCurrentIndex] = useState(0)

  // Ensure valid current index when filters change
  useEffect(() => {
    setCurrentIndex(0)
    setActivePin(null)
  }, [activeProperty, activeZone])

  // Safe index resolution (never NaN or out of bounds)
  const safeIndex = Math.min(currentIndex, Math.max(0, filteredStops.length - 1))
  const currentStop = filteredStops[safeIndex] ?? SPATIAL_STOPS[0]!

  // Autopilot ALWAYS ON (4.5s loop across slides in current filter)
  useEffect(() => {
    if (filteredStops.length <= 1) return
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % filteredStops.length)
      setActivePin(null)
    }, 4500)
    return () => clearInterval(timer)
  }, [filteredStops.length])

  const nextSlide = () => {
    if (filteredStops.length <= 1) return
    setCurrentIndex((prev) => (prev + 1) % filteredStops.length)
    setActivePin(null)
  }

  const prevSlide = () => {
    if (filteredStops.length <= 1) return
    setCurrentIndex((prev) => (prev - 1 + filteredStops.length) % filteredStops.length)
    setActivePin(null)
  }

  // Stable, gentle mouse tilt handler for 3D stage (never clips or disappears)
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (activeMode !== 'discovery' || window.matchMedia('(pointer: coarse)').matches) return
    if (isDraggingSplitter.current) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    // Very gentle tilt (-4deg to +4deg) ensuring zero clipping or disappearing boundaries
    setTilt({ x: x * 4, y: -y * 4 })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 })
  }

  // Touch gestures for mobile
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const endX = e.changedTouches[0]?.clientX ?? null
    if (endX !== null) {
      const diff = touchStartX.current - endX
      if (diff > 50) nextSlide()
      else if (diff < -50) prevSlide()
    }
    touchStartX.current = null
  }

  // Splitter drag logic
  const startSplitterDrag = () => {
    isDraggingSplitter.current = true
  }

  const handleStageMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isDraggingSplitter.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = ((e.clientX - rect.left) / rect.width) * 100
      setSplitterPos(Math.max(5, Math.min(95, pos)))
    } else {
      handleMouseMove(e)
    }
  }

  const stopSplitterDrag = () => {
    isDraggingSplitter.current = false
  }

  // Compute customizer effective price. The old ₹3,800 fallback matched no
  // Quadis room — the real range is ₹1,399–₹1,999 — so quote the cheapest
  // actual tariff when a stop has no price of its own.
  const CHEAPEST_TARIFF = Math.min(...STATIC_HOTELS.map((h) => h.price))
  const basePrice = currentStop.basePriceNight ?? CHEAPEST_TARIFF
  const viewDelta = selectedView === 'skyline' ? 400 : 0
  const amenityDelta = selectedAmenity === 'champagne' ? 2800 : 0
  const totalCustomPrice = basePrice + viewDelta + amenityDelta

  return (
    <>
      {/* "Virtual Tour" alone competes with every other hotel's virtual tour
          page. The replacement in src/data/seo.ts names the cities. */}
      <Seo {...pageSeo('/virtual-tour')} />
      <PhotoHero
        image={currentStop.getImage()}
        title={t('tour.hero.title')}
        sub={t('tour.hero.sub')}
        height="short"
      />

      <section className="section bg-cream tour-engine">
        <div className="container">
          {/* 1. Command Console (Properties & Zones) */}
          <div className="tour-console">
            <div className="tour-console__props">
              {TOUR_PROPERTIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`tour-console__btn ${activeProperty === p.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveProperty(p.id)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="tour-console__zones">
              {TOUR_ZONES.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  className={`tour-zone-pill ${activeZone === z.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveZone(z.id)
                  }}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Bar & Autopilot Status (Always On) */}
          <div className="tour-mode-bar">
            <div className="tour-mode-pills">
              <button
                type="button"
                className={`tour-mode-pill ${activeMode === 'walkthrough' ? 'is-active' : ''}`}
                onClick={() => setActiveMode('walkthrough')}
              >
                Walkthrough Mode
              </button>
              <button
                type="button"
                className={`tour-mode-pill ${activeMode === 'discovery' ? 'is-active' : ''}`}
                onClick={() => setActiveMode('discovery')}
              >
                Discovery Mode
              </button>
              <button
                type="button"
                className={`tour-mode-pill ${activeMode === 'customizer' ? 'is-active' : ''}`}
                onClick={() => setActiveMode('customizer')}
              >
                Suite Customizer
              </button>
            </div>

            <div className="tour-autopilot-ctrl">
              <span className="tour-autopilot-badge is-live">
                <span className="pulse-dot" /> Autopilot Active (4.5s Flow)
              </span>
            </div>
          </div>

          {/* 2. Cinematic Stage */}
          <div
            className={`tour-stage ${activeMode === 'discovery' ? 'is-parallax' : ''}`}
            onMouseMove={handleStageMove}
            onMouseUp={stopSplitterDrag}
            onMouseLeave={() => {
              handleMouseLeave()
              stopSplitterDrag()
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Parallax / Slide wrapper */}
            <div
              className="tour-stage__viewport"
              style={
                activeMode === 'discovery'
                  ? { transform: `perspective(1200px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg) scale(1.02)` }
                  : undefined
              }
            >
              {/* Day / Night Splitter in Discovery mode if available */}
              {activeMode === 'discovery' && currentStop.dayNightPair ? (
                <div className="tour-splitter">
                  <img src={currentStop.dayNightPair.nightImage} alt="Night View" className="tour-splitter__img" />
                  <div className="tour-splitter__clip" style={{ width: `${splitterPos}%` }}>
                    <img src={currentStop.dayNightPair.dayImage} alt="Day View" className="tour-splitter__img" />
                  </div>
                  <div
                    className="tour-splitter__handle"
                    style={{ left: `${splitterPos}%` }}
                    onMouseDown={startSplitterDrag}
                  >
                    <div className="tour-splitter__knob">
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none">
                        <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
                      </svg>
                    </div>
                  </div>
                  <div className="tour-splitter__labels">
                    <span className="splitter-lbl left">{currentStop.dayNightPair.dayLabel}</span>
                    <span className="splitter-lbl right">{currentStop.dayNightPair.nightLabel}</span>
                  </div>
                </div>
              ) : (
                <img
                  src={currentStop.getImage()}
                  alt={currentStop.title}
                  className="tour-stage__img tour-stage__img--zoom"
                  key={currentStop.id}
                />
              )}

              {/* Hotspot Pins in Discovery mode */}
              {activeMode === 'discovery' && currentStop.pins?.map((pin) => (
                <div
                  key={pin.id}
                  className={`tour-pin ${activePin?.id === pin.id ? 'is-active' : ''}`}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePin(activePin?.id === pin.id ? null : pin)
                  }}
                >
                  <button type="button" className="tour-pin__btn" aria-label={`View ${pin.title}`}>
                    <span className="pin-plus-bar pin-plus-bar--h" />
                    <span className="pin-plus-bar pin-plus-bar--v" />
                  </button>
                  {activePin?.id === pin.id && (
                    <div className="tour-pin__tooltip" onClick={(e) => e.stopPropagation()}>
                      <div className="tour-pin__tooltip-head">
                        <strong>{pin.title}</strong>
                        <button type="button" className="tour-pin__close" onClick={() => setActivePin(null)}>
                          &times;
                        </button>
                      </div>
                      <p>{pin.specification}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Stage Overlays: Walkthrough Mode & AI Concierge */}
            {activeMode === 'walkthrough' && (
              <div className="tour-stage__overlay">
                <div className="tour-stage__badge">
                  <span>{currentStop.propertyName}</span> • <span>{currentStop.zoneName}</span>
                </div>
                <h2 className="h2 tour-stage__title">{currentStop.title}</h2>
                <p className="tour-stage__desc">{currentStop.description}</p>
                <div className="tour-concierge-box">
                  <div className="tour-visualizer">
                    <span /> <span /> <span /> <span /> <span />
                  </div>
                  <p className="tour-concierge-text">
                    <strong>AI Concierge Note:</strong> Verified 4K spatial capture. Notice our signature calm architectural symmetry and high-ceiling acoustics.
                  </p>
                </div>
              </div>
            )}

            {/* Stage Navigation Arrows */}
            <button type="button" className="tour-nav-arrow left" onClick={prevSlide} aria-label="Previous room">
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" className="tour-nav-arrow right" onClick={nextSlide} aria-label="Next room">
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div className="tour-counter">
              {safeIndex + 1} / {filteredStops.length}
            </div>
          </div>

          {/* 3. Suite Customizer Panel */}
          {activeMode === 'customizer' && (
            <div className="tour-customizer">
              <h3 className="h3 mb-4">Personalize Your {currentStop.title} Stay</h3>
              <div className="tour-customizer__grid">
                <div>
                  <span className="tour-customizer__label">1. Pillow-Top Mattress Firmness</span>
                  <div className="tour-customizer__options">
                    {currentStop.customizer?.find((c) => c.category === 'firmness')?.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`customizer-chip ${selectedFirmness === o.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedFirmness(o.id)}
                      >
                        {o.name}
                      </button>
                    )) ?? (
                      <>
                        <button type="button" className={`customizer-chip ${selectedFirmness === 'plush' ? 'is-active' : ''}`} onClick={() => setSelectedFirmness('plush')}>Plush Cloud</button>
                        <button type="button" className={`customizer-chip ${selectedFirmness === 'med' ? 'is-active' : ''}`} onClick={() => setSelectedFirmness('med')}>Medium Orthopedic</button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <span className="tour-customizer__label">2. Room Orientation & View</span>
                  <div className="tour-customizer__options">
                    {currentStop.customizer?.find((c) => c.category === 'view')?.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`customizer-chip ${selectedView === o.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedView(o.id)}
                      >
                        {o.name} {o.priceDelta > 0 ? `(+${inr(o.priceDelta)})` : ''}
                      </button>
                    )) ?? (
                      <>
                        <button type="button" className={`customizer-chip ${selectedView === 'courtyard' ? 'is-active' : ''}`} onClick={() => setSelectedView('courtyard')}>Courtyard Garden</button>
                        <button type="button" className={`customizer-chip ${selectedView === 'skyline' ? 'is-active' : ''}`} onClick={() => setSelectedView('skyline')}>City Skyline (+INR 400)</button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="tour-customizer__label">3. VIP Welcome Amenity Basket</span>
                  <div className="tour-customizer__options">
                    {currentStop.customizer?.find((c) => c.category === 'amenity')?.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`customizer-chip ${selectedAmenity === o.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedAmenity(o.id)}
                      >
                        {o.name} {o.priceDelta > 0 ? `(+${inr(o.priceDelta)})` : ''}
                      </button>
                    )) ?? (
                      <>
                        <button type="button" className={`customizer-chip ${selectedAmenity === 'fruit' ? 'is-active' : ''}`} onClick={() => setSelectedAmenity('fruit')}>Organic Fruit &amp; Tea Basket</button>
                        <button type="button" className={`customizer-chip ${selectedAmenity === 'champagne' ? 'is-active' : ''}`} onClick={() => setSelectedAmenity('champagne')}>Moet &amp; Chandon with Truffles (+INR 2,800)</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="tour-booking-bar">
                <div>
                  <span className="tour-booking-bar__meta">Customized Rate ({currentStop.title})</span>
                  <strong className="tour-booking-bar__price">{inr(totalCustomPrice)} <span>/ night</span></strong>
                </div>
                <div className="tour-booking-bar__actions">
                  {/* gold, not primary. .btn--primary is `background: var(--bg-dark)`
                      and .tour-booking-bar is `background: var(--dark)`, so the
                      only call-to-action on the customizer rendered as bare text
                      with no visible fill — on desktop as well as mobile. Gold is
                      the accent this bar already uses for its rate label and its
                      gallery link, so this uses the existing token rather than
                      introducing a colour. */}
                  <Button to="/hotels" variant="gold">INSTANT PRE-BOOK WITH PREFERENCES</Button>
                  <Link to="/gallery" className="tour-booking-bar__gallery-link">Or view all {GALLERY_COUNT} photos in Gallery &rarr;</Link>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Thumbnails Strip */}
          <div className="tour-thumbs">
            {filteredStops.map((stop, i) => (
              <button
                key={stop.id}
                type="button"
                className={`tour-thumb ${i === safeIndex ? 'is-active' : ''}`}
                onClick={() => setCurrentIndex(i)}
              >
                <img src={stop.getImage()} alt={stop.title} className="tour-thumb__img" />
                <span className="tour-thumb__label">{stop.title}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
