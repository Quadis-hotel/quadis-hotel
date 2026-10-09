# Quadis — full frontend + backend audit
Read against `DsThakurRawat/Quadis@main` (tree `d47855c`), 25 Jul 2026.
Ordered by impact. **P0 = breaks or misleads a paying guest. P1 = design credibility. P2 = polish.**

---

## A. Bugs that a guest will hit today

**P0 — The whole app waits on an API call before it paints.**
`src/data/hotels.ts` runs a **top-level `await fetch(getApiUrl('properties'))`**. That makes every module importing it async; React can't mount until the request settles. Slow or dead backend = blank white page, no spinner, no fallback message. The static fallback array only helps *after* the request resolves.
→ Fix: export `STATIC_HOTELS` synchronously and hydrate over it (`useHotels()` hook / context, `useSyncExternalStore`, or a route loader). Never fetch at module scope.

**P0 — Two "Contact" links go to a 404.** Home's Future Vision cards link `to="/contact"`; the route is `/contactus`. Both cards dead-end on NotFound.

**P0 — The contact form lies.** `Contact.tsx` POSTs the `ContactPayload` shape (`name/email/phone/type/message`) to `/api/enquiries`, which expects `guest_name / guest_phone / enquiry_type`. It then `catch`es the failure, logs to console, and still renders **"Message sent."** The guest believes they've reached you; nobody has. Same class of problem in `BanquetDetail.tsx`, whose submit is a fake `setTimeout(1500)` — every banquet enquiry is silently discarded.

**P0 — Displayed price ≠ chargeable price.** The DB carries `weekend_surcharge_percent`; the UI never applies it. A guest sees ₹1,599 × 2 nights and is billed more. In a flow with live Razorpay this is a chargeback and a consumer-protection problem, not a design nit.

**P1 — Header's "Upcoming Destinations" is a no-op.** It links `/hotels?city=Upcoming`; `Upcoming` isn't a valid `CityFilter`, so the param is discarded and the user lands on the unfiltered list wondering what happened.

**P1 — Empty tier UI.** All 9 properties are `tier: 'central'`, yet `HotelsList` renders a 3-column tier explainer and 4 tier pills. Two of three tiers return zero results. Also the pills print raw enum values — `central`, `select`, `experience` — not `Quadis Select`.

**P1 — Guests are shown other hotels' rooms.** `hotelImages()` pads any gallery under 5 photos with hash-picked photos from *other properties*, and `roomImages()` falls back to a global pool. A Deluxe Room card in Lajpat Nagar can show a Sector 15 suite. Three honest photos beat five dishonest ones — cap the gallery at what exists and let the layout adapt.

**P1 — Footer has five dead links.** Privacy Policy, Terms, Career, Blog and Contact Us all point at `/contactus`. Legal pages that don't exist are worse than absent ones on a site taking payments.

**P2 — `HeroShowcase` mutates localStorage inside a `useState` initializer.** Side effect in render; React 18 StrictMode double-invokes it, so the deck skips an image on every dev mount.

**P2 — No `<h1>` on the homepage.** The hero uses `<h2 className="h1">`. Heading order is broken for screen readers and search.

**P2 — Autopilot with no brake.** `VirtualTour` rotates every 4.5s, always on, no pause on hover/focus and no `prefers-reduced-motion` opt-out. It moves out from under anyone trying to read a caption.

---

## B. Numbers that contradict each other

The site currently claims, on one page: **10 properties** (hero copy, offerings copy, chat greeting, About) — the array has **9**. **5,000+ happy guests** (StatsStrip) and **500,000+ verified guests** (HappyClients). **"128 Moments"** in the gallery heading, hardcoded, against a variable file count. **Since 2017** in the hero, **© 2017–2026** in the footer.
→ One source of truth: derive counts from data (`HOTELS.length`, `galleryAll.length`) and keep exactly one guest-count claim you can defend.

---

## C. What I'd remove from the homepage

The homepage is **15 stacked sections with four separate closing CTAs**. It reads as a template dump, which is the opposite of premium. Current order: Hero → BookingBar → Stats → Hotels → Stay Promise → Offerings → **Upcoming** → **Destinations** → Deals → Featured-In + Offers → Business CTA → Future Vision → Happy Clients → Ecosystem + Partners → CtaBand.

**Cut / merge:**
1. **Upcoming Hotels + Destinations For You — one module, not two.** They're the same eight cities, the same images, twice on one page. Merge into one "Where you'll find us" strip: live cities are links, upcoming cities are dimmed with a date. (Also: Destinations lists Gurgaon, Manesar and Faridabad as `active` — you have no hotel there. And Bengaluru borrows `/images/home/hero.jpg`.)
2. **Three trust sections → one.** Stats, "Featured In", and "Happy Clients / 500,000+" all do the same job. Keep one, near the booking decision.
3. **Four CTAs → two.** Business/Franchisee CTA + Ecosystem banner + Future Vision + CtaBand all end the page. Keep the booking CTA; move Ecosystem, Future Vision and Franchisee to About — that's what About is for.
4. **Deals as four circular cut-outs** ("Boss Lady", "Never Too Old", "Stay Long Stay Green") sits at odds with the Marcellus/cream restraint everywhere else. Either make them proper offer cards with terms and an expiry, or move them to a `/offers` page.
5. **`.bg-blue { #1a56b8 }`** in `global.css` — a stock corporate blue with a 12px radius, in a warm-neutral-and-gold system. Delete it.

Target: **Hero + Booking → Properties (with tiers) → Stay Promise → Offerings → Where we are → Trust → Book CTA.** Eight sections, one closing ask.

---

## D. Design-system drift

`tokens.css` states the rule: *"No hex values are allowed anywhere outside this file."* Currently broken in at least three places, and the drift is visible:

- **`QuadisAssistChat.tsx`** hardcodes `#c9a86a` gold, `#1c1917`/`#0c0a09` browns, `#22c55e` green, `#ef4444` red, plus `rem` sizing and pill radii — a different gold from `--gold: #c8a24a`, a different neutral ramp, and a different shape language. It reads like a widget from another product bolted on. Rebuild it on the tokens with `--radius: 8px`.
- **Emoji as UI**: ✨ 👋 🤖 🚨 ⚡ in the chat, ★ in `stars()`. A premium hotel brand doesn't ship a rocket-and-sparkle voice. Replace with the existing `icons.tsx` set.
- **Unsplash URLs hardcoded in shipped code** — `media.tsx` hero poster default, three `OurOfferings` cards, `DealsSection`'s `onError`. Stock photos of *someone else's* hotel on your own property pages. Remove all four; fall back to the `Photo` placeholder instead.
- **Two floating buttons** stacked bottom-right (WhatsApp at 20px, chat at 90px). On a 360px phone they cover the sticky booking CTA. Collapse into one contact affordance that expands to WhatsApp / call / chat.
- **Nine top-level nav items + Register + Login** at 1440px. Group `Virtual Tour` + `Gallery` under one "Explore", and drop `Corporate Booking` into the Hotels dropdown.
- **`hcard__addr` prints the full postal address**, pincode and all, inside a card grid. Cards want `Sector 51, Noida`; the full address belongs on the detail page next to the map.

---

## E. Maps — how location should actually work

Today: `HotelDetail` and `Contact` both embed `https://maps.google.com/maps?q=<name+address>&output=embed` in a 16:8 iframe. Four problems:

1. **It's a text search, not a place.** The pin lands wherever Google's geocoder guesses from a string like *"Metro pillar no. 33, Opposite, New Ashok Nagar Rd…"*. For at least three of your addresses that will not be the front door.
2. **Unkeyed `output=embed` is undocumented** — it can change or start showing a consent interstitial with no warning, on your booking page.
3. **Weight**: the iframe loads Google's map bundle (~600–900 KB + third-party cookies) on every hotel page view, whether or not the guest scrolls to it. It competes with your own photography for LCP.
4. **No brand control** — Google's default palette in the middle of a cream-and-gold page.

**Recommended pattern (designed in `Quadis Location & Links.dc.html`):**

- **Store the place, not a string.** Add `lat`, `lng`, and `placeId` to `Hotel`. Drop the `share.google/…` shortlinks in `hotels.ts` — they're opaque, expirable, and nothing in the code reads them anyway.
- **Static-first map facade.** Render a **static map image** (Google Static Maps or Mapbox Static, styled to the warm palette) with your own gold pin as a 16:9 card. Load the interactive iframe **only on click** ("Tap for interactive map"). Zero third-party cost on page load, full brand control, and one clear affordance.
- **Lazy-mount even then**: mount on IntersectionObserver, keep `loading="lazy"`, `referrerPolicy="no-referrer-when-downgrade"`.
- **"Getting here" beats a map.** Under the plate, list the four facts an NCR guest actually needs, per property: nearest **Metro station + walk minutes**, **IGI airport** distance/drive, nearest **railway/ISBT**, and the **local landmark** (Sector 18 Market, Central Market, Kailash Colony). This is content the map cannot convey and it converts better than a pannable canvas.
- **One actions row, always the same four:** Get directions (`maps.google.com/dir/?api=1&destination=<lat>,<lng>&destination_place_id=<id>`), Copy address, Call property, Share on WhatsApp.
- **City-level map on the Hotels list**, not per-card: a single NCR map with numbered pins bound to the card list — hover a card, the pin lifts; click a pin, scroll to the card. Build it from real coordinates.
- **Never put a map inside a card grid**, and never as the first thing in a section — the photograph earns the scroll, the map confirms the decision.

## F. Links — one policy, applied everywhere

- **`a { color: inherit }` is the only link rule in `global.css`.** Any link inside prose is invisible until hovered — the "Know more." in the Stay Promise gets an inline `style` to compensate. Define `.prose a` / body links once: gold-deep, 1px underline at 0.15em offset, `--gold` on hover.
- **Internal navigation must use `Link`.** `DealsSection` uses raw `<a href="/hotels">` (four of them) — full page reload, lost scroll, lost state. `TourBookingBar` mixes both.
- **External links** get `target="_blank" rel="noopener noreferrer"` **plus a visible external glyph** — currently `rel="noreferrer"` only, and no affordance.
- **`tel:` / `mailto:` never open a new tab**, and should be tappable at ≥44px on mobile (footer contact rows are ~24px).
- **Every route in the nav and footer must resolve.** Either build `/privacy`, `/terms`, `/careers`, `/blog` as real (short) pages, or remove them from the footer until they exist.
- **Add `aria-current`** styling for the active `NavLink` — right now the active page is indistinguishable.

---

## G. Backend

**Solid**: zod validation on `/bookings/initiate` (dates, counts, past-date guard), a 15-minute soft-hold worker, Razorpay + webhook + PDF GST invoice split into services, an in-memory DB fallback so the API runs without Postgres.

**Needs work — in this order:**

1. **`GET /api/ai/logs` is public and returns every guest conversation** (`user_message`, phone numbers guests typed, booking codes). That's a privacy incident with a URL. Put it behind admin auth or delete the route.
2. **No auth anywhere.** `/api/admin/*` and `/admin` (AdminDashboard, 20 KB of it) are open to anyone who types the path. `Login.tsx`/`Register.tsx` are decorative — no session, no token, no guard. Either add real auth (JWT + `requireAdmin` middleware) or take `/admin` off the deployed build.
3. **`express.json()` is mounted globally, before `webhooksRouter`.** Razorpay signature verification needs the **raw** body; a parsed body either fails HMAC or gets skipped. Mount `express.raw({type:'application/json'})` on the webhook path only, above the JSON parser.
4. **`cors()` with no options** = every origin. Restrict to your domains.
5. **No rate limiting, no helmet.** `POST /api/enquiries` and `POST /api/ai/chat` are unauthenticated and one of them costs money per call (Groq). This is a spam bill waiting to arrive. `express-rate-limit` + `helmet` are ten lines.
6. **Webhook idempotency**: confirm a repeated `payment.captured` for the same `razorpay_payment_id` can't double-confirm or double-decrement inventory. Unique index on `razorpay_payment_id` + status guard.
7. **Schema lags the types.** `properties` has no `tier` / `tier_label` columns, but `PropertyRecord` and the whole tier UI expect them; the frontend mapper papers over it with `h.tier || 'central'` — which is exactly why every hotel shows as Central. Add the columns and the enum constraint, and seed them.
8. **`no seat for availability`**: `available_units` is a single integer per room type, not per-date. Two guests can hold the same room for different weeks and one gets refused for no reason. Availability needs a per-date table (or at least a date-range hold table) before you take real money.
9. **Contact/enquiry contract**: pick one payload shape and share it — you already have `src/types.ts` and `backend/src/types.ts` diverging. One package, imported by both.

---

## H. Suggested order of work

1. Kill the top-level `await` (blank-page risk) · fix `/contact` 404 · make Contact + Banquet forms actually submit and actually report failure.
2. Lock the backend: auth on `/admin` + `/ai/logs`, raw-body webhooks, CORS allowlist, rate limits.
3. Homepage edit: 15 sections → 8, merge Upcoming + Destinations, strip Unsplash, one guest-count claim, real `<h1>`.
4. Location system: coordinates in data, static-map facade + "Getting here" + one actions row; NCR locator on the Hotels list.
5. Rebuild the chat widget on tokens, de-emoji, merge the two floating buttons.
6. Assign real tiers (or hide the tier UI), add `tier` to the schema, fill the six thin photo sets.
