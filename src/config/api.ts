// Quadis Hotels API configuration.

/**
 * Where the API lives.
 *
 * Set `VITE_API_URL` at build time and it wins outright. That is the setting
 * that matters in production: the frontend is a static bundle on S3, and the
 * backend is a separate service (Elastic Beanstalk / Render), so a bare `/api`
 * only resolves if something — CloudFront, a reverse proxy — is routing
 * `/api/*` to the backend origin. Without either, every call 404s against the
 * static bucket, which is silent: the hotels list falls back to STATIC_HOTELS
 * and the site looks healthy while registration, enquiries, bookings and
 * payments are all dead.
 *
 * See docs/DEPLOYMENT.md.
 */
const RAW_BASE = import.meta.env.VITE_API_URL as string | undefined

const isLocalHost = (): boolean => {
  if (typeof window === 'undefined') return false
  const { hostname } = window.location
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export const API_BASE_URL: string =
  RAW_BASE?.replace(/\/+$/, '') ||
  // Any local hostname reaches the dev API directly. The previous check was
  // `origin.includes('localhost:517')`, which missed 127.0.0.1, missed a LAN
  // IP (vite runs with host:true), and missed port 5180+.
  (isLocalHost() ? 'http://localhost:3001/api' : '/api')

/** True when we are falling back to same-origin `/api` on a deployed site. */
export const API_IS_SAME_ORIGIN_FALLBACK = !RAW_BASE && !isLocalHost()

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${API_BASE_URL}${cleanEndpoint}`
}

/**
 * A same-origin `/api` on a static host answers with the SPA's index.html and a
 * 200 or 404 — never JSON. Callers that hit that get "Unexpected token '<'",
 * which tells nobody anything. Detect it once and say what is actually wrong.
 */
export function describeApiFailure(status?: number): string {
  if (API_IS_SAME_ORIGIN_FALLBACK) {
    return (
      'The booking service is not reachable. This site was built without ' +
      'VITE_API_URL, so it is looking for the API at /api on this domain. ' +
      'Please contact us on +91 92173 73532 while we look into it.'
    )
  }
  return status
    ? `The booking service returned an error (${status}). Please try again, or call +91 92173 73532.`
    : 'We could not reach the booking service. Please check your connection and try again.'
}

// Surface the misconfiguration once, loudly, at boot rather than as a mystery
// parse error inside whichever form the visitor happens to submit first.
if (API_IS_SAME_ORIGIN_FALLBACK && typeof console !== 'undefined') {
  console.warn(
    '[Quadis] VITE_API_URL was not set at build time, so API calls go to "/api" ' +
    'on this origin. If the backend is not proxied there, sign-in, registration, ' +
    'enquiries, bookings and payments will all fail. See docs/DEPLOYMENT.md.'
  )
}
