/**
 * Press and partner logos supplied by the client.
 *
 * Files live in public/logos/** rather than public/images/**, because
 * data/images.ts globs everything under public/images into the photo gallery —
 * a masthead would otherwise show up as a "Moment of Calm & Comfort".
 */

export interface Logo {
  /** Organisation name, used as the alt text and React key. */
  name: string
  src: string
  /** Live URL of the coverage. Entries without one are not rendered. */
  href?: string
  /** ISO date of publication, shown under the mark. */
  date?: string
}

/*
 * The "Featured In" press band was removed at the client's request (27 Jul
 * 2026), answering whether they had article links for the mastheads: "Remove
 * the section". The seven logo files under public/logos/press/ went with it —
 * a masthead shipped without coverage behind it is a trademark problem, and
 * there was no coverage to point at.
 */

/*
 * Bank marks for the "Offers for You" cards live in public/logos/banks/ and are
 * referenced directly from OffersForYou.tsx rather than listed here — they are
 * one-per-offer, so a shared array would only ever be looked up by name.
 *
 * They are derived assets, not the files the client sent. The originals are in
 * feedback/ (hdfc.webp, loogoicic.webp, upi-logo-04.webp, sbilogo.webp) and are
 * inconsistent: HDFC arrives as a tight 500x80 crop, UPI as a 500x500 card with
 * the mark floating in the middle AND a stock vendor's watermark in the corner.
 * Each is cropped to its content and resized to a common 64px height so the row
 * reads as one set; the UPI watermark is cropped away first.
 *
 * SBI IS PREPARED BUT NOT USED. She sent the artwork with the other three, but
 * there is no SBI offer on the page and she did not describe one — a bank logo
 * on a site implying a partnership that has not been stated is not something to
 * infer. public/logos/banks/sbi.webp is ready the moment she sends the terms.
 */

export const PARTNER_LOGOS: Logo[] = [
  { name: 'Aditya Birla', src: '/logos/partners/aditya-birla.png' },
  { name: 'Hitachi', src: '/logos/partners/hitachi.png' },
  { name: 'Polycab', src: '/logos/partners/polycab.png' },
  { name: 'Blackcomb Springs', src: '/logos/partners/blackcomb-springs.webp' },
  { name: 'Dassault Aviation', src: '/logos/partners/dassault-aviation.webp' },
  { name: 'Cloudnine', src: '/logos/partners/cloudnine.png' },
  { name: 'Hero Future Energies', src: '/logos/partners/hero-future-energy.png' },
  { name: 'Fuji Electric', src: '/logos/partners/fuji-electric.png' },
  { name: 'Horiba India', src: '/logos/partners/horiba-india.png' },
  { name: 'CICO Technologies', src: '/logos/partners/cico-technology.png' },
  { name: 'Malabar', src: '/logos/partners/malabar.png' },
  { name: 'TLC', src: '/logos/partners/tlc.png' },
  { name: 'Central Silk Board', src: '/logos/partners/central-silk-board.jpg' },
  { name: 'Balaji Railroad', src: '/logos/partners/balaji-railroad.jpg' },
  { name: 'CIRIA', src: '/logos/partners/ciria.jpg' },
]
