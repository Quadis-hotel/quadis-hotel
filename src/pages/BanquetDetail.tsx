import { useParams } from 'react-router-dom'
import { BANQUETS } from '../data/hotels.ts'
import { banquetImages } from '../data/images.ts'
import type { EnquiryPayload } from '../types.ts'
import Gallery from '../components/Gallery.tsx'
import { Field, Button } from '../components/ui.tsx'
import { useForm, SuccessPanel, FormError, isEmail, isPhone, required } from '../components/forms.tsx'
import { SectionHeader } from '../components/blocks.tsx'
import { submitEnquiry } from '../data/enquiries.ts'

import NotFound from './NotFound.tsx'
import Seo from '../components/Seo.tsx'
import { banquetSeo } from '../data/seo.ts'

const OCCASIONS = ['Weddings', 'Receptions', 'Corporate', 'Birthdays']

export default function BanquetDetail() {
  const { slug } = useParams()
  const venue = BANQUETS.find((b) => b.slug === slug)
  const images = slug ? banquetImages(slug) : []

  const f = useForm<EnquiryPayload>(
    { name: '', phone: '', email: '', date: '', guests: '', message: '' },
    (v) => {
      const e: Partial<Record<keyof EnquiryPayload, string>> = {}
      if (!required(v.name)) e.name = 'Please enter your name'
      if (!isPhone(v.phone)) e.phone = 'Enter a valid 10-digit phone'
      if (!isEmail(v.email)) e.email = 'Enter a valid email'
      if (!required(v.date)) e.date = 'Please choose an event date'
      if (!required(v.guests)) e.guests = 'Approx. number of guests'
      return e
    }
  )

  if (!venue) return <NotFound />

  const specs = [
    { k: 'Capacity', v: `Up to ${venue.capacity} guests` },
    { k: 'Hall area', v: venue.hallArea },
    { k: 'Catering', v: venue.catering },
    { k: 'Parking', v: venue.parking },
  ]

  return (
    <>
      {/* Templated from the BANQUETS record, so a venue added or a capacity
          corrected in src/data/hotels.ts updates this page's snippet with no
          edit here. It also pins canonicalPath to /banquets/<slug>, which the
          inline version did not — that page relied on useLocation(), so any
          tracking query string arriving from an ad would have self-canonicalised
          into a second URL. */}
      <Seo {...banquetSeo(venue, images[0])} />
      <section className="section bg-cream">
        <div className="container">
          <h1 className="h2" style={{ marginBottom: 6 }}>{venue.name}</h1>
          <p className="detail-head__addr" style={{ marginBottom: 28 }}>{venue.area}, {venue.city}</p>

          <Gallery images={images} alt={venue.name} />

          <div className="specs-row">
            {specs.map((s) => (
              <div className="spec" key={s.k}>
                <span className="spec__k overline">{s.k}</span>
                <span className="spec__v">{s.v}</span>
              </div>
            ))}
          </div>

          <div className="detail-block">
            <span className="overline">SUITED FOR</span>
            <div className="chips">
              {OCCASIONS.map((o) => (<span className="chip" key={o}>{o}</span>))}
            </div>
          </div>

          <div className="enquiry">
            <div className="enquiry__intro">
              <SectionHeader overline="ENQUIRE" title="Plan your occasion" align="left" flank={false} />
              <p className="prose__p">Tell us a little about your event and our team will be in touch with availability and a considered proposal.</p>
            </div>

            {f.done ? (
              <SuccessPanel title="Enquiry received" onReset={f.reset}>
                Thank you — our banquet team will contact you shortly about {venue.name}.
              </SuccessPanel>
            ) : (
              <form className="form-grid" onSubmit={f.submit(async (v) => {
                await submitEnquiry({
                  enquiryType: 'BANQUET',
                  guestName: v.name,
                  guestPhone: v.phone,
                  guestEmail: v.email,
                  eventDate: v.date || undefined,
                  guestCount: v.guests ? Number(v.guests) : undefined,
                  message: `Venue: ${venue.name}\n${v.message}`.trim(),
                })
              })} noValidate>
                <Field label="Name" value={f.values.name} onChange={f.set('name')} error={f.errors.name} />
                <Field label="Phone" type="tel" value={f.values.phone} onChange={f.set('phone')} error={f.errors.phone} />
                <Field label="Email" type="email" value={f.values.email} onChange={f.set('email')} error={f.errors.email} />
                <Field label="Event date" type="date" value={f.values.date} onChange={f.set('date')} error={f.errors.date} />
                <Field label="Guests" type="number" min="1" value={f.values.guests} onChange={f.set('guests')} error={f.errors.guests} />
                <Field label="Message" as="textarea" className="form-grid__full" value={f.values.message} onChange={f.set('message')} placeholder="Occasion, preferred timing, catering notes…" />
                <div className="form-grid__full">
                  <FormError message={f.submitError} />
                  <Button as="button" type="submit" variant="primary" disabled={f.pending}>{f.pending ? 'Sending…' : 'SEND ENQUIRY'}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
