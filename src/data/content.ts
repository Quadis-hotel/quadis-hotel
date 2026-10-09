import { useState, useEffect } from 'react'
import { getApiUrl } from '../config/api'

/**
 * Admin-editable site copy.
 *
 * Every editable string keeps its shipped default in DEFAULT_CONTENT below.
 * Components call `useContent()` and read through `t(key)`, which returns the
 * admin's override when one exists and the default otherwise.
 *
 * That ordering matters: the API being down, unmigrated, or simply never
 * written to must render exactly the site as shipped. Editable copy should
 * never be able to blank a headline.
 *
 * To make a new string editable: add it here with its current text, then swap
 * the literal in the component for `t('its.key')`. Nothing else is needed —
 * the admin panel lists whatever is in this map.
 */

export interface ContentField {
  /** Grouping shown as a heading in the admin panel. */
  section: string
  /** Human label in the admin panel. */
  label: string
  /** The text the site ships with, used whenever there is no override. */
  value: string
  /** Renders as a textarea rather than a single-line input. */
  multiline?: boolean
}

export const DEFAULT_CONTENT: Record<string, ContentField> = {
  // 'home.hero.overline' and 'home.hero.title' were removed in July 2026: the
  // client took the copy off the hero video, leaving only the search bar. A key
  // with nothing reading it renders an admin field that silently does nothing,
  // so it comes out of the map rather than staying as dead weight. Any override
  // already stored against these keys is simply ignored.
  // 'home.stayPromise.title' was removed on 28 Jul 2026 for the same reason as
  // the hero keys above. Nothing ever read it, and it could not be wired
  // honestly: the heading it named renders as styled markup — "Great *sleep.*
  // Refreshing *showers.*" — so a plain-string override would have silently
  // stripped the typography the client is paying for. A field that damages the
  // design when used is worse than no field.
  'corporate.intro.title': {
    section: 'Corporate booking',
    label: 'Section heading',
    value: 'Dependable stays for your teams',
  },
  'corporate.intro.body': {
    section: 'Corporate booking',
    label: 'Intro paragraph',
    multiline: true,
    value:
      'Quadis partners with businesses across Delhi NCR to make corporate travel effortless. Our properties sit in prime business districts, with fast Wi-Fi, GST invoicing and flexible terms designed around how teams actually travel.',
  },
  'contact.intro': {
    section: 'Contact',
    label: 'Intro paragraph',
    multiline: true,
    value: 'Tell us what you need and our team will come back to you shortly.',
  },
  // Default corrected 28 Jul 2026 to the text the footer actually renders. It
  // previously held different wording, so the admin field showed the client a
  // "current value" that appeared nowhere on their site.
  'footer.tagline': {
    section: 'Footer',
    label: 'About blurb',
    multiline: true,
    value:
      'Quadis Services Private Limited is one of the leading hospitality brands in Delhi NCR, offering premium hotel stays, elegant banquet halls, and quality restaurant services.',
  },
  // 11:00 AM, not the 2:00 PM this shipped with: the client corrected it on
  // 5 Aug 2026. Check-in and check-out are deliberately the same hour — the
  // group runs a same-day changeover, so this is not a typo for 1:00 PM.
  'policy.checkIn': {
    section: 'Policies',
    label: 'Check-in time',
    value: '11:00 AM',
  },
  'policy.checkOut': {
    section: 'Policies',
    label: 'Check-out time',
    value: '11:00 AM',
  },
  'policy.cancellation': {
    section: 'Policies',
    label: 'Cancellation policy',
    multiline: true,
    value: 'Free cancellation up to 24 hours before check-in. Contact the property directly to cancel.',
  },

  /* ---------------------------------------------------------------------
   * Landing page headings — added 28 Jul 2026 at the client's request:
   * "sare landing pages ka content and heading editable ho skta h na".
   *
   * Every default below is copied verbatim from what the page rendered
   * before it was wired, so an untouched database shows the identical site.
   *
   * Deliberately NOT included, because a plain-text field cannot represent
   * them without silently damaging the page:
   *   - Home "Great sleep. Refreshing showers." — styled markup inside
   *   - Gallery hero sub and count heading — interpolate live counts
   *   - About "we operate nine properties…" — interpolates PROPERTY_COUNT
   *   - Virtual tour stop titles — come from virtualTourData, not copy
   * ------------------------------------------------------------------- */

  // --- Home ---
  'home.properties.overline': { section: 'Home', label: 'Properties — overline', value: 'OUR PROPERTIES' },
  'home.properties.title': { section: 'Home', label: 'Properties — heading', value: 'Best Hotels in Delhi NCR' },
  'home.roadAhead.overline': { section: 'Home', label: 'Road ahead — overline', value: 'THE ROAD AHEAD' },
  'home.roadAhead.title': { section: 'Home', label: 'Road ahead — heading', value: 'Beyond hospitality' },
  'home.ecosystem.overline': { section: 'Home', label: 'Ecosystem — overline', value: 'THE QUADIS ECOSYSTEM' },
  'home.ecosystem.title': { section: 'Home', label: 'Ecosystem — heading', value: 'A Vision Beyond Room Count' },

  // --- Shared sections (appear on more than one page) ---
  'offerings.overline': { section: 'Shared sections', label: 'Our offerings — overline', value: 'WHAT WE PROVIDE' },
  'offerings.title': { section: 'Shared sections', label: 'Our offerings — heading', value: 'Our Offerings' },
  'destinations.overline': { section: 'Shared sections', label: 'Destinations — overline', value: 'WHERE WE ARE' },
  'destinations.title': { section: 'Shared sections', label: 'Destinations — heading', value: 'Destinations For You' },
  'experiences.overline': { section: 'Shared sections', label: 'Experiences — overline', value: 'WE OFFER' },
  'experiences.title': { section: 'Shared sections', label: 'Experiences — heading', value: 'Experiences by Quadis' },
  'upcoming.overline': { section: 'Shared sections', label: 'Upcoming cities — overline', value: 'UPCOMING' },
  'upcoming.title': { section: 'Shared sections', label: 'Upcoming cities — heading', value: 'Expanding across North India' },

  // --- About ---
  'about.hero.title': { section: 'About page', label: 'Hero heading', value: 'About Us' },
  'about.hero.sub': {
    section: 'About page',
    label: 'Hero subheading',
    multiline: true,
    value: 'Quadis Services Private Limited — A tradition of considered comfort since 2017.',
  },
  'about.story.overline': { section: 'About page', label: 'Story — overline', value: 'QUADIS HOTELS GROUP' },
  'about.story.title': { section: 'About page', label: 'Story — heading', value: 'Comfort, made effortless' },
  'about.leader.overline': { section: 'About page', label: 'Leadership — overline', value: 'SERVICE & SATISFACTION LEADER' },
  'about.leader.title': { section: 'About page', label: 'Leadership — heading', value: 'Why Quadis is No. 1 in Delhi NCR' },
  'about.welfare.overline': { section: 'About page', label: 'Welfare — overline', value: 'ETHICAL HOSPITALITY' },
  'about.welfare.title': { section: 'About page', label: 'Welfare — heading', value: 'Employee & Vendor Welfare' },
  'about.future.overline': { section: 'About page', label: 'Future — overline', value: 'LOOKING AHEAD' },
  'about.future.title': { section: 'About page', label: 'Future — heading', value: 'Future Horizons of Luxury' },
  'about.values.overline': { section: 'About page', label: 'Values — overline', value: 'WHAT WE STAND FOR' },
  'about.values.title': { section: 'About page', label: 'Values — heading', value: 'A considered way of hosting' },

  // --- Hotels list ---
  'hotels.hero.overline': { section: 'Hotels page', label: 'Hero overline', value: 'STAY WITH QUADIS' },
  'hotels.hero.title': { section: 'Hotels page', label: 'Hero heading', value: 'Our Hotels' },

  // --- Banquets ---
  'banquets.hero.overline': { section: 'Banquets page', label: 'Hero overline', value: 'CELEBRATE WITH QUADIS' },
  'banquets.hero.title': { section: 'Banquets page', label: 'Hero heading', value: 'Banquets by Quadis' },
  'banquets.intro.overline': { section: 'Banquets page', label: 'Venues — overline', value: 'OUR VENUES' },
  'banquets.intro.title': { section: 'Banquets page', label: 'Venues — heading', value: 'Elegant halls for every occasion' },
  'banquets.intro.body': {
    section: 'Banquets page',
    label: 'Venues — intro paragraph',
    multiline: true,
    value:
      'From intimate receptions to grand weddings, our banquet halls across Delhi NCR pair refined spaces with seamless catering and warm, attentive coordination.',
  },
  'banquets.cta.title': { section: 'Banquets page', label: 'Bottom banner heading', value: 'Planning an occasion?' },

  // --- Corporate (intro keys are above, with the originals) ---
  'corporate.hero.overline': { section: 'Corporate booking', label: 'Hero overline', value: 'FOR BUSINESS TRAVEL' },
  'corporate.hero.title': { section: 'Corporate booking', label: 'Hero heading', value: 'Corporate Hotel Booking' },
  'corporate.why.overline': { section: 'Corporate booking', label: 'Why Quadis — overline', value: 'WHY QUADIS FOR BUSINESS' },
  'corporate.why.title': { section: 'Corporate booking', label: 'Why Quadis — heading', value: 'Built for corporate travel' },
  'corporate.rfp.overline': { section: 'Corporate booking', label: 'Proposal form — overline', value: 'REQUEST A PROPOSAL' },
  'corporate.rfp.title': { section: 'Corporate booking', label: 'Proposal form — heading', value: 'Request corporate rates' },

  // --- Restaurant ---
  'restaurant.hero.overline': { section: 'Restaurant page', label: 'Hero overline', value: 'TASTE THE QUADIS WAY' },
  'restaurant.hero.title': { section: 'Restaurant page', label: 'Hero heading', value: 'Dining by Quadis' },
  'restaurant.offer.overline': { section: 'Restaurant page', label: 'Offerings — overline', value: "WHAT'S ON OFFER" },
  'restaurant.offer.title': { section: 'Restaurant page', label: 'Offerings — heading', value: 'Considered food, warm service' },
  'restaurant.cta.title': { section: 'Restaurant page', label: 'Bottom banner heading', value: 'Hosting something special?' },

  // --- Gallery ---
  'gallery.hero.title': { section: 'Gallery page', label: 'Hero heading', value: 'Photo Gallery' },
  'gallery.explore.overline': { section: 'Gallery page', label: 'Explore — overline', value: 'EXPLORE OUR SPACES' },

  // --- Virtual tour ---
  'tour.hero.title': { section: 'Virtual tour', label: 'Hero heading', value: 'The Quadis Virtual Tour' },
  'tour.hero.sub': {
    section: 'Virtual tour',
    label: 'Hero subheading',
    multiline: true,
    value:
      'Immersive spatial storytelling. Explore our calm lobbies, soundproof transit suites, and grand banquets with interactive discovery.',
  },

  // --- Cancellation policy page ---
  'cancellation.title': { section: 'Cancellation page', label: 'Page heading', value: 'Cancellation & Refund Policy' },
  'cancellation.s1': { section: 'Cancellation page', label: 'Section 1 heading', value: 'Booking Confirmation' },
  'cancellation.s2': { section: 'Cancellation page', label: 'Section 2 heading', value: 'Cancellation Policy' },
  'cancellation.s3': { section: 'Cancellation page', label: 'Section 3 heading', value: 'Refund Policy' },
  'cancellation.s4': { section: 'Cancellation page', label: 'Section 4 heading', value: 'Modification of Booking' },
  'cancellation.s5': { section: 'Cancellation page', label: 'Section 5 heading', value: 'Early Check-Out' },
  'cancellation.s6': { section: 'Cancellation page', label: 'Section 6 heading', value: 'Force Majeure' },
  'cancellation.s7': { section: 'Cancellation page', label: 'Section 7 heading', value: 'Contact Us' },
}

export type ContentMap = Record<string, string>

/** Module-level cache so every component shares one fetch. */
let cached: ContentMap | null = null
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function load(): void {
  if (cached || inFlight) return
  inFlight = fetch(getApiUrl('content'))
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      cached = json?.success && json.data && typeof json.data === 'object' ? json.data : {}
      listeners.forEach((l) => l())
    })
    .catch(() => {
      // Editable copy is an enhancement. A failure here means the shipped
      // defaults stand — never a blank section.
      cached = {}
    })
    .finally(() => {
      inFlight = null
    })
}

/** Invalidates the cache after an admin save, so the site picks edits up. */
export function refreshContent(): void {
  cached = null
  inFlight = null
  load()
}

export interface UseContent {
  /** Resolved text for a key: the admin override, else the shipped default. */
  t: (key: keyof typeof DEFAULT_CONTENT | string) => string
  overrides: ContentMap
}

export function useContent(): UseContent {
  const [overrides, setOverrides] = useState<ContentMap>(cached ?? {})

  useEffect(() => {
    if (cached) {
      setOverrides(cached)
      return
    }
    load()
    const listener = () => { if (cached) setOverrides(cached) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  const t = (key: string): string => {
    const override = overrides[key]
    if (typeof override === 'string' && override.trim() !== '') return override
    return DEFAULT_CONTENT[key]?.value ?? ''
  }

  return { t, overrides }
}
