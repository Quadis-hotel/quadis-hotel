import { corporateImages, corporateBannerImage, galleryFacade } from '../data/images.ts'
import { CITIES } from '../data/hotels.ts'
import type { CorporateRFPPayload } from '../types.ts'
import { PhotoHero, SectionHeader, Reveal } from '../components/blocks.tsx'
import { Photo } from '../components/media.tsx'
import { Field, Button } from '../components/ui.tsx'
import { useForm, SuccessPanel, FormError, isEmail, isPhone, required } from '../components/forms.tsx'
import { submitEnquiry } from '../data/enquiries.ts'
import { useContent } from '../data/content.ts'
import Seo from '../components/Seo.tsx'
import { pageSeo } from '../data/seo.ts'


interface Benefit { title: string; body: string }
const BENEFITS: Benefit[] = [
  { title: 'Negotiated Rates', body: 'Consistent, transparent corporate pricing across every Quadis property in Delhi NCR.' },
  { title: 'Priority Availability', body: 'Reserved allocations and faster confirmations for your travelling teams.' },
  { title: 'Single Invoice', body: 'Consolidated, GST-compliant billing — one statement across stays and cities.' },
]

/**
 * The side image is addressed by filename rather than by index. It used to read
 * `corporateImages[1]`, and with public/images/corporate/ empty at the time
 * `corporateImages` fell back to the home set — whose second entry is a
 * photograph of a restaurant dining room, rendering here under the label
 * "Quadis Lobby". Adding a file to a folder should not be able to repoint it.
 */
const lobbyPhoto = (): string | undefined =>
  galleryFacade.find((url) => url.toLowerCase().includes('lobby'))

export default function Corporate() {
  const { t } = useContent()
  // The banner from the client's corporate landing-page zip, not the room shot.
  const heroImg = corporateBannerImage
  const sideImg = lobbyPhoto() ?? corporateImages[0]

  const f = useForm<CorporateRFPPayload>(
    { company: '', person: '', email: '', phone: '', city: '', rooms: '', message: '' },
    (v) => {
      const e: Partial<Record<keyof CorporateRFPPayload, string>> = {}
      if (!required(v.company)) e.company = 'Company name required'
      if (!required(v.person)) e.person = 'Contact person required'
      if (!isEmail(v.email)) e.email = 'Enter a valid email'
      if (!isPhone(v.phone)) e.phone = 'Enter a valid 10-digit phone'
      if (!required(v.city)) e.city = 'Select a city'
      return e
    }
  )

  return (
    <>
      {/* Copy unchanged, only relocated to src/data/seo.ts. */}
      <Seo {...pageSeo('/corporate-hotel-booking')} image={heroImg} />
      <PhotoHero image={heroImg} overline={t('corporate.hero.overline')} title={t('corporate.hero.title')} height="banner" />

      <section className="section bg-cream">
        <div className="container corp-split">
          <div className="corp-copy">
            <span className="overline">Your Reliable Partner for Corporate Accommodation</span>
            <h2 className="h2">{t('corporate.intro.title')}</h2>
            <p className="prose__p">{t('corporate.intro.body')}</p>
            <p className="prose__p">
              Whether it is a single visiting executive or a rolling monthly requirement, you get one point of
              contact, consistent quality and transparent billing.
            </p>
          </div>
          <Reveal className="corp-photo">
            <Photo src={sideImg} ratio="4 / 3" label="Quadis Lobby" alt="Quadis hotel lobby" />
          </Reveal>
        </div>
      </section>

      <section className="section bg-warm">
        <div className="container">
          <SectionHeader overline={t('corporate.why.overline')} title={t('corporate.why.title')} />
          <div className="card-grid values-grid">
            {BENEFITS.map((b) => (
              <Reveal key={b.title} className="value-card">
                <span className="value-card__rule" aria-hidden="true" />
                <h3 className="h3">{b.title}</h3>
                <p>{b.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container form-wrap">
          <SectionHeader overline={t('corporate.rfp.overline')} title={t('corporate.rfp.title')} />
          {f.done ? (
            <SuccessPanel title="Request received" onReset={f.reset}>
              Thank you — our corporate desk will respond with negotiated rates and terms shortly.
            </SuccessPanel>
          ) : (
            <form className="form-grid form-grid--card" onSubmit={f.submit(async (v) => {
              await submitEnquiry({
                enquiryType: 'CORPORATE_RFP',
                guestName: `${v.person} (${v.company})`,
                guestPhone: v.phone,
                guestEmail: v.email,
                message: [
                  `Company: ${v.company}`,
                  `City: ${v.city}`,
                  v.rooms ? `Rooms per month: ${v.rooms}` : '',
                  v.message,
                ].filter(Boolean).join('\n'),
              })
            })} noValidate>
              <Field label="Company" value={f.values.company} onChange={f.set('company')} error={f.errors.company} />
              <Field label="Contact person" value={f.values.person} onChange={f.set('person')} error={f.errors.person} />
              <Field label="Email" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
              <Field label="Phone" type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
              <Field label="City" as="select" value={f.values.city} onChange={f.set('city')} error={f.errors.city}>
                <option value="">Select city</option>
                {CITIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </Field>
              <Field label="Rooms / month (approx.)" type="number" min="1" value={f.values.rooms} onChange={f.set('rooms')} />
              <Field label="Message" as="textarea" className="form-grid__full" value={f.values.message} onChange={f.set('message')} placeholder="Tell us about your travel patterns and requirements…" />
              <div className="form-grid__full">
                <FormError message={f.submitError} />
                <Button as="button" type="submit" variant="primary" disabled={f.pending}>{f.pending ? 'Sending…' : 'REQUEST CORPORATE RATES'}</Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
