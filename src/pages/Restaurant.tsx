import { restaurantImages, cateringImages, restaurantBannerImage } from '../data/images.ts'
import { useContent } from '../data/content.ts'
import { PhotoHero, SectionHeader, CtaBand, Reveal } from '../components/blocks.tsx'
import { Button } from '../components/ui.tsx'
import { Photo } from '../components/media.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

/** `href` for destinations off this site, `to` for routes within it. */
interface Offering { title: string; blurb: string; img?: string | undefined; to?: string; href?: string; cta: string }

export default function Restaurant() {
  const { t } = useContent()
  const rImgs = restaurantImages()
  const cImgs = cateringImages()

  const OFFERINGS: Offering[] = [
    {
      title: 'In-house Restaurant',
      blurb: 'Refined all-day dining inside our properties — generous flavours, considered menus and warm, unhurried service.',
      // rImgs[1] first: rImgs[0] is hero.webp, which the PhotoHero above already
      // shows, so this card was repeating the image directly above it.
      img: rImgs[1] ?? rImgs[0],
      // Was 'VIEW MENU' pointing at this same page — there is no menu to show,
      // then /contact. The in-house restaurant is Story of Grains and it runs
      // its own site, so the client asked for this to hand off to it directly
      // (feedback, 5 Aug 2026) rather than route the enquiry through us.
      href: 'https://storyofgrains.com/',
      cta: 'ENQUIRE ABOUT DINING',
    },
    {
      title: 'Outdoor Catering Service',
      blurb: 'Full-service catering for events and celebrations across Delhi NCR, with seamless coordination from menu to service.',
      img: cImgs[0] ?? rImgs[1],
      to: '/restaurant/outdoor-catering-service',
      cta: 'EXPLORE CATERING',
    },
  ]

  return (
    <>
      {/* Copy moved verbatim into src/data/seo.ts (5 Aug 2026), where all 25
          routes now live — her SEO person's complaint was that there was no one
          place to read or edit them. */}
      <Seo {...pageSeo('/restaurant')} image={restaurantBannerImage ?? rImgs[0]} />
      {/* The client's own landing-page banner when present, photography otherwise.
          "banner" height contains it instead of cropping — see 3ac1877. */}
      <PhotoHero
        image={restaurantBannerImage ?? rImgs[0]}
        overline={t('restaurant.hero.overline')}
        title={t('restaurant.hero.title')}
        height={restaurantBannerImage ? 'banner' : 'short'}
      />

      <section className="section bg-cream">
        <div className="container">
          <SectionHeader overline={t('restaurant.offer.overline')} title={t('restaurant.offer.title')} />
          <Reveal className="intro__body center-block">
            From relaxed in-house dining to full-service outdoor catering, Quadis brings the same attention to
            detail to the table as it does to the room.
          </Reveal>

          <div className="offer-grid">
            {OFFERINGS.map((o) => (
              <article className="offer-card" key={o.title}>
                <div className="offer-card__media"><Photo src={o.img} ratio="16 / 10" label={o.title} /></div>
                <div className="offer-card__body">
                  <h3 className="h3">{o.title}</h3>
                  <p className="prose__p">{o.blurb}</p>
                  {o.href
                    ? <Button href={o.href} target="_blank" rel="noopener noreferrer" variant="ghost" className="hcard__cta">{o.cta}</Button>
                    : <Button to={o.to} variant="ghost" className="hcard__cta">{o.cta}</Button>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* A button labelled "Enquire on WhatsApp" that opened another page on
          this site was the complaint; it now opens the thread it names, on the
          central reservations number. */}
      <CtaBand
        title={t('restaurant.cta.title')}
        cta="ENQUIRE ON WHATSAPP"
        href="https://wa.me/919217373532?text=Hi%20Quadis%2C%20I%27d%20like%20to%20enquire%20about%20dining."
      />
    </>
  )
}
