import { PROPERTY_COUNT } from '../data/site.ts'
import { useContent } from '../data/content.ts'
import { SectionHeader, Button } from './ui.tsx'
import { Reveal } from './blocks.tsx'
import { banquetHero, restaurantImages, corporateStayImage, executiveStayImage } from '../data/images.ts'

interface Offering {
  title: string
  subtitle: string
  description: string
  badge: string
  image: string
  link: string
  cta: string
}

const OFFERINGS: Offering[] = [
  {
    title: 'Executive & Deluxe Stays',
    subtitle: 'Calm, considered rooms',
    description: 'Immaculate rooms designed around deep sleep, plush bedding, high-speed Wi-Fi, and 24x7 attentive room service across Sector 51, Sector 15, and Delhi.',
    badge: 'ROOMS & SUITES',
    // The client's captioned "Executive & Deluxe Stays image". Was homeImages[0],
    // i.e. the same photo as the homepage hero directly above this card.
    image: executiveStayImage,
    link: '/hotels',
    cta: 'EXPLORE ROOMS',
  },
  {
    title: 'Grand Banquets & Weddings',
    subtitle: 'Celebrations up to 500 guests',
    description: 'Pillarless luxury halls in Sector 51 Noida and Lajpat Nagar Delhi, equipped with customized gourmet catering, valet parking, and dedicated event planners.',
    badge: 'BANQUETS & EVENTS',
    image: banquetHero[0] || '/images/home/hero.webp',
    link: '/banquets',
    cta: 'EXPLORE VENUES',
  },
  {
    title: 'Corporate & Long Stays',
    subtitle: 'Tailored business packages',
    description: `Dedicated GST-compliant invoicing, express check-in, priority laundry, and discounted long-stay corporate tariffs across our ${PROPERTY_COUNT} NCR properties.`,
    badge: 'BUSINESS TRAVEL',
    // The client's own corporate/long-stay photograph (July 2026). Before it
    // arrived, public/images/corporate/ was empty and corporateImages fell back
    // to homeImages — so this card showed homeImages[0], the same photo as the
    // first card.
    image: corporateStayImage,
    link: '/corporate-hotel-booking',
    cta: 'CORPORATE TARIFFS',
  },
  {
    title: 'In-House Dining & Catering',
    subtitle: 'Refined culinary experiences',
    description: 'Multi-cuisine in-house kitchens serving freshly prepared breakfast spreads, wholesome room dining, and customized event menus tailored to every palate.',
    badge: 'RESTAURANT & BAR',
    image: restaurantImages()[0] || '/images/home/hero.webp',
    link: '/restaurant',
    cta: 'VIEW MENUS',
  },
]

export default function OurOfferings() {
  const { t } = useContent()
  return (
    <section className="section bg-cream">
      <div className="container">
        <SectionHeader overline={t('offerings.overline')} title={t('offerings.title')} />
        <Reveal className="offerings-grid">
          {OFFERINGS.map((offering) => (
            <article key={offering.title} className="offering-card">
              <div className="offering-card__media">
                <img src={offering.image} alt={offering.title} className="offering-card__img" loading="lazy" />
                <span className="offering-card__badge">{offering.badge}</span>
              </div>
              <div className="offering-card__body">
                <span className="overline offering-card__eyebrow">{offering.subtitle}</span>
                <h3 className="h3 offering-card__title">{offering.title}</h3>
                <p className="offering-card__desc">{offering.description}</p>
                <div className="offering-card__actions">
                  <Button to={offering.link} variant="ghost" className="offering-card__btn">
                    {offering.cta} &rarr;
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
