import { PROPERTY_COUNT, spellOut } from '../data/site.ts'
import { useContent } from '../data/content.ts'
import { SectionHeader, Button } from './ui.tsx'
import { Reveal } from './blocks.tsx'
import { experienceHotelsImage, experienceBanquetImage, experienceRestaurantImage } from '../data/images.ts'

/**
 * The three-card band the client asked for in item 7 of the change order.
 *
 * Their reference screenshot is a capture of a different group's site (the
 * cards read "OPO ..."). Only the layout is borrowed — every string and image
 * here is Quadis'.
 */
interface Experience {
  title: string
  description: string
  image: string
  link: string
}

const EXPERIENCES: Experience[] = [
  {
    title: 'Hotels by Quadis',
    // Derived, not written out: the reference said "Ten considered properties"
    // and there are nine.
    description: `${spellOut(PROPERTY_COUNT)} considered properties across Noida and New Delhi — calm rooms, prime locations, and warm, attentive service.`,
    image: experienceHotelsImage,
    link: '/hotels',
  },
  {
    title: 'Banquets by Quadis',
    description: 'Elegant halls for weddings, receptions and corporate gatherings, with seamless catering and coordination.',
    image: experienceBanquetImage,
    link: '/banquets',
  },
  {
    title: 'Restaurant by Quadis',
    description: 'In-house dining and outdoor catering — refined menus, generous flavours, and effortless hospitality.',
    image: experienceRestaurantImage,
    link: '/restaurant',
  },
]

export default function ExperiencesByQuadis() {
  const { t } = useContent()
  return (
    <section className="section bg-dark text-on-dark">
      <div className="container">
        <SectionHeader overline={t('experiences.overline')} title={t('experiences.title')} onDark align="center" />
        <Reveal className="experiences-grid">
          {EXPERIENCES.map((exp) => (
            <article key={exp.title} className="experience-card">
              <div className="experience-card__media">
                <img src={exp.image} alt={exp.title} className="experience-card__img" loading="lazy" />
              </div>
              <div className="experience-card__body">
                <h3 className="h3 experience-card__title">{exp.title}</h3>
                <p className="experience-card__desc">{exp.description}</p>
                <div className="experience-card__actions">
                  <Button to={exp.link} variant="ghost">KNOW MORE</Button>
                </div>
              </div>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
