import { STATIC_HOTELS } from './hotels.ts'
import { galleryAll } from './images.ts'

/**
 * One source of truth for the numbers the site claims about itself.
 *
 * Counts that can be derived from data are derived, so they can't drift when a
 * property is added or retired. The rest are single constants — the site used to
 * claim 5,000+ and 500,000+ guests on the same page.
 */

/** Derived: never hardcode a property count in copy. */
export const PROPERTY_COUNT = STATIC_HOTELS.length

/** Derived from what is actually in the gallery buckets. */
export const GALLERY_COUNT = galleryAll.length

/** Year the group was founded — used by the hero overline and the footer. */
export const FOUNDED_YEAR = 2017

/** Central reservations number, shown in the footer and on every property page. */
export const QUADIS_PHONE = '+91 92173 73532'

/**
 * The single guest-count claim, confirmed by the client in "Website Changes"
 * (July 2026): "Replace '8+ Years' with '5000+ Happy Guests'". One number, used
 * everywhere — the page previously claimed 5,000+ and 500,000+ at the same time.
 */
export const GUESTS_SERVED_CLAIM = '5,000+'

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** "Nine thoughtfully run hotels…" reads better than "9 thoughtfully run hotels…". */
export function spellOut(n: number): string {
  const word = WORDS[n]
  if (!word) return String(n)
  return word.charAt(0).toUpperCase() + word.slice(1)
}
