import { useMemo } from 'react'
import { useContent } from '../data/content.ts'
import { SectionHeader } from './ui.tsx'
import { Reveal } from './blocks.tsx'
import { useHotels, UPCOMING_HOTELS } from '../data/hotels.ts'

/**
 * Derived from real data rather than a hand-maintained list.
 *
 * The old hardcoded array contradicted UPCOMING_HOTELS — Gurgaon, Manesar,
 * Faridabad and New Delhi were marked `active` here and COMING SOON there, and
 * both rendered on /hotels. It also listed Bengaluru, where Quadis has no
 * property, using a hotel interior as the city tile. Quadis operates in Noida
 * and New Delhi only.
 */
interface Destination {
  name: string
  image: string
  comingSoon: boolean
}

/** City tiles, not property shots. Every file here is a cityscape. */
const CITY_IMAGES: Record<string, string> = {
  'Noida': '/images/upcoming/noida.webp',
  'New Delhi': '/images/upcoming/delhi.webp',
}

export default function DestinationsGrid() {
  const { t } = useContent()
  const hotels = useHotels()

  const destinations = useMemo<Destination[]>(() => {
    const active = [...new Set(hotels.map((h) => h.city))].map((city) => ({
      name: city,
      image: CITY_IMAGES[city] ?? '/images/upcoming/delhi.webp',
      comingSoon: false,
    }))

    const activeNames = new Set<string>(active.map((d) => d.name))
    const upcoming = UPCOMING_HOTELS
      // A city cannot be both live and coming soon.
      .filter((u) => !activeNames.has(u.name))
      .map((u) => ({
        name: u.name,
        image: u.image ?? '/images/upcoming/delhi.webp',
        comingSoon: true,
      }))

    return [...active, ...upcoming]
  }, [hotels])

  return (
    <section id="where-we-are" className="section bg-cream">
      <div className="container">
        <SectionHeader overline={t('destinations.overline')} title={t('destinations.title')} />

        <Reveal className="destinations-grid">
          {destinations.map((dest) => (
            <div key={dest.name} className={`dest-stamp ${dest.comingSoon ? 'dest-stamp--coming' : ''}`}>
              <div className="dest-stamp__frame">
                <div className="dest-stamp__inner">
                  <img src={dest.image} alt={dest.name} loading="lazy" className="dest-stamp__img" />
                </div>
                {dest.comingSoon && <span className="dest-stamp__badge">COMING SOON</span>}
              </div>
              <span className="dest-stamp__name">{dest.name}</span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
