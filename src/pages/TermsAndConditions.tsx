import { Link } from 'react-router-dom'
import { Reveal } from '../components/blocks.tsx'
import { useContent } from '../data/content.ts'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

/**
 * Ported from the client's existing site, read off
 * https://www.quadishotels.com/terms-and-conditions on 30 Jul 2026. Her page is
 * indexed and would 404 after the cutover, since we move onto the same domain.
 *
 * HER TWO DOCUMENTS CONTRADICT EACH OTHER, and this needs her decision.
 *
 * These terms say advance deposits "once paid, are non-refundable unless
 * otherwise stated". The cancellation and refund policy she sent on 27 Jul —
 * live here at /cancellation-policy — gives free cancellation up to 24 hours
 * before check-in. Both cannot be true, and the difference is a real refund to
 * a real guest.
 *
 * Rather than pick one on her behalf, the Reservations section below keeps her
 * wording and adds a precedence line pointing at the cancellation policy, which
 * is the more specific and more recent of the two and the one Razorpay requires
 * to be visible. That resolves the conflict without inventing a policy. It is
 * still a change to her legal text and she has to confirm it — see AGENTS.md.
 */
export default function TermsAndConditions() {
  const { t } = useContent()
  return (
    <>
      {/* Centralised into src/data/seo.ts with the other 24 routes, 5 Aug 2026. */}
      <Seo {...pageSeo('/terms-and-conditions')} />
      <div className="page-head bg-cream">
        <div className="container center-col">
          <h1 className="h1 h1--single-line">Terms &amp; Conditions</h1>
          <p className="lead">
            By making a reservation with us, you agree to comply with the following terms and conditions, which are designed to ensure a safe, comfortable and enjoyable stay for all our guests.
          </p>
        </div>
      </div>

      <section className="section bg-warm">
        <div className="container" style={{ maxWidth: '800px' }}>
          <Reveal className="prose">
            <h2 className="h3 mt-0">Reservations</h2>
            <p>
              All bookings must be confirmed with valid payment details at the time of reservation. Rates and availability are subject to change without prior notice.
            </p>
            <p>
              Cancellations, refunds and no-shows are governed in full by our{' '}
              <Link to="/cancellation-policy">Cancellation &amp; Refund Policy</Link>, which applies in the event of any inconsistency with these terms.
            </p>

            <h2 className="h3">Check-in &amp; check-out</h2>
            {/* Her ported text hardcoded 12:00 PM, which matched neither the
                2:00 PM the property pages used to show nor the 11:00 AM she
                confirmed on 5 Aug 2026 — three different check-in times on one
                site. Read from the same content keys the Stay Policy panel
                uses so the legal page cannot drift from the booking flow. */}
            <p>
              Standard check-in time is {t('policy.checkIn')} and check-out time is {t('policy.checkOut')}. Early check-in or late check-out requests are subject to availability and may attract additional charges at the discretion of the management.
            </p>

            <h2 className="h3">Guest conduct</h2>
            <p>
              Guests are expected to maintain proper decorum and respect hotel property, staff and fellow guests at all times. Any form of misconduct, damage to property or violation of hotel policies may result in immediate cancellation of the stay without any refund.
            </p>

            <h2 className="h3">Liability</h2>
            <p>
              Quadis Hotels shall not be held responsible for loss, theft or damage of personal belongings unless valuables are deposited in the hotel's secure lockers or designated safe facilities. Guests are advised to take necessary precautions for their belongings.
            </p>

            <h2 className="h3">Policy updates</h2>
            <p>
              Quadis Hotels reserves the right to modify or update these terms and conditions at any time without prior notice. Any changes will be effective immediately upon being posted on our official website.
            </p>

            <p>
              By proceeding with your booking, you acknowledge that you have read, understood and agreed to these terms and conditions.
            </p>

            <h2 className="h3">Contact</h2>
            <p>
              <strong>Quadis Services Private Limited</strong><br/>
              Brand: Quadis Hotels<br/>
              Email: <a href="mailto:info@quadishotels.com">info@quadishotels.com</a><br/>
              Phone: +91 92173 73532
            </p>
          </Reveal>
        </div>
      </section>
    </>
  )
}
