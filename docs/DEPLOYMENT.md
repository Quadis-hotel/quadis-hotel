# Quadis — deployment and configuration runbook

Written 26 Jul 2026, alongside Change Order #3.

This document exists because of one specific failure: **the client reported that
user registration does not work.** Registration is not broken. The API is not
reachable from the deployed frontend. The same root cause disables sign-in,
every enquiry form, bookings, invoices, the chatbot, and payments.

Read §1 before anything else.

---

## 1. Why the live site's forms do nothing

The frontend is a static bundle. `src/config/api.ts` decides where the API is:

| Situation | API base URL used |
|---|---|
| `VITE_API_URL` set at build time | that value (correct) |
| localhost / 127.0.0.1 | `http://localhost:3001/api` |
| **anything else** | **`/api` on the current domain** |

The third row is the problem. `docs/AWS_DEPLOYMENT_GUIDE.md` uploads the frontend
to an S3 bucket and deploys the backend as a *separate* Elastic Beanstalk
application, with CloudFront marked "(Optional)". **An S3 bucket does not serve
`/api`.** Every API call returns the bucket's 404 or, with SPA rewrites on, the
`index.html` document.

That failure is silent by design in one place and one place only: `useHotels()`
falls back to `STATIC_HOTELS`, which is bundled. So the hotel list, prices and
photos all render and the site looks healthy. Everything that *has* to reach the
server just fails:

- Register / Sign in → "Request failed"
- Contact, banquet, corporate enquiry forms → error on submit
- Booking / checkout / Razorpay → cannot create a hold
- Quadis Assist chat → no reply
- `/admin` → cannot sign in

**Two ways to fix it. Pick one.**

### Option A — point the frontend at the backend directly (simplest)

1. Deploy the backend somewhere with a public HTTPS URL (see §2).
2. Create `.env.production` in the repo root:
   ```
   VITE_API_URL=https://your-backend-host/api
   ```
3. On the backend, allow the site's origin:
   ```
   CORS_ORIGIN=https://quadishotels.com,https://www.quadishotels.com
   ```
   Both are required — without `CORS_ORIGIN` the browser blocks the response
   even though the server answered.
4. `npm run build` and re-upload `dist/`.

   > **Not `scripts/aws-deploy.sh`** — that is retired as of 31 Jul and refuses
   > to run. It targeted a bucket that has since been deleted, in `us-east-1`.
   > Production is one EC2 box in `ap-south-1`:
   > `./deploy/build-artifact.sh && ./deploy/push.sh`. See AGENTS.md §3b.

### Option B — proxy `/api` on the same domain (no CORS needed)

Put CloudFront in front of both and add a second origin:

| Behaviour path | Origin |
|---|---|
| `/api/*` | the backend host |
| `/*` (default) | the S3 bucket |

On the `/api/*` behaviour: forward all headers, query strings and cookies, and
set caching to disabled. Leave `VITE_API_URL` unset. This is the better setup —
same-origin means no CORS and no preflight round-trip.

**Verify either option before telling the client it is fixed:**

```bash
curl -s https://your-site/api/health
# expect: {"success":true,...,"status":"healthy"}
```

If that returns HTML, the routing is still wrong.

---

## 2. Backend environment variables

The server **fails closed** on missing secrets — it returns 503 rather than
issuing forgeable tokens or exposing guest data. So a missing variable shows up
as a broken feature, not a crash.

| Variable | Required? | What breaks without it |
|---|---|---|
| `DATABASE_URL` | **Yes, in production** | Falls back to in-memory: **every booking, account and enquiry is lost on each restart and redeploy** |
| `SESSION_SECRET` | **Yes** | `/api/auth/register` and `/login` return 503 — "Sign-in is not configured". Registration appears broken |
| `ADMIN_PASSWORD` | **Yes** | All `/api/admin/*` return 503; the dashboard cannot load |
| `ADMIN_PIN` | **Yes** | Staff cannot exchange a PIN for the admin token |
| `CORS_ORIGIN` | Only for Option A | Browser blocks every cross-origin API response |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` | For real payments | Checkout runs in simulated mode and takes no money |
| `RAZORPAY_WEBHOOK_SECRET` | For real payments | Confirmations cannot be verified, so bookings never confirm |
| `GROQ_API_KEY` | Optional | Chatbot uses its deterministic fallback |
| `META_WHATSAPP_TOKEN` / `META_PHONE_NUMBER_ID` | Optional | WhatsApp receipts are logged, not sent |
| `NODE_ENV=production` | **Yes** | **See the warning below** |

### `NODE_ENV` must be `production`

Two safety gates key off it:

- `backend/src/routes/webhooks.ts` — when `NODE_ENV !== 'production'`, a webhook
  with `x-razorpay-signature: simulated` skips signature verification. In
  production that would let anyone confirm any booking with a plain POST.
- `backend/src/middleware/auth.ts` — when `NODE_ENV === 'test'`, `requireAdmin`
  is bypassed entirely.

All four deploy configs in this repo set it (`render.yaml`, `backend/Dockerfile`,
`backend/.ebextensions/01_env.config`, `backend/ecosystem.config.js`). If you
deploy by any other route, set it yourself.

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # ADMIN_PASSWORD
```

---

## 3. Database

`DATABASE_URL` must be a real PostgreSQL connection string. Anything else — or
the literal `in-memory` — puts the server in its in-memory store, where all data
is lost on restart.

The schema now applies itself. `backend/src/db/migrate.ts` runs `db/schema.sql`
on every boot; it is written to be idempotent (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`), so it is both the initial setup and the migration
path. If it fails, the server exits rather than serving queries against a
half-built schema.

> Before this change, `schema.sql` was never executed by anything. Pointing
> `DATABASE_URL` at a fresh PostgreSQL instance produced a server that started
> cleanly and then failed every query with "relation does not exist".

---

## 4. Payments — going live

The integration is complete: `CheckoutModal` loads Razorpay's checkout.js,
creates a server-side order, opens Razorpay, then **polls the server** until the
webhook confirms payment. It never marks a booking paid on the client's word.

To take real money:

1. Complete Razorpay KYC and get **live** keys (`rzp_live_…`).
   `backend/.env` currently holds `rzp_test_…` keys, so checkout is in test mode.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the backend.
3. In the Razorpay dashboard → Settings → Webhooks, add:
   - URL: `https://your-backend-host/api/webhooks/razorpay`
   - Events: `payment.captured`, `order.paid`, `payment.failed`
   - Copy the signing secret into `RAZORPAY_WEBHOOK_SECRET`.
4. Confirm §1 works first. **Payments cannot work until the API is reachable** —
   these are the same problem, not two.

Test the whole path with a ₹1 booking on live keys before handing over.

---

## 5. What the admin can now edit

`/admin` → sign in with `ADMIN_PIN`. Three editing tabs were added in Change
Order #3:

- **Edit hotels** — name, address, phone, WhatsApp, email, base rate, rating,
  weekend surcharge, and live/paused. The rate set here is the rate a guest is
  quoted *and charged*.
- **Edit rooms & rates** — per room category: name, size, bed type, max guests,
  rate above base, breakfast and all-meals supplements, room count, bookable.
- **Edit website text** — the copy blocks registered in `src/data/content.ts`.
  An empty box means "use the built-in wording"; the placeholder shows what that
  is.

**Requires `DATABASE_URL`.** In in-memory mode edits apply but are lost on
restart.

Still code-only, and needing a developer + redeploy:

- Photography (`public/images/**`) — there is no image upload pipeline
- Page structure and section order
- Offers, testimonials, partner logos, the NCR map
- Adding or removing a property (the fields of existing ones are editable)

To make another string editable: add it to `DEFAULT_CONTENT` in
`src/data/content.ts` with its current text, then replace the literal in the
component with `t('your.key')`. It appears in the admin panel automatically.

---

## 6. Occupancy pricing — set from the admin panel

Both figures are per property and set by the hotel at `/admin` → Edit hotels →
Occupancy & extra guests. No code change is needed to reprice.

The rule, in the client's own words (WhatsApp, 26 Jul 2026):

> "Double occupancy room ka 40% increase hoga triple mein"
> "And agar teesra person adult hain only then"
> "If it's child then no"

**SUPERSEDED 27 Jul 2026.** The quotes above are the client's *first* answer and
the rule below is what actually ships. She revised it on 27 Jul into three age
bands, and AGENTS.md §2 rule 3 records that revision as binding. Do not price
anything off the quotes above.

As implemented — verified against `backend/src/lib/pricing.ts:50-74`,
`backend/src/db/schema.sql:30-35`, every row of `backend/src/data/seed.ts`, and
the live API:

- Every advertised rate covers **2 adults per room**.
- A third **adult** adds **+30% of that night's room rate**
  (`extra_adult_percent`, editable per hotel). Two extra adults add +60%.
- Children are **three bands**, not free-at-any-age:
  - **under 8** — free (`child_free_under_age` = 8)
  - **8 to 12** — **+20%** of the room rate (`child_percent` = 20)
  - **13 and over** — charged as an adult (`adult_from_age` = 13)
- It is a percentage, not a flat sum, so it tracks the room rate and the weekend
  surcharge automatically: a triple on a surcharged Friday is 40% above *that
  Friday's* double, not above a weekday rate.
- The uplift is rounded to **whole rupees per night** — 30% of ₹1,599 is ₹479.70
  and the guest is quoted ₹480, so totals never show fractional rupees.
- Charged **once per extra adult**, not per room: one extra person occupies one
  extra bed however many rooms the booking spans.
- Occupancy counts across the whole booking, so 3 adults in 2 rooms are inside
  the 4 included places and pay nothing extra.

Worked example — Deluxe at ₹1,599, one night:

| Party | Total |
|---|---|
| 2 adults | ₹1,599 |
| 2 adults + 1 child **under 8** | ₹1,599 |
| 2 adults + 1 child **aged 8–12** | ₹1,919 &nbsp;(1,599 + 320) |
| 2 adults + 1 child **aged 13+** | ₹2,079 &nbsp;(priced as an adult) |
| 3 adults | ₹2,079 &nbsp;(1,599 + 480) |
| 4 adults | ₹2,559 &nbsp;(1,599 + 960) |

Stored on `properties.extra_adult_percent`, `child_free_under_age`,
`child_percent` and `adult_from_age` — all four editable per hotel from the
admin panel, defaulting to **30 / 8 / 20 / 13**. The constants in
`backend/src/lib/pricing.ts` and `src/lib/pricing.ts` are only those fallbacks
— not the live figures.

**The uplift is frozen onto each booking** (`bookings.extra_adult_percent` and
`extra_adult_charge`). Repricing a property affects future bookings only; it
cannot retroactively change what an already-issued invoice says.

The count that prices a stay is always re-derived server-side, so a crafted
request cannot skip the charge. `backend/__tests__/occupancy.test.ts` covers all
of the above, including that an admin-set percentage is what actually gets charged.

