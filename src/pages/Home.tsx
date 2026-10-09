import { useMemo, useState } from 'react'
import { useContent } from '../data/content.ts'
import { Link } from 'react-router-dom'
import { useHotels } from '../data/hotels.ts'
import { heroShowcaseImages, aboutHomes, aboutAirlines } from '../data/images.ts'
import type { CityFilter } from '../types.ts'
import BookingBar from '../components/BookingBar.tsx'

import { HotelCard, FilterPills, Button } from '../components/ui.tsx'
import { HeroVideoShowcase } from '../components/media.tsx'
import { SectionHeader, StatsStrip, CtaBand, Reveal } from '../components/blocks.tsx'
import { IconWifi, IconTv, IconAc, IconShield, IconTowel, IconShower, IconToiletries, IconBell } from '../components/icons.tsx'

import DestinationsGrid from '../components/DestinationsGrid.tsx'
import BusinessCtaBanner from '../components/BusinessCtaBanner.tsx'
import OurOfferings from '../components/OurOfferings.tsx'
import ExperiencesByQuadis from '../components/ExperiencesByQuadis.tsx'
import UpcomingHotels from '../components/UpcomingHotels.tsx'
import TierExpansion from '../components/TierExpansion.tsx'
import DealsSection from '../components/DealsSection.tsx'
import OffersForYou from '../components/OffersForYou.tsx'
import HappyClientsSection from '../components/HappyClientsSection.tsx'



import { PARTNER_LOGOS } from '../data/logos.ts'
import { CITY_FILTERS } from '../data/hotels.ts'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'
export default function Home() {
  const { t } = useContent()
  const [filter, setFilter] = useState<CityFilter>('All')
  const hotels = useHotels()

  const filtered = useMemo(
    () => (filter === 'All' ? hotels : hotels.filter((h) => h.city === filter)),
    [filter, hotels]
  )

  return (
    <>
      {/* Title and description are the client's own words, supplied verbatim in
          her feedback PDF (page 1, 5 Aug 2026). They live in src/data/seo.ts —
          do not reword them there without asking her. */}
      <Seo {...pageSeo('/')} />
      {/* 1. Master Welcome Hero: video + search bar, nothing else.
          The client asked (July 2026) for the overline and headline to come off
          the video and for the search bar to sit inside the frame rather than
          straddling its bottom edge. So the bar moved into the section and
          `overlap` is off — the old -112px pull would now drag it back out. */}
      <section className="home-hero scrim home-hero--bar-only">
        <HeroVideoShowcase posterUrl={heroShowcaseImages[0]} />
        <div className="container home-hero__bar">
          <BookingBar overlap={false} />
        </div>
      </section>

      {/* 3. Stats Strip ("and 2nd one below photos") directly beneath Photo Showcase */}
      <StatsStrip />

      {/* 3. Intro statement - Removed as per PDF request */}
      
      {/* 4. Hotels */}
      <section className="section bg-warm">
        <div className="container">
          <SectionHeader overline={t('home.properties.overline')} title={t('home.properties.title')} />
          <div className="home-hotels__pills">
            <FilterPills options={CITY_FILTERS} value={filter} onChange={setFilter} ariaLabel="Filter hotels by city" />
          </div>
          <div className="card-grid card-grid--anim" key={filter}>
            {filtered.map((h) => (<HotelCard key={h.slug} hotel={h} />))}
          </div>
        </div>
      </section>
      {/* 5. Great Sleep & Refreshing Showers Guarantee (§Stay Promise) */}
      <section id="promise" className="section stay-promise-section bg-dark text-on-dark">
        <div className="container">
          <Reveal className="stay-promise center-col text-center">
            <span className="stay-promise__pill">Fabulous, or Free</span>
            <h2 className="h2 on-dark stay-promise__title">
              Great <span className="script brown-text" style={{ fontSize: '1.2em' }}>sleep.</span> Refreshing <span className="script brown-text" style={{ fontSize: '1.2em' }}>showers.</span>
            </h2>
            <p className="lead stay-promise__sub">Hassle free stay, else we pay. <Link to="/contact">Know more.</Link></p>
            
            <div className="stay-promise__icons">
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconWifi /></div>
                <span>Free Wi-Fi</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconTv /></div>
                <span>HD Smart TV</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconAc /></div>
                <span>Climate AC</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconShield /></div>
                <span>24x7 Security</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconTowel /></div>
                <span>Clean Towels</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconShower /></div>
                <span>Hot Water</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconToiletries /></div>
                <span>Toiletries</span>
              </div>
              <div className="stay-promise__icon-item">
                <div className="stay-promise__icon-circle"><IconBell /></div>
                <span>Room Service</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 6. Our Offerings Section */}
      <OurOfferings />

      {/* 7. Experiences by Quadis + Upcoming Hotels — both missing from the
          live site (change order item 7). Note these overlap OurOfferings
          above; flagged to the client for a keep-one decision. */}
      <ExperiencesByQuadis />
      <UpcomingHotels />

      {/* 7b. Three-tier expansion roadmap (change order item 14). */}
      <TierExpansion />

      {/* 8. Destinations For You Section */}
      <DestinationsGrid />

      {/* 9. Deal Of The Day / Curated Offers */}
      <DealsSection />

      {/* 11. Business & Franchisee CTA Banner */}

      <BusinessCtaBanner />

      {/* 11.5. Future Vision */}
      <section className="section bg-dark text-on-dark">
        <div className="container">
          <SectionHeader overline={t('home.roadAhead.overline')} title={t('home.roadAhead.title')} onDark align="center" />
          <Reveal className="future-vision-grid mt-12">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <article className="future-card" style={{ background: 'var(--bg-warm)', color: 'var(--text-primary)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '16/9', overflow: 'hidden' }}>
                  <img src={aboutHomes} alt="Quadis Homes" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '32px' }}>
                  <span className="overline mb-2" style={{ display: 'block', color: 'var(--gold-deep)' }}>FUTURE VISION</span>
                  <h3 className="h3" style={{ fontFamily: 'var(--font-display)', fontSize: '30px' }}>Quadis Homes</h3>
                  <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Premium residential spaces designed with Quadis hospitality.</p>
                  <div className="mt-8" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="meta" style={{ background: 'var(--bg-cream)', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>In development</span>
                    <Link to="/contact" className="btn btn--primary btn--sm">CONTACT US</Link>
                  </div>
                </div>
              </article>
              <article className="future-card" style={{ background: 'var(--bg-warm)', color: 'var(--text-primary)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '16/9', overflow: 'hidden' }}>
                  <img src={aboutAirlines} alt="Quadis Airlines" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '32px' }}>
                  <span className="overline mb-2" style={{ display: 'block', color: 'var(--gold-deep)' }}>FUTURE VISION</span>
                  {/* Canonical name is "Quadis Airlines" — it is what the
                      client's own render shows on the fuselage, and what the
                      Ecosystem paragraph below and /about-us already use. */}
                  <h3 className="h3" style={{ fontFamily: 'var(--font-display)', fontSize: '30px' }}>Quadis Airlines</h3>
                  <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Elevating your journey before you even arrive.</p>
                  <div className="mt-8" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="meta" style={{ background: 'var(--bg-cream)', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>In development</span>
                    <Link to="/contact" className="btn btn--primary btn--sm">CONTACT US</Link>
                  </div>
                </div>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 12. Our Happy Clients & Guest Experience */}
      <HappyClientsSection />

      {/* 13. Offers for You — client asked for this to sit directly after the
          Guest Experience banner (change order item 12). */}
      <OffersForYou />



      {/* 14. Ecosystem & Partners banner */}
      <section className="section bg-dark">
        <div className="container center-col stack" style={{ gap: '40px' }}>
          <SectionHeader overline={t('home.ecosystem.overline')} title={t('home.ecosystem.title')} onDark />
          <Reveal className="prose center-col mb-4">
            <p>
              As Delhi NCR&rsquo;s leading hospitality brand, our leadership is anchored in genuine guest satisfaction, rigorous employee welfare, and ambitious future horizons including <strong>Quadis Airlines</strong> and <strong>Quadis Homes</strong>.
            </p>
          </Reveal>
          <div className="partners">
            {PARTNER_LOGOS.slice(0, 6).map((p) => (
              <img className="partner-logo" key={p.name} src={p.src} alt={p.name} loading="lazy" />
            ))}
          </div>
          <Button to="/about-us" variant="primary">EXPLORE OUR VISION &amp; ROADMAP</Button>
        </div>
      </section>

      {/* 15. CTA band */}
      <CtaBand />
    </>
  )
}

