/**
 * Emits public/sitemap.xml and public/robots.txt.
 *
 * Slugs are read out of src/data/hotels.ts rather than restated here, so adding
 * a tenth property cannot leave it unlisted. The file is parsed as text on
 * purpose: importing it would pull in React and src/config/api.ts, which reads
 * `import.meta.env` at module scope and throws outside Vite.
 *
 * Runs as the `prebuild` step, so `npm run build` always ships a current map.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/*
 * www, not the bare apex. The client's live site is canonical on
 * https://www.quadishotels.com — the apex 301s to it on both HTTP and HTTPS —
 * and we cut over onto that same domain. Emitting apex URLs would point every
 * entry in the sitemap at a redirect, and split signals between two hostnames
 * for the URLs that already rank. Verified off the live host 30 Jul 2026; see
 * AGENTS.md 3a.
 */
const ORIGIN = 'https://www.quadishotels.com'

const hotelsSrc = readFileSync(join(root, 'src/data/hotels.ts'), 'utf8')

/** Every `slug: '...'` inside the named export's array literal. */
function slugsFrom(exportName) {
  const start = hotelsSrc.indexOf(`export const ${exportName}`)
  if (start === -1) throw new Error(`generate-sitemap: ${exportName} not found in hotels.ts`)
  const end = hotelsSrc.indexOf('\n]', start)
  if (end === -1) throw new Error(`generate-sitemap: could not find the end of ${exportName}`)
  const block = hotelsSrc.slice(start, end)
  return [...block.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
}

const hotelSlugs = slugsFrom('STATIC_HOTELS')
const banquetSlugs = slugsFrom('BANQUETS')

// A silently empty sitemap is worse than a failed build — it tells Google the
// site has no hotel pages at all.
if (!hotelSlugs.length) throw new Error('generate-sitemap: no hotel slugs found')
if (!banquetSlugs.length) throw new Error('generate-sitemap: no banquet slugs found')

/**
 * Static routes worth indexing, with crawl priority — read out of
 * src/data/seo.ts rather than restated here.
 *
 * WHY, 5 Aug 2026: this used to be a hand-maintained list sitting next to a
 * separate hand-maintained list of page metadata in the page components. Two
 * lists describing the same set of URLs is two lists that drift, and the drift
 * is invisible in both directions — a route can be given a title and
 * description and never be submitted to Google, or be submitted with nothing
 * but the index.html default to show for itself. Now there is one list. A route
 * added to STATIC_PAGE_SEO with a `sitemapPriority` appears here on the next
 * build; one with `sitemapPriority: null` (/login, /register, /account, and the
 * 404) is deliberately withheld, matching the Disallow rules in robots.txt.
 *
 * Parsed as text for the same reason hotels.ts is: importing it would pull in
 * React and src/config/api.ts, which reads `import.meta.env` at module scope
 * and throws outside Vite.
 */
const seoSrc = readFileSync(join(root, 'src/data/seo.ts'), 'utf8')

function staticRoutesFromSeo() {
  const start = seoSrc.indexOf('const STATIC_PAGE_SEO')
  if (start === -1) throw new Error('generate-sitemap: STATIC_PAGE_SEO not found in seo.ts')
  const end = seoSrc.indexOf('\n} satisfies', start)
  if (end === -1) throw new Error('generate-sitemap: could not find the end of STATIC_PAGE_SEO')
  const block = seoSrc.slice(start, end)

  // Entry keys are the only thing indented by exactly two spaces and opening a
  // brace, so this cannot pick up a path mentioned inside a doc comment.
  const entries = [...block.matchAll(/^ {2}'(\/[^']*)': \{$/gm)]
  if (!entries.length) throw new Error('generate-sitemap: no route entries parsed out of STATIC_PAGE_SEO')

  const routes = []
  for (let i = 0; i < entries.length; i++) {
    const path = entries[i][1]
    const from = entries[i].index
    const to = i + 1 < entries.length ? entries[i + 1].index : block.length
    const body = block.slice(from, to)

    const priority = body.match(/sitemapPriority:\s*'([\d.]+)'/)
    const withheld = /sitemapPriority:\s*null/.test(body)

    // A new entry that forgot the field altogether is a bug, not a default:
    // silently omitting it from the sitemap is exactly the drift this is here
    // to prevent, and silently including it would submit /login.
    if (!priority && !withheld) {
      throw new Error(`generate-sitemap: '${path}' in seo.ts has no sitemapPriority (use null to withhold it)`)
    }
    if (priority) routes.push([path, priority[1]])
  }
  return routes
}

const STATIC_ROUTES = staticRoutesFromSeo()

/*
 * Sanity floor. The three policy pages carry low priority but must be listed:
 * Razorpay requires them reachable before it approves a merchant account, and
 * the client's existing site has /privacy-policy and /terms-and-conditions
 * indexed today — we move onto the same domain, so dropping them from the
 * sitemap would retire two URLs that already rank. If the parse above ever
 * silently matches fewer entries than there are real pages, this catches it.
 */
for (const required of ['/', '/hotels', '/banquets', '/privacy-policy', '/terms-and-conditions']) {
  if (!STATIC_ROUTES.some(([path]) => path === required)) {
    throw new Error(`generate-sitemap: ${required} is missing from the parsed routes`)
  }
}

const urls = [
  ...STATIC_ROUTES,
  // The hotel pages are the ones guests search for by name and area, so they
  // rank alongside /hotels rather than below it.
  ...hotelSlugs.map((s) => [`/hotels/${s}`, '0.9']),
  ...banquetSlugs.map((s) => [`/banquets/${s}`, '0.7']),
]

// Date only, no clock: a timestamp that changes on every build tells crawlers
// each page was edited when only the deploy moved.
const lastmod = new Date().toISOString().slice(0, 10)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ([path, priority]) =>
      `  <url>\n    <loc>${ORIGIN}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`

const robots = `User-agent: *
Allow: /

# Nothing a searcher wants, and /admin must never be indexed.
Disallow: /admin
Disallow: /account
Disallow: /login
Disallow: /register

Sitemap: ${ORIGIN}/sitemap.xml
`

writeFileSync(join(root, 'public/sitemap.xml'), sitemap)
writeFileSync(join(root, 'public/robots.txt'), robots)

console.log(
  `🗺️  sitemap.xml: ${urls.length} URLs ` +
  `(${STATIC_ROUTES.length} static, ${hotelSlugs.length} hotels, ${banquetSlugs.length} banquets)`
)
