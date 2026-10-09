import { Link } from 'react-router-dom'
import { useContent } from '../data/content.ts'
import { BANQUETS } from '../data/hotels.ts'
import { banquetImages, banquetHero } from '../data/images.ts'
import { PhotoHero, SectionHeader, CtaBand, Reveal } from '../components/blocks.tsx'
import { Button } from '../components/ui.tsx'
import { Photo } from '../components/media.tsx'
import { IconPin } from '../components/icons.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

export default function BanquetsList() {
  const { t } = useContent()
  return (
    <>
      {/* The old description said "Noida and Lajpat Nagar" and "valet parking",
          both of which stopped being true when Cladis was removed and the
          client restated capacities (5 Aug 2026): there is a third hall in East
          of Kailash, and Sector 51 is on-site parking, not valet. The copy in
          src/data/seo.ts counts BANQUETS instead of hardcoding three. */}
      <Seo {...pageSeo('/banquets')} />
      <PhotoHero image={banquetHero[0]} overline={t('banquets.hero.overline')} title={t('banquets.hero.title')} height="short" />

      <section className="section bg-cream">
        <div className="container">
          <SectionHeader overline={t('banquets.intro.overline')} title={t('banquets.intro.title')} />
          <Reveal className="intro__body center-block">{t('banquets.intro.body')}</Reveal>

          <div className="venue-grid">
            {BANQUETS.map((v) => (
              <article className="venue-card" key={v.slug}>
                <Link to={`/banquets/${v.slug}`} className="venue-card__media">
                  <Photo src={banquetImages(v.slug)[0]} ratio="16 / 10" label={v.name} alt={`${v.name} — ${v.area}, ${v.city}`} />
                </Link>
                <div className="venue-card__body">
                  <h3 className="h3">{v.name}</h3>
                  <p className="venue-card__cap">Up to {v.capacity} guests</p>
                  <p className="hcard__addr"><IconPin /> <span>{v.area}, {v.city}</span></p>
                  <Button to={`/banquets/${v.slug}`} variant="ghost" className="hcard__cta">EXPLORE VENUE</Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pointed at a single venue (Cladis) until 28 Jul 2026, which both
          dead-ended when that venue was retired and made no sense for a
          general "planning an occasion" prompt. Contact serves every venue. */}
      <CtaBand title={t('banquets.cta.title')} cta="ENQUIRE NOW" to="/contact" />
    </>
  )
}
