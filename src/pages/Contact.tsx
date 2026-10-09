import { SectionHeader, LocationMap, Reveal } from '../components/blocks.tsx'
import { useContent } from '../data/content.ts'
import { Field, Button } from '../components/ui.tsx'
import { useForm, SuccessPanel, FormError, isEmail, isPhone, required } from '../components/forms.tsx'
import { IconPhone, IconMail, IconPin } from '../components/icons.tsx'
import type { ContactPayload, ContactType } from '../types.ts'
import { submitEnquiry, enquiryTypeFor } from '../data/enquiries.ts'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'


const TYPES: ContactType[] = ['General', 'Booking', 'Banquet', 'Corporate', 'Feedback']
const HQ = encodeURIComponent('H-22, Sector 51, Noida, Gautam Buddha Nagar, UP 201307')

export default function Contact() {
  const { t } = useContent()
  const f = useForm<ContactPayload>(
    { name: '', email: '', phone: '', type: 'General', message: '' },
    (v) => {
      const e: Partial<Record<keyof ContactPayload, string>> = {}
      if (!required(v.name)) e.name = 'Please enter your name'
      if (!isEmail(v.email)) e.email = 'Enter a valid email'
      // Required: the backend needs a phone number to route the enquiry to the property.
      if (!required(v.phone)) e.phone = 'Please enter your phone number'
      else if (!isPhone(v.phone)) e.phone = 'Enter a valid 10-digit phone'
      if (!required(v.message)) e.message = 'Please add a message'
      return e
    }
  )

  return (
    <>
      {/* "Contact Us" as a title ranks for nothing. The replacement in
          src/data/seo.ts puts the reservations number in the description, taken
          from QUADIS_PHONE so it cannot go stale against the footer. */}
      <Seo {...pageSeo('/contact')} />
      <section className="section bg-cream">
        <div className="container">
          <SectionHeader overline="CONTACT US" title="We'd love to hear from you" />
          {/* The 'contact.intro' admin field existed with nothing rendering it,
              so editing it changed nothing. Same pattern as the banquets lead. */}
          <Reveal className="intro__body center-block">{t('contact.intro')}</Reveal>

          <div className="contact-split">
            <div className="contact-form">
              {f.done ? (
                <SuccessPanel title="Message sent" onReset={f.reset}>
                  Thank you for reaching out — our team will get back to you shortly.
                </SuccessPanel>
              ) : (
                <form className="form-grid form-grid--card" onSubmit={f.submit(async (v) => {
                  await submitEnquiry({
                    enquiryType: enquiryTypeFor(v.type),
                    guestName: v.name,
                    guestPhone: v.phone,
                    guestEmail: v.email,
                    message: v.message,
                  })
                })} noValidate>
                  <Field label="Name" className="form-grid__full" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
                  <Field label="Email" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
                  <Field label="Phone" type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
                  <Field label="Type" as="select" className="form-grid__full" value={f.values.type} onChange={f.set('type')}>
                    {TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </Field>
                  <Field label="Message" as="textarea" className="form-grid__full" value={f.values.message} onChange={f.set('message')} error={f.errors.message} />
                  <div className="form-grid__full">
                    <FormError message={f.submitError} />
                    <Button as="button" type="submit" variant="primary" disabled={f.pending}>{f.pending ? 'Sending…' : 'SUBMIT'}</Button>
                  </div>
                </form>
              )}
            </div>

            <aside className="contact-side">
              <div className="map-embed map-embed--tall">
                <LocationMap query={HQ} />
              </div>
              <ul className="contact-info">
                <li><span className="contact-info__ic"><IconPhone /></span><a href="tel:+919217373532">+91 92173 73532</a></li>
                <li><span className="contact-info__ic"><IconMail /></span><a href="mailto:info@quadishotels.com">info@quadishotels.com</a></li>
                <li><span className="contact-info__ic"><IconPin width={18} height={18} /></span><span>H-22, LT SH Jagpal Singh, Sector-51, Noida, Gautam Buddha Nagar, UP 201307</span></li>
              </ul>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
