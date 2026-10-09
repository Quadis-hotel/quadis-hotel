# Quadis — Change Order #3

Client brief received 26 Jul 2026. Read against `DsThakurRawat/Quadis@main`
(tree `e815846ad8f2`).

**Six items are straightforward and specced below. Two are configuration, not
code — no development needed, but someone has to press the buttons. Two are new
product decisions that I cannot build until the client gives me numbers.**

Summary:

| # | Item | Type | Status |
|---|---|---|---|
| A | Mobile optimisation | Code | Partly specced — need screenshots |
| B | Payment gateway | **Config only** | Ready — needs client action |
| 1 | Dates too low on mobile | Code | Specced |
| 2 | Carry dates/guests to booking page | Code | Specced |
| 3 | Triple-occupancy rate | Code + data | **Blocked — need rates** |
| 4 | Adults / Children fields | Code + data | **Blocked — need child policy** |
| 5 | Is all content admin-editable? | Question | **Answer: no.** See below |
| 6 | Registration not working | Config (probably) | Diagnosis + 5-min check |
| 7 | Corporate restaurant image | Asset | **Blocked — need the image** |
| 8 | Remove ™ | Code | Specced — 2 lines |
| 9 | Homes before Airlines | Code | Specced |

---

## B. Payment gateway — nothing left to build

This was finished in the last release. `CheckoutModal` creates a real Razorpay
order, opens real Razorpay checkout, and waits for the server to confirm the
webhook before it shows "Confirmed". `RazorpayService`, the webhook handler with
signature verification, GST invoicing and WhatsApp receipts are all live.

It is off because four environment variables are unset. On the Render dashboard,
`quadis-backend` → Environment:

```
RAZORPAY_KEY_ID          rzp_live_…      (Razorpay → Settings → API Keys)
RAZORPAY_KEY_SECRET      …               (shown once at generation)
RAZORPAY_WEBHOOK_SECRET  …               (you choose it, see below)
```

Then in the Razorpay dashboard → Settings → Webhooks → Add New Webhook:

- **URL** `https://<backend-host>/api/webhooks/razorpay`
- **Secret** the same string you put in `RAZORPAY_WEBHOOK_SECRET`
- **Active events** `payment.captured`, `payment.failed`, `order.paid`

Until the keys are set the checkout deliberately refuses to pretend: the guest
sees "Online payment is not enabled on this environment — your room is held for
15 minutes, call us with booking code XXX." That is correct behaviour, not a bug.

**Test with Razorpay test keys first** (`rzp_test_…`). One booking end to end,
confirm the WhatsApp receipt and the GST PDF, then swap to live keys.

---

## A. Mobile optimisation

The site is responsive — there are ~40 breakpoints across the five stylesheets —
so "optimise for mobile" needs to be pinned to actual defects rather than a
rebuild. Item 1 below is one. To do the rest properly I need **screenshots from
the client's own phone, with the device named**, or at minimum a list of which
pages look wrong. Without that I would be guessing at which of forty breakpoints
they mean.

What I can already see is worth fixing:

- The booking bar's mobile grid leaves a dangling empty cell (see item 1).
- `.bbar--overlap` pulls the bar up 40px into the hero at ≤640px, which on a
  short phone viewport crowds the headline.
- `HotelDetail`'s booking card goes `position: static` below 900px and lands at
  the very bottom of a long page — on a phone the guest scrolls past rooms,
  description, map and gallery before reaching the date fields. Same root cause
  as item 1 and worth solving the same way: a sticky "₹X / night — BOOK" bar
  pinned to the bottom of the viewport on mobile.

I'd suggest we treat A as its own pass once 1–9 are in, scoped from real
screenshots.

---

## 1. Check-in / Check-out sit too low on mobile

**Diagnosis.** `src/styles/chrome.css:165–170`. At ≤900px the booking bar becomes
two columns, with Destination forced to full width on row 1 and Search full width
on the last row:

```
[  Destination  ]
[Check-in][Check-out]
[ Guests ][  empty  ]
[    SEARCH     ]
```

Destination pushes the dates down a full row, and the Guests row wastes half a
row on nothing. On a phone the whole bar already starts below a tall hero, so the
dates end up well down the page.

**Fix.** Reorder on mobile so the dates lead — they are what a guest actually
sets — and close the empty cell. In `chrome.css`, replace the `@media (max-width: 900px)`
block at line 165:

```css
@media (max-width: 900px) {
  .bbar { grid-template-columns: 1fr 1fr; }
  /* Dates first: they are the fields guests come to set. Destination is
     pre-filtered by the card they tapped in most journeys anyway. */
  .bbar__field:nth-of-type(2) { order: 1; }   /* Check In  */
  .bbar__field:nth-of-type(3) { order: 2; }   /* Check Out */
  .bbar__dest { order: 3; grid-column: 1 / -1; }
  .bbar__field:nth-of-type(4) { order: 4; grid-column: 1 / -1; }  /* Guests */
  .bbar__search { order: 5; grid-column: 1 / -1; width: 100%; height: 48px; }
}
```

Guests spanning full width kills the empty cell and gives the stepper room for
44px hit targets.

**Also**, at ≤640px drop the overlap so the bar clears the hero instead of
biting into it (`chrome.css:150`):

```css
@media (max-width: 640px) { .bbar--overlap { margin-top: -16px; } }
```

**Acceptance:** on a 390×844 viewport, Check-in and Check-out are the first two
fields in the booking bar, no empty grid cell, no field narrower than 44px tall,
and the bar does not overlap the hero headline.

---

## 2. Carry dates and guests through to the booking page

**Diagnosis.** `BookingBar` already builds the query string —
`/hotels?city=…&checkin=…&checkout=…&guests=…`. It dies there. `HotelsList` does
not forward the params onto the hotel links, and `HotelDetail` initialises its own
state with `useState('')` and never reads the URL. The guest re-enters everything.

**Fix, three small changes.**

**a. `src/components/ui.tsx` — `HotelCard`** should preserve the current search
when linking to a property:

```tsx
import { Link, useLocation } from 'react-router-dom'

export function HotelCard({ hotel }: { hotel: Hotel }) {
  const { search } = useLocation()
  const img = hotelImages(hotel.slug)[0]
  const href = `/hotels/${hotel.slug}${search}`
  // …use `href` for both the media Link and the VIEW & BOOK Button
```

**b. `src/pages/HotelDetail.tsx`** — seed state from the URL:

```tsx
import { useParams, Link, useSearchParams } from 'react-router-dom'

const [params] = useSearchParams()
const [checkin, setCheckin]   = useState(params.get('checkin')  ?? '')
const [checkout, setCheckout] = useState(params.get('checkout') ?? '')
const [guests, setGuests]     = useState(Number(params.get('guests')) || 2)
```

**c.** Home's booking bar links to `/hotels`, so a guest who searches from the
homepage lands on the list with the params intact and carries them into whichever
property they open. No change needed on the homepage.

**Acceptance:** set dates + 3 guests on the homepage → Search → open any property
→ the booking card already shows those dates and 3 guests, and the total is
calculated without touching a field.

*Note:* the same query string should survive into `CheckoutModal`, which it will
automatically since the modal reads `HotelDetail`'s state.

---

## 3. Triple-occupancy rate — blocked, need numbers

**There is no concept of per-person pricing anywhere in the system today.** A
room's price is `base_price + room offset + meal offset`, multiplied by nights and
room count. `guests_count` is recorded on the booking and used for nothing else.
`max_guests` on `room_types` is displayed ("Up to 3 guests") and not enforced.

So this is not a bug fix — it is a new pricing rule, and it touches the schema,
the seed data, both pricing modules, the booking card and the checkout summary.

**Before I can build it I need from the client:**

1. The **extra-adult charge per night**, per room type — or one flat figure across
   all properties if that is the policy. (₹800/night is a common NCR figure but I
   will not invent it.)
2. Does it apply from the **3rd adult**, or from the 3rd guest of any age?
3. Does the extra adult come with a **meal-plan uplift** too (an extra breakfast),
   or is it bed-only?
4. Which room types can physically take a 3rd adult? `max_guests` currently says 2
   for most rooms in the seed data — if triple occupancy is real, that data is
   wrong and needs correcting.

**Once I have those**, the shape is: add `extra_adult_charge NUMERIC(10,2) DEFAULT 0`
to `room_types`, extend `StayPricingInput` with `adults` and `extraAdultCharge`,
add `Math.max(0, adults - 2) * extraAdultCharge` to the nightly rate in **both**
`backend/src/lib/pricing.ts` and `src/lib/pricing.ts` (they must stay mirrored, or
the quoted price and the charged price diverge), and show it as its own line in
the booking card and the checkout GST breakdown.

---

## 4. Separate Adults / Children fields — blocked, need policy

Depends on 3, and adds its own question. Today `guests` is one number, stored as
`guests_count INTEGER`.

**Need from the client:**

1. **Child age cut-off** — under what age is a guest a child? (Usually 12.)
2. **Do children stay free?** If not free, what is the child rate — and is it
   different with a meal plan?
3. **Maximum children per room**, and do they count toward `max_guests`?
4. Is a **child bed / cot** chargeable?

**Shape of the change:**

- `bookings`: replace `guests_count` with `adults_count` and `children_count`
  (keep `guests_count` as a generated total so nothing downstream breaks — the
  WhatsApp templates, the GST invoice and the admin dashboard all read it).
- `initiateBookingSchema` in `backend/src/routes/bookings.ts`: accept both,
  validate `adults >= 1` and `adults + children <= max_guests` for the room type.
- `BookingBar` and `HotelDetail`: replace the single Guests stepper with two
  steppers. The existing `Stepper` component already does this — it just needs a
  second instance and a shared "2 adults, 1 child" summary label.
- `CheckoutModal`: show the split in the summary bar.

I would do 3 and 4 together as one release, since they share the schema migration
and the same UI row.

---

## 5. "Is all website content editable from the admin panel?"

**No — and not close.** I want to be direct about this because it affects what the
client can do without a developer.

**What the admin panel does today** (`backend/src/routes/admin.ts`, four endpoints):

- View the dashboard — today's check-ins, pending holds, revenue, recent bookings
- Toggle a room type sold-out / available
- Change a property's weekend surcharge percentage
- Generate a payment link for a booking
- Read and update enquiries

**What is *not* editable and lives in source code**, requiring a developer and a
redeploy to change:

- Every heading, paragraph and button label on every page
- The hotel list, addresses, descriptions, room names, room descriptions, base
  prices and meal-plan offsets (`src/data/hotels.ts`)
- All photography (files in `public/images/**`)
- Offers, deals, testimonials, partner logos, press logos
- Section order and which sections appear at all

**Three honest options:**

1. **Leave it.** Content changes go through a developer. Cheapest, and fine if the
   site changes a few times a year.
2. **Extend the existing admin panel** to cover the high-churn things — room rates,
   offers, deals, hotel descriptions, and image swaps. Moderate work: each needs a
   table, an endpoint and a form. This is the option I would recommend; it covers
   ~80% of what clients actually ask to change.
3. **Move content into a CMS.** Largest change, most flexibility, ongoing cost.

This needs a decision before it can be quoted. Options 2 and 3 are both bigger
than everything else in this change order combined.

---

## 6. Registration is not working

**Most likely cause: `DATABASE_URL` is not set on Render, so the backend is
running on its in-memory store.**

`backend/src/db/index.ts:42` — when `DATABASE_URL` is absent the database falls
back to an in-memory store for zero-config local dev. On Render's free tier the
service spins down after ~15 minutes of inactivity. Every account, booking and
enquiry created since the last wake-up is gone when it restarts. To a guest that
is exactly "registration doesn't work": they sign up, come back later, and the
account does not exist.

`render.yaml` correctly declares `DATABASE_URL` with `sync: false`, which means
Render prompts for it — but only if someone actually provisions a Postgres
instance and pastes the connection string in.

**Five-minute check.** Hit the register endpoint twice with the same email:

```bash
curl -s -X POST https://<backend-host>/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Test User","email":"test@example.com","phone":"9876543210","password":"testpass123"}'
```

- **409 "already exists"** on the second call → the database is fine, look further
  down this list.
- **201 both times, or 201 after a redeploy** → in-memory store confirmed.
  Provision Postgres on Render, set `DATABASE_URL`, run `schema.sql`, redeploy.
- **503 "Sign-in is not configured"** → `SESSION_SECRET` is missing. `render.yaml`
  generates it, so this only happens if the service was created before that line
  existed.
- **500** → check the Render logs; the handler logs the real error.

**One real code issue regardless.** `src/pages/Register.tsx` navigates to
`/account` inside the submit handler, so `useForm` then calls `setDone(true)` on an
unmounted component. Harmless today but it means the success panel never shows and
any error after navigation is invisible. Cleaner:

```tsx
onSubmit={f.submit(async (v) => {
  await register({ fullName: v.fullName, email: v.email, phone: v.phone, password: v.password })
  await refreshSession()
})}
```

…and navigate from an effect once `f.done` is true, so a failure surfaces in
`FormError` instead of half-navigating.

**Please also tell me what the guest actually sees** — a red error message (and
what it says), a spinner that never stops, or an apparent success followed by
being unable to sign in. Each points somewhere different.

---

## 7. Restaurant image in Corporate Booking

**Location.** `src/pages/Corporate.tsx:21` — `const sideImg = corporateImages[1]`,
rendered at line ~57 with the label "Quadis Lobby". `corporateImages` is a glob
over `public/images/corporate/`, so `[1]` is whatever sorts second in that folder.

**Blocked on the client for the replacement image.** Please send the file (JPG or
WebP, at least 1600px wide, 4:3 or wider).

**Once supplied:** drop it in `public/images/corporate/` and reference it by name
rather than by index, so a future upload can't silently reshuffle the page:

```tsx
// src/data/images.ts
export const corporateFeature: string =
  corporateNamed('corporate-feature', corporateImages)
```

Also update the `label` and `alt` — they currently say "Quadis Lobby", which will
be wrong once the image changes.

---

## 8. Remove the ™ symbol

**Location.** `src/pages/About.tsx`, two lines:

```tsx
<h3 className="h3">Quadis Airlines<sup>™</sup></h3>   // line 125
<h3 className="h3">Quadis Homes<sup>™</sup></h3>      // line 138
```

**Fix.** Delete both `<sup>™</sup>`. Nowhere else in the codebase uses it —
`Home.tsx` and the Ecosystem paragraph are already clean.

Worth noting for the client's benefit: ™ asserts an unregistered trademark claim
over two ventures described on the same page as "upcoming". Removing it is the
right call.

**Acceptance:** no ™ anywhere in `src/`.

---

## 9. Quadis Homes before Quadis Airlines

**`src/pages/About.tsx:112–145`** — swap the two `<Reveal className="future-card">`
blocks inside the Future Horizons grid so Homes renders first. Straight cut and
paste, no other edits.

**`src/pages/Home.tsx` is already correct** — the "Beyond hospitality" grid has
Homes then Airlines.

**One more for consistency,** `src/pages/Home.tsx:204` — the Ecosystem paragraph
reads "…including **Quadis Airlines** and **Quadis Homes**." Swap to
"**Quadis Homes** and **Quadis Airlines**" so the order matches everywhere.

**Acceptance:** on /about-us and the homepage, Homes always appears before
Airlines, in cards and in prose.

---

## What I need from the client to unblock

1. **Extra-adult rate per night** — and whether it starts at the 3rd adult (item 3)
2. **Child age cut-off and child rate** — and whether children are free (item 4)
3. **The replacement restaurant image** for Corporate Booking (item 7)
4. **A decision on admin-editable content** — options 1, 2 or 3 (item 5)
5. **Phone screenshots** of anything that looks wrong on mobile, with the device
   named (item A)
6. **What the guest sees when registration fails** (item 6)

Items 1, 2, 8 and 9 can ship immediately. B and 6 are almost certainly the same
afternoon's work on the Render dashboard.
