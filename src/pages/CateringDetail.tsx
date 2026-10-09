import { cateringImages, restaurantImages } from '../data/images.ts'
import Gallery from '../components/Gallery.tsx'
import { Button } from '../components/ui.tsx'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

const CUISINE = ['North Indian', 'Mughlai', 'Chinese', 'Continental', 'Live Chaat & Grills', 'Desserts & Bakery']

export default function CateringDetail() {
  const catering = cateringImages()
  const images = catering.length ? catering : restaurantImages()

  return (
    <>
      {/* Copy unchanged, only relocated to src/data/seo.ts — it was already
          specific to this page and the brief was coverage, not churn. */}
      <Seo {...pageSeo('/restaurant/outdoor-catering-service')} image={images[0]} />
      <section className="section bg-cream">
        <div className="container">
          <h1 className="h2" style={{ marginBottom: 6 }}>Outdoor Catering Service</h1>
          <p className="detail-head__addr" style={{ marginBottom: 28 }}>Full-service event catering across Delhi NCR</p>

          <Gallery images={images} alt="Quadis outdoor catering" />

          <div className="detail-grid detail-grid--simple">
            <div className="detail-main">
              <section className="detail-block">
                <span className="overline">CUISINE HIGHLIGHTS</span>
                <div className="chips">
                  {CUISINE.map((c) => (<span className="chip" key={c}>{c}</span>))}
                </div>
              </section>

              <section className="detail-block">
                <span className="overline">ABOUT THE SERVICE</span>
                <h2 className="h3">Catering, handled end to end</h2>
                <p className="prose__p">
                  Our catering team manages everything from menu design to on-site service, so your event runs
                  without a hitch. Veg and non-veg menus, live counters and considered presentation — delivered
                  with the same warm, attentive service that defines every Quadis experience.
                </p>
              </section>
            </div>

            <aside className="hours-card">
              <span className="overline">HOURS</span>
              <ul className="hours">
                <li><span>Mon – Fri</span><strong>10:00 – 20:00</strong></li>
                <li><span>Sat – Sun</span><strong>09:00 – 21:00</strong></li>
              </ul>
              <p className="hours-card__note">Enquire any day for event dates and custom menus.</p>
              <Button href="https://wa.me/919217373532?text=Hi%20Quadis%2C%20I%27d%20like%20to%20enquire%20about%20outdoor%20catering." variant="primary" className="hcard__cta">ENQUIRE ON WHATSAPP</Button>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
