// Photography resolver.
//
// Per spec §5 + readme-3 §3: the repo's Reference-images/ are screenshots for
// layout/content reference ONLY and are never shipped. Real client photography
// lands under public/images/** in EXACTLY this structure (no renaming, no code
// edits) and is picked up on the next build:
//   home/hero.jpg            about/story.jpg            auth.jpg
//   hotels/<slug>/hero.jpg + 01..04.jpg
//   banquets/<slug>/hero.jpg + 01..03.jpg
//   restaurant/hero.jpg + 01..04.jpg
// Until files exist, every group is empty and each slot renders a --bg-warm
// placeholder with the correct aspect-ratio reserved → zero layout shift.
const files = import.meta.glob('/public/images/**/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

type Entry = { url: string; name: string }
const buckets: Record<string, Entry[]> = {}

for (const [path, url] of Object.entries(files)) {
  const rel = path.split('/public/images/')[1]
  if (!rel) continue
  const slash = rel.lastIndexOf('/')
  const dir = slash === -1 ? '' : rel.slice(0, slash)
  const name = slash === -1 ? rel : rel.slice(slash + 1)
  const cleanUrl = typeof url === 'string' ? url.replace(/^\/public\//, '/') : url
  ;(buckets[dir] ??= []).push({ url: cleanUrl, name })
}

// hero.jpg leads; numbered gallery files follow in ascending order.
const rank = (name: string): number => (name.toLowerCase().startsWith('hero') ? -1 : 0)
/**
 * Deduplicate by built URL, not by filename.
 *
 * The client sends the same photograph under several names — the 29 Jul gallery
 * zip alone had nine — and some images are legitimately filed twice for
 * different purposes (experiences/hotels-in-delhi-ncr.webp and hotels/hero.webp
 * are the same shot, and both are referenced by name, so neither can be
 * deleted). Vite emits ONE hashed asset per set of identical bytes, so those
 * duplicates arrive here sharing a URL and would otherwise render as repeated
 * tiles: the same room twice in a gallery, or Quadis 51's facade twice on its
 * own page, since facade-2.webp and hero.webp are byte-identical.
 *
 * Deduping on the URL fixes every case at once without deleting a file that
 * something else resolves by name. Note this only bites in a production build —
 * `vite dev` serves real paths, so the URLs differ and duplicates still show.
 */
const uniq = (urls: string[]): string[] => [...new Set(urls)]

const groups: Record<string, string[]> = {}
for (const [dir, entries] of Object.entries(buckets)) {
  entries.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true }))
  groups[dir] = uniq(entries.map((e) => e.url))
}

const at = (key: string): string[] => groups[key] ?? []

/**
 * Like `at`, but drops design assets — use it for anything that renders as a
 * photo gallery.
 *
 * `isSectionArtwork` only guards `galleryAll`, so a banner dropped into a folder
 * that doubles as a gallery source still surfaced. restaurant/ is exactly that:
 * it holds hero.webp *and* the client's 2.702:1 landing-page banner, and
 * `restaurantImages()` fed both to the offer cards. Safe here because buckets
 * are sorted in place in the loop above, so order is preserved.
 */
const atPhotos = (key: string): string[] =>
  uniq((buckets[key] ?? []).filter((e) => !isSectionArtwork(e.name)).map((e) => e.url))

/**
 * One image from a folder, addressed by its SOURCE filename.
 *
 * Match on `entry.name` — the name on disk — and never on the emitted URL.
 * Vite deduplicates byte-identical assets: it emits a single hashed file and
 * points every importer at it, under whichever source name it processed first.
 * public/images/experiences/hotels-in-delhi-ncr.png is byte-identical to
 * public/images/hotels/hero.png, so its built URL is /assets/hero-<hash>.png —
 * a URL-substring match for "hotels-in-delhi-ncr" finds nothing and silently
 * falls back to some unrelated photo.
 *
 * The trap is that this only bites in a production build. `vite dev` serves the
 * real paths, so a URL match looks correct right up until it is deployed.
 */
const namedIn = (dir: string, file: string): string | undefined =>
  buckets[dir]?.find((e) => e.name.toLowerCase().startsWith(file.toLowerCase()))?.url

// Categorized collections from public/images/**
export const galleryDeluxe: string[] = at('rooms/deluxe')
export const gallerySuperior: string[] = at('rooms/superior')
export const galleryRoyal: string[] = at('rooms/royal')
export const galleryFacade: string[] = at('facade')
export const galleryDining: string[] = at('restaurant/dining')

// Section artwork — page banners and the Airlines/Homes concept renders. These
// are design assets, not property photography, so they must never surface in the
// "Moments of Calm & Comfort" gallery.
// `tier-*` covers public/images/tiers/. Two of the three are renders of the
// Select and Experience formats, which do not exist yet — a guest browsing the
// gallery must not meet them as though they were properties they could book.
const SECTION_ARTWORK = ['banner', 'service-leadership', 'employee-vendor-welfare', 'quadis-airlines', 'quadis-homes', 'tier-']
const isSectionArtwork = (name: string): boolean =>
  SECTION_ARTWORK.some((slug) => name.toLowerCase().startsWith(slug))

// Master gallery list — a true superset of the category tabs.
//
// This used to drop every .png, so "All" showed 58 of 178 photos while the
// category tabs showed all of them: a guest could see a room under "Deluxe
// Rooms" that "All" hid. Only section artwork is excluded, since that is design
// material rather than photography.
export const galleryAll: string[] = uniq(
  Object.values(buckets)
    .flat()
    .filter((e) => !isSectionArtwork(e.name))
    .map((e) => e.url)
)

const allPhotos = galleryAll

const deluxePhotos = galleryDeluxe.length ? galleryDeluxe : allPhotos
const superiorPhotos = gallerySuperior.length ? gallerySuperior : allPhotos
const suitePhotos = galleryRoyal.length ? galleryRoyal : allPhotos

// Simple deterministic hash for slug-to-photo indexing
function hashSlug(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Uploaded photography wins over anything bundled.
 *
 * `hotelImages(slug)` below reads the build-time glob, which is fixed at
 * compile time and is why changing a photo used to need a redeploy. Once a
 * hotel uploads its own set from the admin panel, the API returns it on the
 * property record and this takes over — completely, not merged, because the
 * whole point is that a property stops showing other properties' rooms.
 *
 * Falls through to the bundled set when nothing has been uploaded, so a
 * property nobody has touched looks exactly as it does today.
 */
export const imagesForHotel = (hotel: { slug: string; images?: Array<{ url: string }> }): string[] => {
  const uploaded = hotel.images?.map((i) => i.url).filter(Boolean) ?? []
  return uploaded.length ? uploaded : hotelImages(hotel.slug)
}

// Per-entity photo sets (arrays of real photo URLs with smart production fallbacks).
export const hotelImages = (slug: string): string[] => {
  const explicit = at(`hotels/${slug}`)
  const pool = galleryFacade.length ? galleryFacade : (allPhotos.length ? allPhotos : ['/images/home/hero.webp'])
  const idx = hashSlug(slug)

  // Fallback 5 distinct photos from available pool
  const fallbacks = [
    pool[idx % pool.length] ?? pool[0]!,
    pool[(idx + 2) % pool.length] ?? pool[0]!,
    pool[(idx + 4) % pool.length] ?? pool[0]!,
    pool[(idx + 6) % pool.length] ?? pool[0]!,
    pool[(idx + 8) % pool.length] ?? pool[0]!,
  ]

  if (!explicit.length) return fallbacks

  // If explicit set exists but has fewer than 5 photos, pad with fallbacks so gallery thumbnails are never empty
  const combined = [...explicit]
  let fIdx = 0
  while (combined.length < 5 && fIdx < fallbacks.length) {
    if (!combined.includes(fallbacks[fIdx]!)) {
      combined.push(fallbacks[fIdx]!)
    }
    fIdx++
  }
  return combined
}

export const roomImages = (hotelSlug: string, roomId: string): string[] => {
  // Check explicit subdirectories first
  const sub = at(`hotels/${hotelSlug}/rooms/${roomId}`)
  if (sub.length) return sub
  const sub2 = at(`hotels/${hotelSlug}/${roomId}`)
  if (sub2.length) return sub2

  // Fallback 1: match the room slug against flat hotel filenames.
  //
  // Whole slug first, loose keywords only if that finds nothing. The room slugs
  // overlap, and the loose pass alone got it backwards: `super-deluxe` splits to
  // ['super','deluxe'] and `.some()` matched 01-deluxe-room.webp, while
  // `deluxe-room` splits to ['deluxe'] and matched 02-super-deluxe.webp. Each
  // category served the other's photograph — a guest booking a Deluxe Room was
  // shown the Super Deluxe, and the cheaper room was advertised with the dearer
  // one's picture.
  //
  // Kept as a fallback rather than a replacement because the older per-hotel
  // sets are named the other way round (room-deluxe.webp, 05-superior-room.webp)
  // and only the loose pass finds those.
  const all = at(`hotels/${hotelSlug}`)
  if (all.length) {
    const slugMatch = all.filter((url) => url.toLowerCase().includes(roomId.toLowerCase()))
    if (slugMatch.length) return slugMatch

    const keywords = roomId.split('-').filter((k) => k !== 'room' && k.length > 2)
    const matched = all.filter((url) => {
      const lower = url.toLowerCase()
      return keywords.some((k) => lower.includes(k))
    })
    if (matched.length) return matched
  }

  // Fallback 2: fallback room tier photos directly from categorized room collections
  const idx = hashSlug(`${hotelSlug}-${roomId}`)
  if (roomId.includes('suite') || roomId.includes('royal')) {
    const pool = suitePhotos
    return [
      pool[idx % pool.length] ?? pool[0]!,
      pool[(idx + 1) % pool.length] ?? pool[0]!,
      pool[(idx + 2) % pool.length] ?? pool[0]!,
      pool[(idx + 3) % pool.length] ?? pool[0]!,
    ]
  }
  if (roomId.includes('superior')) {
    const pool = superiorPhotos
    return [
      pool[idx % pool.length] ?? pool[0]!,
      pool[(idx + 1) % pool.length] ?? pool[0]!,
      pool[(idx + 2) % pool.length] ?? pool[0]!,
      pool[(idx + 3) % pool.length] ?? pool[0]!,
    ]
  }
  const pool = deluxePhotos
  return [
    pool[idx % pool.length] ?? pool[0]!,
    pool[(idx + 1) % pool.length] ?? pool[0]!,
    pool[(idx + 2) % pool.length] ?? pool[0]!,
    pool[(idx + 3) % pool.length] ?? pool[0]!,
  ]
}

export const banquetImages = (slug: string): string[] => {
  const explicit = at(`banquets/${slug}`)
  if (explicit.length) return explicit
  const pool = galleryDining.length ? galleryDining : (allPhotos.length ? allPhotos : ['/images/home/hero.webp'])
  const idx = hashSlug(slug)
  return [
    pool[(idx + 1) % pool.length] ?? pool[0]!,
    pool[(idx + 3) % pool.length] ?? pool[0]!,
    pool[(idx + 4) % pool.length] ?? pool[0]!,
  ]
}

export const restaurantImages = (): string[] => {
  const explicit = atPhotos('restaurant')
  if (explicit.length) return explicit
  const pool = galleryDining.length ? galleryDining : (allPhotos.length ? allPhotos : ['/images/home/hero.webp'])
  return [pool[0]!, pool[1 % pool.length] ?? pool[0]!, pool[2 % pool.length] ?? pool[0]!]
}

export const cateringImages = (): string[] => {
  const dedicated = at('restaurant/catering')
  if (dedicated.length) return dedicated
  return restaurantImages()
}

// Site-level hero/section photo sets.
export const homeImages: string[] = at('home').filter((url) => !url.toLowerCase().endsWith('.png'))
export const aboutImages: string[] = at('about').length ? at('about') : homeImages

/**
 * Client-supplied About page artwork, addressed by name rather than by index
 * into `aboutImages` — a glob index silently repoints at a different photo the
 * moment a file is added to the folder.
 */
const aboutNamed = (file: string, fallback: string[]): string =>
  namedIn('about', file) ?? fallback[0] ?? homeImages[0] ?? ''

export const aboutBanner: string = aboutNamed('banner', aboutImages)
export const aboutServiceLeadership: string = aboutNamed('service-leadership', galleryFacade)
export const aboutWelfare: string = aboutNamed('employee-vendor-welfare', galleryDining)
export const aboutAirlines: string = aboutNamed('quadis-airlines', galleryFacade)
export const aboutHomes: string = aboutNamed('quadis-homes', galleryRoyal)
export const restaurantHero: string[] = at('restaurant').length ? at('restaurant') : homeImages
export const banquetHero: string[] = at('banquets').length ? at('banquets') : homeImages
export const hotelsHero: string[] = at('hotels').length ? at('hotels') : homeImages

export const heroShowcaseImages: string[] = [
  '/images/home/hero.webp',
  '/images/hotels/hotel-downtown-sector-51-noida/03.webp',
  '/images/hotels/hotel-downtown-sector-51-noida/02.webp',
  '/images/hotels/hotel-downtown-sector-51-noida/01.webp',
  '/images/restaurant/dining/banquet-2-.webp',
].filter(Boolean)

const authSet: string[] = at('')
export const loginImages: string[] = authSet.length ? authSet : homeImages
export const registerImages: string[] = authSet.length ? authSet : homeImages
export const corporateImages: string[] = at('corporate').length ? at('corporate') : homeImages
export const contactImages: string[] = at('contact').length ? at('contact') : homeImages

/*
 * Named picks for the home page.
 *
 * Three sections now run back to back — Our Offerings, Experiences by Quadis
 * and the tier roadmap — and several of them want "a banquet photo" or "a
 * dining photo". public/images/banquets/ and public/images/restaurant/ hold
 * exactly ONE file each, so a second section asking for [1] gets undefined and
 * silently falls back to the same hero. These reach into restaurant/dining/,
 * which has 15, and select by filename rather than by index so re-sorting the
 * bucket cannot quietly repoint them.
 */
const firstMatching = (pool: string[], needle: string): string | undefined =>
  pool.find((url) => url.toLowerCase().includes(needle))

/** A banquet hall, distinct from banquets/hero.png. */
export const banquetHallImage: string =
  firstMatching(galleryDining, 'banquet') ?? banquetHero[0] ?? homeImages[0] ?? ''

/** A dining room, distinct from restaurant/hero.png. */
export const diningHallImage: string =
  firstMatching(galleryDining, 'dining-hall') ?? galleryDining[0] ?? homeImages[0] ?? ''

/*
 * Client photography for the three-card "Experiences by Quadis" band and the
 * "Expanding into three categories" roadmap (both re-sent July 2026).
 *
 * Addressed by filename, like the About artwork above: these folders hold one
 * image per card, and an index would repoint the moment a file is added.
 * Fallbacks are the images each section used before the client supplied its
 * own, so a missing file degrades to the shipped look rather than to nothing.
 */
export const experienceHotelsImage: string =
  namedIn('experiences', 'hotels-in-delhi-ncr') ?? galleryFacade[0] ?? homeImages[0] ?? ''
export const experienceBanquetImage: string =
  namedIn('experiences', 'banquet-hall-in-delhi-ncr') ?? banquetHallImage
export const experienceRestaurantImage: string =
  namedIn('experiences', 'restaurant-in-noida') ?? diningHallImage

export const tierCentralImage: string =
  namedIn('tiers', 'tier-quadis-central') ?? galleryFacade[1] ?? galleryFacade[0] ?? ''
export const tierSelectImage: string =
  namedIn('tiers', 'tier-quadis-select') ?? galleryDeluxe[0] ?? homeImages[0] ?? ''
export const tierExperienceImage: string =
  namedIn('tiers', 'tier-quadis-experience') ?? galleryRoyal[0] ?? homeImages[0] ?? ''

/** The client's corporate/long-stay shot. Home Offerings card only — the
 *  Corporate hero uses corporateBannerImage. */
export const corporateStayImage: string =
  namedIn('corporate', 'corporate-and-long-stays') ?? gallerySuperior[0] ?? homeImages[0] ?? ''

/**
 * Page banners the client designs and sends, as distinct from photography.
 *
 * The `banner-` prefix is load-bearing, not decorative: SECTION_ARTWORK above
 * matches on it, which is the only thing keeping these out of galleryAll. Named
 * corporate-hotel-booking-banner.webp first, and because that starts with
 * "corporate" the filter missed it and a darkened design asset shipped into the
 * public "Moments of Calm & Comfort" grid alongside real property photos.
 * about/banner.webp had the convention right all along. Keep the prefix.
 *
 * Corporate is kept separate from corporateStayImage because that export also
 * feeds the home Offerings card, and the client asked for this banner on the
 * corporate page only — repointing the shared one would have silently changed
 * the homepage too.
 *
 * Both files carry their own darkening, which is what the white hero text
 * needs. They are also different shapes — 2.702:1 and 3:1 — so the hero renders
 * them with `height="banner"`, which takes its height from the image instead of
 * imposing a ratio. See .photo-hero--banner in pages.css.
 */
export const corporateBannerImage: string =
  namedIn('corporate', 'banner-corporate-hotel-booking') ?? corporateStayImage

/** The Gallery landing banner, sent 28 Jul: "ye vale landing page me ye vala
 *  banner lga dena". Falls back to the previous facade shot if it goes missing. */
export const galleryBannerImage: string | undefined =
  namedIn('gallery', 'banner-gallery-landing')

/** The dining & catering landing banner, sent 29 Jul in the zip of that name.
 *  1351x500 (2.702:1) like the corporate one, so the hero renders it with
 *  height="banner" — contained, not cropped. Undefined falls the hero back to
 *  photography, which is the shipped look. */
export const restaurantBannerImage: string | undefined =
  namedIn('restaurant', 'banner-in-dining-catering')

/**
 * The room shot the client captioned "Executive & Deluxe Stays image" on
 * 28 Jul, for the first card in OurOfferings.
 *
 * That card read `homeImages[0]`, which resolves to home/hero.webp — so the
 * lead offering card was showing the same photograph as the homepage hero
 * directly above it. The comment on the Corporate card records this exact
 * failure happening once before, which is why this one is addressed by name.
 *
 * Lives at rooms/ root: nothing consumes at('rooms') — the tabs read
 * rooms/deluxe, rooms/superior and rooms/royal — so it cannot displace a
 * gallery category, and it is real photography, so it belongs in galleryAll.
 */
export const executiveStayImage: string =
  namedIn('rooms', 'executive-and-deluxe-stays') ?? homeImages[0] ?? ''
