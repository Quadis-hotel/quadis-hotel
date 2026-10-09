/**
 * URLs the client's existing site has indexed, and where they go on this one.
 *
 * We are cutting over on the SAME domain, so on switch day Google's results and
 * every backlink keep pointing at these exact paths — they just start hitting
 * our server instead of hers. Her sitemap.xml lists 74 URLs; checked against
 * App.tsx on 30 Jul 2026, only 11 resolved here. The other 63 are below.
 *
 * Read AGENTS.md 3a before editing. Two rules that are easy to get wrong:
 *
 * 1. This file is the ONLY source of truth. `deploy/nginx/legacy-redirects.conf`
 *    mirrors it for real 301s at the edge, and the two must agree — a redirect
 *    that exists in one and not the other is a 404 that nobody sees in testing,
 *    because the React fallback quietly covers for the missing nginx rule.
 * 2. Keys are HER slugs, values are OURS. When one of our slugs is renamed to
 *    match hers (as `hotel-amar-inn` was on 31 Jul), DELETE the entry —
 *    leaving it makes the path redirect to itself.
 */

/** Her hotel slug -> ours. Seven of her eight now match and are absent here. */
export const LEGACY_HOTEL_SLUGS: Record<string, string> = {
  // `hotel-amar-inn` used to sit here, mapping to our typo `hotel-amar-in`.
  // The typo was fixed on 31 Jul and our slug is now hers exactly, so the entry
  // was deleted per rule 2 above — keeping it would have redirected
  // /hotels/hotel-amar-inn to itself.
  // We appended the locality; her indexed URL did not.
  'hotel-amby-inn': 'hotel-amby-inn-lajpat-nagar-ii',
}

/** Every hotel slug she has indexed, including the six that match ours. */
export const LEGACY_HOTELS = [
  'hotel-amar-inn',
  'hotel-amby-inn',
  'hotel-cladis-sector-15-noida',
  'hotel-cladis-sector-19-noida',
  'hotel-downtown-east-of-kailash',
  'hotel-downtown-sector-15-noida',
  'hotel-downtown-sector-51-noida',
  'hotel-quadis-sector-51-noida',
]

/**
 * Her banquet slugs -> ours. Hers read `banquet-hall-at-…`, ours
 * `banquets-at-…`, and she has a Cladis 15 venue that we do not, so that one
 * lands on the list page rather than a detail page that does not exist.
 */
export const LEGACY_BANQUET_SLUGS: Record<string, string | null> = {
  'banquet-hall-at-hotel-amby-inn': 'banquets-at-hotel-amby-inn',
  'banquet-hall-at-hotel-downtown-eok': 'banquets-at-hotel-downtown-eok',
  'banquet-hall-at-hotel-downtown-sector-51-noida': 'banquets-at-hotel-downtown-sector-51',
  // No equivalent venue here — send to the list, not to a broken detail page.
  'banquet-hall-at-hotel-cladis-sector-15-noida': null,
  // Not a venue at all on her site; a marketing page under the same prefix.
  'we-offers': null,
}

/** Standalone pages of hers whose path differs from ours, or did not exist. */
export const LEGACY_PATHS: Record<string, string> = {
  '/contactus': '/contact',
  // We have no careers page. Contact is where a careers enquiry should land.
  '/career-at-quadis': '/contact',
}

/**
 * Her room pages are `/<hotel-slug>/<room-slug>` — top level, NOT under
 * `/hotels/`, and one page per room per meal plan (…-deluxe-room,
 * …-with-breakfast, …-with-breakfast-lunch-dinner). That is 52 of the 63 and
 * the bulk of her SEO surface.
 *
 * They collapse to the hotel page, which is where those rooms now live. We
 * deliberately do NOT try to deep-link a room: her room slugs do not map onto
 * our room ids, and guessing would land a guest on the wrong room class — the
 * same failure `roomImages()` had when deluxe and super-deluxe were crossed.
 */
export function legacyRoomTarget(hotelSlug: string): string | null {
  if (!LEGACY_HOTELS.includes(hotelSlug)) return null
  return `/hotels/${LEGACY_HOTEL_SLUGS[hotelSlug] ?? hotelSlug}`
}

export function legacyBanquetTarget(slug: string): string | null {
  if (!(slug in LEGACY_BANQUET_SLUGS)) return null
  const target = LEGACY_BANQUET_SLUGS[slug]
  return target ? `/banquets/${target}` : '/banquets'
}
