import { Link } from 'react-router-dom'
import { SectionHeader } from './blocks.tsx'

interface Deal {
  badgeText: string
  badgeColor: string
  title: string
  description: string
  image: string
  link: string
}

const DEALS: Deal[] = [
  {
    badgeText: 'DEAL OF THE DAY',
    badgeColor: 'bg-dark text-gold',
    title: 'Deal Of The Day',
    description: "Enjoy today's special deal with up to 25% instant discount across all properties!",
    image: '/images/offers/deal-of-the-day.webp',
    link: '/hotels',
  },
  {
    badgeText: 'NEVER TOO OLD',
    badgeColor: 'bg-dark text-gold',
    title: 'Never Too Old',
    description: 'Enjoy Our Full-Fledged Senior Citizen Package with special ground-floor rooms and complimentary breakfast!',
    image: '/images/offers/never-too-old.webp',
    link: '/hotels',
  },
  {
    badgeText: 'BOSS LADY',
    badgeColor: 'bg-dark text-gold',
    title: 'Boss Lady',
    description: 'Exclusive Perks, priority 24x7 security, and express check-in for Solo Female Travelers!',
    image: '/images/offers/boss-lady.webp',
    link: '/hotels',
  },
  {
    badgeText: 'STAY LONG STAY GREEN',
    badgeColor: 'bg-dark text-gold',
    title: 'Stay Long Stay Green',
    description: 'Big Savings up to 35% off on weekly and monthly extended stays across Noida & Delhi!',
    image: '/images/offers/stay-long-stay-green.webp',
    link: '/hotels',
  },
]

export default function DealsSection() {
  return (
    <section className="section bg-cream">
      <div className="container center-col">
        <div className="mb-10 text-center">
          <SectionHeader overline="CURATED OFFERS" title="Exclusive Savings" />
          <p className="intro__body" style={{ marginTop: '-12px' }}>Exclusive savings tailored for your next stay.</p>
        </div>
        
        <div className="deals-fern-layout">
          <div className="deals-fern-bg"></div>
          <div className="deals-fern-cards">
            {DEALS.map((deal) => (
              <div key={deal.title} className="deal-card-fern">
                <div className="deal-card-fern__img-wrapper">
                  <div className="deal-card-fern__circle">
                    {/* Fallback styling for images if missing */}
                    <img src={deal.image} alt={deal.title} loading="lazy" onError={(e) => {
                      (e.target as HTMLImageElement).src = '/images/home/hero.webp'
                    }} />
                  </div>
                </div>
                <h3 className="h3 deal-card-fern__title">{deal.title}</h3>
                <p className="deal-card-fern__desc">{deal.description}</p>
                <Link to={deal.link} className="deal-card-fern__btn">VIEW OFFER</Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
