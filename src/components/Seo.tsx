import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  BRAND_LEGAL_NAME,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_ORIGIN,
  type SeoMeta,
} from '../data/seo.ts'

/**
 * Per-route page metadata.
 *
 * Every route used to inherit the single <title> in index.html, so a crawler
 * saw seventeen URLs all announcing themselves as "Quadis Hotels — Refined
 * Stays in Delhi NCR". For a group whose guests arrive by searching "hotel in
 * sector 51 noida", that is the difference between nine findable properties and
 * one.
 *
 * Written against the DOM directly rather than pulling in react-helmet: this is
 * a client-rendered SPA either way, so a helper library would add a dependency
 * without adding capability.
 *
 * The copy itself lives in src/data/seo.ts, not in the page components. That is
 * the answer to the client's SEO person (WhatsApp, 4 Aug 2026): "same he code
 * hr landing page me h" — there is now one file to open and one place to edit,
 * and hotel/banquet pages template their meta out of src/data/hotels.ts so a
 * tenth property arrives correctly described with no code change at all.
 *
 * ===========================================================================
 * NOTE — THE LIMITATION THIS COMPONENT CANNOT FIX. READ BEFORE PROMISING THE
 * CLIENT ANYTHING.
 *
 * This sets tags AFTER React mounts. There is no prerender or SSR step in the
 * build (vite.config.ts is a plain SPA build; vercel.json and render.yaml both
 * rewrite every path to /index.html), so `curl` or "view source" on ANY of the
 * 25 URLs returns the same static head. Googlebot renders JavaScript and will
 * see what we write here. Bing is inconsistent about it, and the social
 * scrapers — WhatsApp, Facebook, LinkedIn, X, Slack — never execute JS at all,
 * so every link the client shares previews with the index.html copy regardless
 * of which page it points at.
 *
 * Per-route <Seo> props are necessary but NOT sufficient. Prerendering the
 * static routes at build time is the fix; recorded with an estimate in the
 * 5 Aug 2026 SEO handover.
 * ===========================================================================
 */

// Re-exported so existing importers keep working; both now live in data/seo.ts
// alongside the copy that uses them.
export { SITE_NAME, SITE_ORIGIN }

export type SeoProps = SeoMeta

/**
 * Marks the tags this component created, so they can be swept when a later
 * route stops emitting them. Tags already present in index.html (the static
 * description) are reused in place and never carry this attribute, so they are
 * never removed — only overwritten.
 */
const MANAGED_ATTR = 'data-seo'

/** Brand lockups that may legitimately end a title. See `brandedTitle` below. */
const BRAND_LOCKUPS = [BRAND_LEGAL_NAME, SITE_NAME] as const

/**
 * Titles carry the brand once, at the end, so the distinctive words come first
 * — search results and browser tabs both truncate from the right.
 *
 * The check is "does it already END with a brand lockup", not "does it contain
 * the string 'Quadis Hotels'", for two reasons:
 *
 *  1. The client's own home-page title (feedback PDF, 5 Aug 2026) ends with
 *     "Quadis Group of Hotels". A `.includes('Quadis Hotels')` test does not
 *     match that string, so the old logic appended a second brand and shipped
 *     "… | Quadis Group of Hotels | Quadis Hotels".
 *  2. Three properties have "Quadis" in their NAME (Hotel Quadis Sector 51,
 *     Hotel Quadis Central). A loose contains-test would have silently dropped
 *     the brand suffix from those pages and kept it on the other six.
 */
function brandedTitle(title: string): string {
  const trimmed = title.trim()
  const alreadyBranded = BRAND_LOCKUPS.some((lockup) => trimmed.endsWith(lockup))
  return alreadyBranded ? trimmed : `${trimmed} | ${SITE_NAME}`
}

/** Sets, or creates then sets, a <meta> tag keyed by name or property. */
function setMeta(
  written: Set<string>,
  keyAttr: 'name' | 'property',
  key: string,
  value: string
): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${keyAttr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(keyAttr, key)
    el.setAttribute(MANAGED_ATTR, '')
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
  written.add(`${keyAttr}:${key}`)
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute(MANAGED_ATTR, '')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Removes managed tags that this render did not write.
 *
 * Every tag below is written on every route, so today this sweep removes
 * nothing — which is the point of checking it. The failure it guards against is
 * the one that is invisible until it is live: a tag emitted conditionally by
 * one page (an og:video on the virtual tour, say) surviving the client-side
 * navigation to a page that has nothing to do with it. Tags are always REPLACED
 * in place rather than appended — setMeta looks the tag up by key first — so
 * duplicates cannot accumulate either.
 */
function sweepStale(written: Set<string>): void {
  const managed = document.head.querySelectorAll<HTMLMetaElement>(`meta[${MANAGED_ATTR}]`)
  managed.forEach((el) => {
    const keyAttr = el.hasAttribute('name') ? 'name' : 'property'
    const key = el.getAttribute(keyAttr)
    if (key && !written.has(`${keyAttr}:${key}`)) el.remove()
  })
}

export default function Seo({ title, description, image, ogType, noIndex, canonicalPath }: SeoProps) {
  const { pathname } = useLocation()

  useEffect(() => {
    const written = new Set<string>()

    const fullTitle = brandedTitle(title)
    document.title = fullTitle

    const canonical = `${SITE_ORIGIN}${canonicalPath ?? pathname}`
    // Open Graph requires an absolute URL. Page-supplied images arrive as
    // build-hashed asset paths (/assets/hero-a1b2c3.webp), so they need the
    // origin prefixed; an already-absolute URL is left alone.
    const previewImage = image
      ? image.startsWith('http')
        ? image
        : `${SITE_ORIGIN}${image}`
      : `${SITE_ORIGIN}${DEFAULT_OG_IMAGE}`

    setMeta(written, 'name', 'description', description)
    setLink('canonical', canonical)

    // noindex must be written on every route, not only the private ones —
    // otherwise the tag set on /account survives the client-side navigation to
    // /hotels and quietly delists a page we want indexed.
    setMeta(written, 'name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow')

    setMeta(written, 'property', 'og:title', fullTitle)
    setMeta(written, 'property', 'og:description', description)
    setMeta(written, 'property', 'og:type', ogType ?? 'website')
    setMeta(written, 'property', 'og:url', canonical)
    setMeta(written, 'property', 'og:image', previewImage)
    setMeta(written, 'property', 'og:image:alt', title)
    setMeta(written, 'property', 'og:site_name', SITE_NAME)
    // en_IN, not en_US: the whole estate is Delhi NCR and every rate on the
    // site is quoted in rupees.
    setMeta(written, 'property', 'og:locale', 'en_IN')

    setMeta(written, 'name', 'twitter:card', 'summary_large_image')
    setMeta(written, 'name', 'twitter:title', fullTitle)
    setMeta(written, 'name', 'twitter:description', description)
    setMeta(written, 'name', 'twitter:image', previewImage)
    setMeta(written, 'name', 'twitter:image:alt', title)
    // X reads og:url for the card link, but Slack and a few link unfurlers
    // prefer the twitter: namespace when it is present, and disagreeing URLs
    // between the two produce previews that point at the wrong page.
    setMeta(written, 'name', 'twitter:url', canonical)

    sweepStale(written)
  }, [title, description, image, ogType, noIndex, canonicalPath, pathname])

  return null
}
