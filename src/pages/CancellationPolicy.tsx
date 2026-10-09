import { Reveal } from '../components/blocks.tsx'
import { useContent } from '../data/content.ts'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'

export default function CancellationPolicy() {
  const { t } = useContent()
  return (
    <>
      {/* The old description restated the title and told a searcher nothing.
          The replacement names what is actually on the page. canonicalPath is
          now pinned too, matching the other two legal pages. */}
      <Seo {...pageSeo('/cancellation-policy')} />
      <div className="page-head bg-cream">
        <div className="container center-col">
          <h1 className="h1 h1--single-line">{t('cancellation.title')}</h1>
          <p className="lead">
            At Quadis Hotels, we strive to provide a smooth and transparent booking experience for all our guests. Please read our cancellation and refund policy carefully before confirming your reservation.
          </p>
        </div>
      </div>

      <section className="section bg-warm">
        <div className="container" style={{ maxWidth: '800px' }}>
          <Reveal className="prose">
            <h2 className="h3 mt-0">{t('cancellation.s1')}</h2>
            <p>
              A booking is considered confirmed only after successful payment and receipt of a confirmation email, SMS, or WhatsApp message from Quadis Hotels.
            </p>

            <h2 className="h3">{t('cancellation.s2')}</h2>
            <ul>
              <li>Guests may cancel their reservation up to 24 hours before the scheduled check-in time without any cancellation charges.</li>
              <li>Cancellations made within 24 hours of the check-in time may be charged the equivalent of one night's stay.</li>
              <li>In case of no-show (guest does not arrive without prior cancellation), the booking amount for the first night or the entire prepaid amount (as applicable) will be non-refundable.</li>
              <li>Some promotional, discounted, festive, or special event bookings may be non-refundable. Such conditions will be clearly mentioned at the time of booking.</li>
            </ul>

            <h2 className="h3">{t('cancellation.s3')}</h2>
            <ul>
              <li>Eligible refunds will be processed to the original payment method used during booking.</li>
              <li>Refunds are generally processed within 7–10 business days after cancellation approval.</li>
              <li>The actual credit timeline may vary depending on your bank or payment provider.</li>
              <li>Any payment gateway or bank charges deducted during the transaction may not be refundable unless required by applicable law.</li>
            </ul>

            <h2 className="h3">{t('cancellation.s4')}</h2>
            <p>
              Subject to room availability, guests may request changes to booking dates before check-in. Any difference in room rates or applicable charges must be paid at the time of modification.
            </p>

            <h2 className="h3">{t('cancellation.s5')}</h2>
            <p>
              If a guest checks out earlier than the confirmed departure date, refunds for unused nights will be at the discretion of hotel management and may not be applicable depending on the booking plan.
            </p>

            <h2 className="h3">{t('cancellation.s6')}</h2>
            <p>
              Quadis Hotels shall not be held responsible for cancellations or delays caused by circumstances beyond our reasonable control, including but not limited to natural disasters, government restrictions, public emergencies, strikes, or other unforeseen events.
            </p>

            <h2 className="h3">{t('cancellation.s7')}</h2>
            <p>
              For any cancellation or refund-related queries, please contact:<br/><br/>
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
