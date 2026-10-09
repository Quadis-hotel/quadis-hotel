import { GUESTS_SERVED_CLAIM } from '../data/site.ts'
import { useState } from 'react'
import type { ReactNode, ElementType } from 'react'
import { useReveal } from './useReveal.ts'
import { SectionHeader, Button } from './ui.tsx'
import { HeroMedia } from './media.tsx'

interface PhotoHeroProps {
  image?: string | undefined
  overline?: string
  title: string
  sub?: string
  height?: 'band' | 'short' | 'banner'
  children?: ReactNode
}
// Full-bleed photo hero band with scrim + centered light text (§1, §6).
export function PhotoHero({ image, overline, title, sub, height = 'band', children }: PhotoHeroProps) {
  return (
    <section className={`photo-hero photo-hero--${height} scrim`}>
      <HeroMedia src={image} />
      <div className="container photo-hero__content">
        {overline && <span className="overline on-dark">{overline}</span>}
        <h1 className="h1 on-dark photo-hero__title">{title}</h1>
        {sub && <p className="lead photo-hero__sub">{sub}</p>}
        {children}
      </div>
    </section>
  )
}

import { useHotels } from '../data/hotels'

export function StatsStrip() {
  const ref = useReveal()
  const hotels = useHotels()
  const cityCount = new Set(hotels.map(h => h.city)).size

  const STATS = [
    { n: hotels.length.toString(), label: 'Properties' },
    { n: cityCount.toString(), label: 'Cities' },
    { n: GUESTS_SERVED_CLAIM, label: 'Happy Guests' },
    { n: '4.5★', label: 'Rating' },
    { n: '95%', label: 'Repeat Guests' },
  ]

  return (
    <section className="section bg-cream">
      <div ref={ref} className="container reveal stats">
        {STATS.map((s) => (
          <div className="stat" key={s.label}>
            <span className="stat__n">{s.n}</span>
            <span className="stat__l overline">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * `href` is for an in-page target, `to` for a route. Pass `href` on any page
 * that is already the destination.
 *
 * The client reported this button as "not working" (29 Jul, item 3). It was:
 * `to` defaults to /hotels, so on /hotels itself the button linked to the page
 * it was already on. React Router navigated to the identical route, nothing
 * re-rendered, and the click did nothing at all. On a hotel detail page it was
 * worse than dead — it sent the guest back to the list, away from the booking
 * widget sitting further up the same page.
 *
 * A route link cannot express "scroll to the rooms" — hence the split. `href`
 * renders a plain anchor, which the browser scrolls natively and which honours
 * the `scroll-behavior` already set in global.css.
 */
interface CtaBandProps { title?: string; cta?: string; to?: string; href?: string }
export function CtaBand({ title = 'Ready to book your stay?', cta = 'BOOK A RESERVATION', to = '/hotels', href }: CtaBandProps) {
  const ref = useReveal()
  return (
    <section className="section bg-cream">
      <div ref={ref} className="container reveal cta-band">
        <h2 className="h2">{title}</h2>
        {href
          ? <Button href={href} variant="primary">{cta}</Button>
          : <Button to={to} variant="primary">{cta}</Button>}
      </div>
    </section>
  )
}

export function LocationMap({ query }: { query: string }) {
  const [mounted, setMounted] = useState(false)
  return (
    <div className="map-facade" style={{ position: 'relative', width: '100%', height: '300px', backgroundColor: '#e5e3df', cursor: 'pointer', overflow: 'hidden', borderRadius: 'var(--radius)' }} onClick={() => setMounted(true)}>
      {!mounted ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: 'url(/images/home/hero.jpg)', backgroundSize: 'cover' }}>
          <div style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-on-dark)', padding: '12px 24px', borderRadius: '4px', zIndex: 1 }}>
            Load Interactive Map
          </div>
          <div className="scrim" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        </div>
      ) : (
        <iframe
          title={`Map for ${query}`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      )}
    </div>
  )
}

interface RevealProps { as?: ElementType; className?: string; children: ReactNode }
export function Reveal({ as: Tag = 'div', className = '', children }: RevealProps) {
  const ref = useReveal<HTMLElement>()
  return <Tag ref={ref} className={`reveal ${className}`}>{children}</Tag>
}

export { SectionHeader }
