import { Navigate, useParams } from 'react-router-dom'
import HotelDetail from '../pages/HotelDetail.tsx'
import BanquetDetail from '../pages/BanquetDetail.tsx'
import NotFound from '../pages/NotFound.tsx'
import {
  LEGACY_BANQUET_SLUGS,
  LEGACY_HOTEL_SLUGS,
  legacyBanquetTarget,
  legacyRoomTarget,
} from '../data/legacyRoutes.ts'

/**
 * Client-side half of the legacy-URL handling. The authoritative half is
 * `deploy/nginx/legacy-redirects.conf`, which issues real 301s — a search
 * engine needs a 301 to move a ranking and a React redirect cannot give it one.
 *
 * This exists anyway for two reasons: it works on the current S3/CloudFront
 * deploy, where there is no nginx to configure, and it means a missing nginx
 * rule degrades to a working page rather than a 404.
 *
 * These are wrappers rather than edits inside the detail pages because both of
 * those call hooks before they could return, and a redirect has to happen
 * before any of that runs. Each wrapper calls exactly one hook and then either
 * redirects or renders the real page, which keeps hook order stable either way.
 *
 * `replace` throughout, so a dead URL does not sit in the guest's back history.
 */

/** `/hotels/:slug` — intercepts the two slugs of hers that differ from ours. */
export function HotelRoute() {
  const { slug } = useParams()
  const current = slug ? LEGACY_HOTEL_SLUGS[slug] : undefined
  if (current) return <Navigate to={`/hotels/${current}`} replace />
  return <HotelDetail />
}

/** `/banquets/:slug` — hers read `banquet-hall-at-…`, ours `banquets-at-…`. */
export function BanquetRoute() {
  const { slug } = useParams()
  if (slug && slug in LEGACY_BANQUET_SLUGS) {
    return <Navigate to={legacyBanquetTarget(slug) as string} replace />
  }
  return <BanquetDetail />
}

/**
 * `/<hotel-slug>/<room-slug>` — her room pages, 52 of the 63 broken URLs.
 *
 * This route is a `/:a/:b` wildcard, so it sees every unmatched two-segment
 * path on the site. Falling through to NotFound when the first segment is not
 * one of her hotels is what stops it redirecting mistyped URLs somewhere
 * plausible-looking. React Router ranks static segments above dynamic ones, so
 * real routes like `/restaurant/outdoor-catering-service` still win over this.
 */
export function LegacyRoomRedirect() {
  const { hotelSlug } = useParams()
  const target = hotelSlug ? legacyRoomTarget(hotelSlug) : null
  if (!target) return <NotFound />
  return <Navigate to={target} replace />
}
