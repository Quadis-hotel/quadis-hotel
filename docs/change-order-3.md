# Quadis — Change Order #3

> **HISTORICAL — delivered 26 Jul 2026. One section is now wrong.**
> The occupancy pricing in §6 below ("a third adult adds +40%", "a child adds
> nothing, at any age") was the client's **first** answer and she superseded it
> on **27 Jul**. The binding rule is extra adult **30%**, under-8 free, **8–12
> at 20%**, 13+ as an adult — AGENTS.md §2 rule 3. Do not price anything off
> this file. Kept as the record of what was asked for and delivered on 26 Jul.

Client list of 26 Jul 2026 (2 headline asks + 9 numbered items), answered item by
item. Companion docs: `DEPLOYMENT.md` (config and go-live), `Quadis-Audit-1.md`.

Verification for everything below: frontend `tsc` clean, `vite build` clean,
backend `tsc` clean, **102 backend tests passing** (up from 64 — 38 added for the
new occupancy and admin-editing behaviour), plus the booking flow checked in a
real browser.

---

## Headline asks

### H1. Optimise for mobile — DONE (needs a visual check on a real phone)

The site's responsive CSS turned out to be in better shape than expected: the
card grids, hotel-detail sidebar, amenities and specs rows all already collapse
correctly. Two real problems were found and fixed, plus the booking bar (item 1).

- **Virtual-tour captions were unreadable on a phone.** `.tour-pin__tooltip` was
  a fixed 280px centred on its pin; near a screen edge it ran off the side, and
  `body { overflow-x: hidden }` clipped it rather than scrolling. Now
  `width: min(280px, calc(100vw - 32px))`.
- **iOS zoomed the page on every date/text field.** Inputs under 16px trigger
  Safari's auto-zoom, which leaves the page scrolled sideways with the booking
  bar half off-screen. Booking-bar inputs are now 16px at ≤640px.
- **Touch targets.** Stepper buttons were 34px, below the 44px accessible
  minimum. Now 44px on phones.

**Also caught and fixed a regression this introduced:** splitting "Guests" into
Adults + Children made six fields in a five-column grid, so "SEARCH STAYS" wrapped
onto a row of its own. The desktop bar is now a single clean row, with a new
tablet breakpoint at 1180px.

The mobile arrangement was verified in a browser — dates on row one, destination
on row two, Adults/Children on row three, search full-width — and the rule
ordering checked via the CSSOM. One caveat: the window manager forced 1920px, so
the real breakpoint could not be triggered by resizing. **Worth ten minutes on an
actual phone before sign-off.**

### H2. Configure the payment gateway — CODE READY, BLOCKED ON YOU

The integration was already complete and correct: `CheckoutModal` loads
Razorpay's checkout.js, creates a server-side order, opens Razorpay, then
**polls the server** until the webhook confirms payment. It never marks a booking
paid on the browser's word, and the webhook verifies its signature and refuses
replays.

Two things block real money, both outside the code:

1. `backend/.env` holds **test** keys (`rzp_test_…`). Live keys need completed
   Razorpay KYC.
2. **The API is not reachable from the deployed site at all** — see item 6. Until
   that is fixed, payments cannot work no matter what keys are set. They are the
   same problem.

Exact steps in `DEPLOYMENT.md` §4.

---

## Numbered items

### 1. Check-in / Check-out sit too low on mobile — FIXED

Source order is desktop order: Destination first, then the dates. On a narrow
screen the destination select takes a full-width row of its own, pushing the two
fields the guest actually came to fill in down below it.

Fixed in CSS with `order`, so the dates come first on mobile while the desktop
row and the DOM/tab order are unchanged. The bar is also tighter on phones
(smaller gap and padding) so more of it lands above the fold.

`src/styles/chrome.css`, `src/components/BookingBar.tsx`

### 2. Carry dates and guests to the booking page — FIXED

This was genuinely broken. The booking bar wrote `?checkin=&checkout=&guests=`
and **nothing ever read them**: the hotels list looked only at `city`, and the
hotel page initialised its own date fields to empty strings. The guest entered
their dates on the home page and was asked for them again on the next screen.

Now there is one shared definition of how a stay is spelled in a URL
(`src/data/stay.ts`), used by all four places:

- Booking bar writes the stay to the query string.
- Choosing a **named hotel** now goes straight to that hotel's page with the
  stay attached, skipping the list entirely.
- The hotels list carries the stay onto every hotel card link.
- The hotel page seeds its booking panel from it.
- Checkout receives it.

A stale or hand-edited URL cannot poison the page: past dates, a checkout on or
before check-in, and out-of-range party sizes are all discarded. Old `?guests=`
links still work, read as an adult count.

### 3. Triple-occupancy rate — DONE, to the client's stated rule

Implemented from the client's WhatsApp of 26 Jul 2026:

> "Double occupancy room ka 40% increase hoga triple mein"
> "And agar teesra person adult hain only then" · "If it's child then no"

- Every rate covers **2 adults per room**.
- A third **adult** adds **+40% of that night's room rate**. Two extra adults, +80%.
- A **child adds nothing, at any age.**
- Percentage rather than a flat sum, so it tracks the room rate and the weekend
  surcharge automatically: a triple on a surcharged Friday is 40% above *that
  Friday's* double, not above a weekday rate.
- Rounded to whole rupees per night — 40% of ₹1,599 is ₹639.60, quoted as ₹640,
  so a guest never sees a fractional price.
- Charged once per extra adult, not per room.

**Both figures are editable per hotel** at `/admin` → Edit hotels → Occupancy &
extra guests: the percentage, and the age below which someone counts as a child
(18 by default, so no child is ever charged).

The guest sees it itemised before paying:

```
₹1,599 × 1 night × 1 room                    ₹1,599
Extra adult (1 × 40% of room rate)             ₹640
────────────────────────────────────────────────────
Total                                        ₹2,239
```

> ⚠️ **This supersedes the flat-₹500 model you first chose**, and the client's
> "if it's child then no" **contradicts the "under 12 free, then extra adult"
> rule you gave me** — they are saying a child never incurs the increase. I have
> defaulted to the client's version. If they meant 12-and-over should pay, just
> set "Counts as a child under age" to 12 in the admin panel; no code change.

The uplift is **frozen onto each booking**, so repricing later cannot rewrite an
already-issued invoice. The count that prices a stay is always re-derived
server-side, so a crafted request cannot skip it. Verified end to end: 2 adults
₹1,599 → 3 adults ₹2,239 → 4 adults ₹2,879 → 2 adults + child (any age) ₹1,599.

### 4. Separate Adults and Children fields — DONE

The single "Guests" number is replaced by **Adults** and **Children** in both the
booking bar and the hotel page's booking panel.

Children are collected with an **age each**. Under the client's rule no child is
charged whatever their age, but the age is still recorded — the front desk needs
it to make the room up, and a hotel that later chooses to charge, say, 12-and-over
can switch that on in the admin panel without a code change. Ages carried over
from the home page default to a free age, so a quote can never jump upward on
arrival.

The party is stored on the booking (`adults_count`, `children_count`,
`child_ages`, `extra_adults`) and appears on the owner's WhatsApp alert as
`2 Adults, 1 Child (+1 extra bed)` — what the desk needs to make up the room.
The chatbot was taught the same rules, including "a child adds nothing", so it
cannot quote a 3-adult room at the 2-adult rate or invent a charge for a child.

### 5. Is all website content editable from the admin panel? — WAS NO; NOW LARGELY YES

The honest answer at the time you asked: no. `/admin` could toggle room
availability, set the weekend surcharge and mint payment links. Everything
else — every hotel record, price, room rate, headline and image — was hardcoded
and needed a developer and a redeploy.

**Three editing tabs have been added to `/admin`:**

| Tab | What a manager can now change |
|---|---|
| **Edit hotels** | Name, address, phone, WhatsApp, email, base rate, rating, weekend surcharge, **triple-occupancy % and free-child age**, and live/paused |
| **Edit rooms & rates** | Per room type: name, size, bed type, max guests, rate above base, breakfast and all-meals supplements, room count, bookable |
| **Edit website text** | The registered copy blocks — hero headline, corporate intro, contact intro, footer tagline, check-in/out times, cancellation policy |

Verified live: an admin changing Sector 51's base rate to ₹1,750 immediately
changed both the public listing **and the amount a new booking is charged**.

Copy editing is safe by construction: each block keeps the text it ships with,
and an empty box means "use the built-in wording". A database that is down,
unmigrated, or never written to renders exactly today's site — editable copy can
never blank a section.

**Still needs a developer:**

- **Photography.** There is no image upload pipeline. This is the biggest
  remaining gap and now has its own scope document:
  **`docs/image-pipeline-plan.md`** — 5 phases, ~6 days, and it also resolves the
  266 MB-per-deploy image duplication and the unoptimised assets. Three
  infrastructure decisions are needed before Phase 1 (§6 of that doc).
- Page structure and section order.
- Offers, testimonials, partner logos, the NCR map.
- Adding or removing a property (fields of existing ones are editable).

Extending the text editor is now cheap: add the string to `DEFAULT_CONTENT` in
`src/data/content.ts` and swap the literal in the component for `t('your.key')`.
It appears in the admin panel automatically. Tell me which sections matter most.

**Requires `DATABASE_URL` to be a real PostgreSQL instance.** In the current
in-memory mode every edit is lost on restart — see item 6 and `DEPLOYMENT.md` §3.

### 6. User registration is not working — ROOT CAUSE FOUND; ONE STEP LEFT FOR YOU

**Registration is not broken.** Tested against a live server: `POST
/api/auth/register` returns `201` with a valid session token, and the frontend
form and validation are both correct.

**The API is not reachable from the deployed website.** `src/config/api.ts`
resolves the API to `/api` on the current domain in production. The deployment
guide uploads the frontend to an S3 bucket and runs the backend as a *separate*
service, with CloudFront marked "(Optional)". **An S3 bucket does not serve
`/api`** — so every API call returns the bucket's 404 or the SPA's own
`index.html`.

This is why it looked like only registration was broken: the hotel list falls
back to bundled static data, so the site *looks* healthy. In reality sign-in,
every enquiry form, bookings, invoices, payments and the chatbot are all dead
too. Registration is just the loudest symptom because it has no fallback.

What was fixed in code:

- `VITE_API_URL` is now the documented way to point the bundle at the API, and
  the localhost check no longer misses `127.0.0.1`, a LAN IP or ports past 5179.
- The misconfiguration logs a named warning at boot instead of surfacing as
  "Unexpected token '<'" inside whichever form the visitor submits first.
- Guests get a real message and the reservations number, not `Request failed`.
- Added `.env.example` for the frontend.

**Two further gaps found while tracing this, both fixed:**

- **`schema.sql` was never executed by anything.** Pointing `DATABASE_URL` at a
  fresh PostgreSQL instance produced a server that booted cleanly and then failed
  every query with "relation does not exist". There is now a migration runner
  that applies the schema on boot, idempotently, and refuses to start if it
  fails.
- Without `SESSION_SECRET` set, registration and login return 503 by design
  ("Sign-in is not configured"). The AWS config sets only `NODE_ENV` and `PORT`,
  so this would have been the *next* failure after the routing was fixed.

**This is the one item I cannot finish for you** — it needs either your backend
URL or a CloudFront route. Both paths are written out in `DEPLOYMENT.md` §1.

### 7. Replace the restaurant image in Corporate Booking — FIXED

`public/images/corporate/` does not exist, so the page's image resolver fell all
the way back to the home set, whose second entry is a photograph of a restaurant
dining room. It was rendering under the label "Quadis Lobby".

Now points at an actual lobby photograph, addressed **by filename** rather than
by list position — so adding a file to the folder can never silently repoint it
at a dining room again.

`src/pages/Corporate.tsx`

### 8. Remove ™ from Quadis Airlines and Quadis Homes — FIXED

Both were on the About page only (`About.tsx:125` and `:138`). Removed. Neither
is a registered mark, so the symbol was a legal overstatement as well as a
visual one.

### 9. Quadis Homes before Quadis Airlines — FIXED

The home page already had Homes first; the About page had Airlines first, which
is the page you were looking at. Swapped, so both pages now read Homes then
Airlines.

---

## Fixed along the way

- **"BOOK NOW" was clickable with zero nights.** Same-day check-in/check-out was
  selectable (`min` was inclusive of check-in). Checkout then opened claiming
  "1 Night" at ₹0, the guest filled in name and phone, and the server rejected
  the hold. Check-out now starts the day after check-in, and the button is
  disabled until the dates make a real stay.
- **The two pricing files had already drifted.** `backend/src/lib/pricing.ts` and
  `src/lib/pricing.ts` carry an explicit "keep these in sync" contract and had
  diverged on the zero-night case. Realigned.
- **Room rates could be edited on the wrong property.** Room slugs are shared —
  every hotel has a `deluxe-room` — so matching by slug would have let an admin
  editing one property's rate silently change another's. The edit endpoint takes
  an id only.
- Admin edit endpoints reject unknown fields rather than dropping them silently,
  so a typo surfaces instead of appearing to save.

## Still open from Audit #1

Not in this change order, listed so they are not lost:

- **Galleries pad with other properties' photos.** A property with fewer than
  five photos is topped up from a shared pool, so a Lajpat Nagar room card can
  show a Noida room. Flagged P1 in the earlier audit; still open.
- **The build ships every image twice** — 180 of 190 are byte-identical
  duplicates across `dist/images/` and `dist/assets/`, about 266 MB of dead
  weight per deploy.
- **121 images over 1 MB** (263 MB total), photographs stored as PNG, no
  thumbnails, no `srcset`.
- **No SEO surface**: one title for all 17 routes, no Open Graph tags, no
  `robots.txt`, no `sitemap.xml`.
- **The admin bearer token is a static shared secret** handed to the browser with
  no expiry; rotating it needs a redeploy.
- Virtual tour autoplays every 4.5s with no pause and no reduced-motion opt-out.
