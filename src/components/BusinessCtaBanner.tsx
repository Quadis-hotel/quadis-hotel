import { Reveal } from './blocks.tsx'
import { Button } from './ui.tsx'
import { IconShield, IconCheck } from './icons.tsx'

export default function BusinessCtaBanner() {
  return (
    <section className="section bg-warm">
      <div className="container">
        <Reveal className="business-cta-grid">
          {/* Card 1: Franchisee */}
          <div className="biz-card-modern">
            <div className="biz-card-modern__header">
              <div className="biz-card-modern__icon-wrap">
                <IconCheck className="biz-card-modern__icon" />
              </div>
              <h3 className="h3 biz-card-modern__title">Be a Quadis Hotel Franchisee</h3>
            </div>
            <p className="biz-card-modern__text">
              We increase occupancy, lower your marketing costs, and help provide fabulous stays to your guests.
            </p>
            <Button to="/contact" className="biz-card-modern__btn">
              Join our family &rarr;
            </Button>
          </div>

          {/* Card 2: Corporate Deals */}
          <div className="biz-card-modern">
            <div className="biz-card-modern__header">
              <div className="biz-card-modern__icon-wrap">
                <IconShield className="biz-card-modern__icon" />
              </div>
              <h3 className="h3 biz-card-modern__title">Get Corporate Deals</h3>
            </div>
            <p className="biz-card-modern__text">
              Avail highly reliable and value for money stays for your employees at discounted rates.
            </p>
            <Button to="/corporate-hotel-booking" className="biz-card-modern__btn">
              Request special rates &rarr;
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
