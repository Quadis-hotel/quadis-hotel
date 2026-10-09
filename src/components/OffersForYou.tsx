import { useState } from 'react'
import { PROPERTY_COUNT } from '../data/site.ts'
import { SectionHeader } from './ui.tsx'
import { Reveal } from './blocks.tsx'

interface OfferCard {
  bank: string
  code: string
  discount: string
  details: string
  validity: string
  /**
   * The bank's own mark, shown alongside the name rather than instead of it.
   *
   * Client, 5 Aug 2026: "Add logo for HDFC, ICICI, UPI Special in this section",
   * pointing at these three pills. Additive is the safe reading — dropping the
   * text would take "SPECIAL" off the UPI card, which is the only place that
   * word appears, and would leave the offer unsearchable on the page.
   *
   * Artwork is hers, delivered the same day. It is prepared into
   * public/logos/banks/ at a common 64px height with the surrounding whitespace
   * removed, and in UPI's case with the stock vendor's watermark cropped off —
   * see the note in logos.ts. Files live under public/logos/ and NOT
   * public/images/, because data/images.ts globs the latter into the gallery.
   */
  logo: string
}

const OFFERS: OfferCard[] = [
  {
    bank: 'HDFC BANK',
    code: 'QUADISHDFC',
    discount: 'FLAT 15% OFF',
    details: 'Get 15% off up to ₹1,500 on your Quadis stay when paying with HDFC Bank Credit & Debit Cards.',
    validity: 'Valid on stays through Dec 2026',
    logo: '/logos/banks/hdfc.webp',
  },
  {
    bank: 'ICICI BANK',
    code: 'QUADIS500',
    discount: '₹500 INSTANT DISCOUNT',
    details: 'Flat ₹500 discount on all room bookings above ₹1,999 using ICICI NetBanking or Cards.',
    validity: 'Valid on weekends & weekdays',
    logo: '/logos/banks/icici.webp',
  },
  {
    bank: 'UPI SPECIAL',
    code: 'QUADISUPI',
    discount: 'FLAT 10% CASHBACK',
    details: 'Instant 10% discount when booking online directly and completing checkout via UPI (GPay, PhonePe, Paytm).',
    // Derived: this line read "all 10 properties" and there are nine.
    validity: `Valid across all ${PROPERTY_COUNT} properties`,
    logo: '/logos/banks/upi.webp',
  },
]

export default function OffersForYou() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2500)
  }

  return (
    <section className="featured-section">
      <div className="container">
        <div className="offers-container">
          <SectionHeader overline="SPECIAL SAVINGS" title="Offers for You" />
          <Reveal className="offers-grid">
            {OFFERS.map((offer) => (
              <div key={offer.code} className="offer-card">
                <div>
                  <div className="offer-header">
                    {/* Sizing sits inline rather than in components.css purely
                        to keep this change off a stylesheet three other pieces
                        of work are touching this week; it belongs in
                        .offer-bank-tag once those land. The mark is decorative
                        here — the bank name is right beside it — so alt is
                        empty rather than a duplicate announcement. */}
                    <span
                      className="offer-bank-tag"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <img
                        src={offer.logo}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ height: '14px', width: 'auto', display: 'block' }}
                      />
                      {offer.bank}
                    </span>
                    <span className="offer-discount-tag">{offer.discount}</span>
                  </div>
                  <p className="offer-details">{offer.details}</p>
                  <p className="offer-validity">{offer.validity}</p>
                </div>
                <div className="offer-footer">
                  <span className="offer-code-text">{offer.code}</span>
                  <button type="button" onClick={() => handleCopy(offer.code)} className="offer-copy-button">
                    {copiedCode === offer.code ? '✓ COPIED' : 'COPY CODE'}
                  </button>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
