# Commit instructions — Change Order #3

For whoever commits this work. Written 26 Jul 2026 against branch `main`,
last commit `e815846`. **Read §1 before running any `git add`.**

> **Superseded on 27 Jul 2026.** The four commits this document describes have
> landed. The loose files it names — `image copy 2.png`, `image.png`,
> `Greeting (3).zip` and the rest — have since been filed into
> `client-assets/briefs/` and `client-assets/zips/`, and `.gitignore` now covers
> them by pattern rather than by hand. The paths below are historical.
>
> §1 still holds and matters more than ever: `client-assets/briefs/` now holds
> the client's GoDaddy and Razorpay logins in plaintext.

State when these were written: 31 tracked files modified, 12 untracked files
added, nothing staged.

---

## 1. Never run `git add -A` or `git add .` here

There is an untracked file in the repo root that must **not** be committed:

```
image copy 2.png
```

It is a **WhatsApp screenshot of a conversation with the client** — their words,
their pricing, timestamps. It is not source. It is not ignored, so a blanket
`git add -A` sweeps it into the history, where removing it later means a rewrite.

Deal with it first, one of these two ways:

```bash
# Option A — it has served its purpose, delete it
rm "image copy 2.png"

# Option B — keep it locally, stop git ever seeing it
printf '\n# Client screenshots and scratch images (local reference only)\n/image*.png\n' >> .gitignore
```

Option B also catches the same trap in future. Note the repo *already* has
`image.png`, `image copy.png`, `Website Changes.pdf` and `Greeting (3).zip`
committed from earlier sessions — see §6.

**Use explicit paths for every `git add` below. No wildcards over the root.**

---

## 2. Do not commit

| Path | Why |
|---|---|
| `image copy 2.png` | Client WhatsApp screenshot. See §1. |
| `backend/.env` | Real Groq API key and Razorpay test keys. Already ignored by `backend/.gitignore:4` — **verify it stays ignored**, never `-f` it. |
| `.env`, `.env.production` (if you create them) | Will hold the live API URL. Ignored by `.gitignore`. |
| `dist/`, `backend/dist/` | Build output. Already ignored. |
| `node_modules/` | Already ignored. |

Verify nothing sensitive is staged before you commit:

```bash
git diff --cached | grep -inE "gsk_|rzp_(test|live)_|sk_live|PRIVATE KEY"
# must print nothing
```

At the time of writing this returns nothing for the full diff — no secret is in
any tracked file. Keep it that way.

---

## 3. Gate: do not commit red

All three must pass. If any fails, stop and report rather than committing.

```bash
# frontend
npx tsc --noEmit          # expect clean
npx vite build            # expect "✓ built"

# backend
cd backend
npx tsc --noEmit          # expect clean
npm test                  # expect: Test Suites: 12 passed, Tests: 102 passed
cd ..
```

102 backend tests is the number to match. It was 64 before this work.

---

## 4. What to commit, in four commits

Split by area so each commit builds on its own. **Do not attempt to split by
feature** — `backend/src/db/index.ts`, `src/pages/HotelDetail.tsx` and
`src/types.ts` each carry more than one feature, so a per-feature split needs
`git add -p` and is not worth the risk of a half-staged file.

If you would rather do one commit, that is acceptable — use the message from
commit 3 as the subject and list the rest in the body.

### Commit 1 — backend

```bash
git add backend/package.json \
        backend/src/app.ts \
        backend/src/data/seed.ts \
        backend/src/db/index.ts \
        backend/src/db/migrate.ts \
        backend/src/db/schema.sql \
        backend/src/lib/pricing.ts \
        backend/src/routes/admin.ts \
        backend/src/routes/bookings.ts \
        backend/src/routes/content.ts \
        backend/src/server.ts \
        backend/src/services/AIService.ts \
        backend/src/services/NotificationService.ts \
        backend/src/types.ts \
        backend/__tests__/occupancy.test.ts \
        backend/__tests__/adminContent.test.ts
```

```
Add occupancy pricing, admin editing, and a schema migration runner

Triple occupancy: a third adult adds 40% of that night's room rate, per
the client's rule. A child adds nothing at any age. The percentage and
the free-child age are per property and set from the admin panel; both
are frozen onto each booking so a later reprice cannot rewrite an
already-issued invoice. The chargeable count is always derived
server-side.

Admin editing: PATCH endpoints for property and room records, and a
site_content table for editable page copy. Room edits match on id only —
`deluxe-room` is a slug shared by every property, so matching on it would
let an admin editing one hotel silently reprice another.

schema.sql was never executed by anything, so pointing DATABASE_URL at a
real PostgreSQL instance produced a server that booted cleanly and then
failed every query with "relation does not exist". It now applies on
boot, idempotently, and the server exits rather than serving a
half-built schema. The build copies it into dist/.

38 tests added, 102 passing.
```

### Commit 2 — frontend

```bash
git add src/components/AdminEditor.tsx \
        src/components/BookingBar.tsx \
        src/components/CheckoutModal.tsx \
        src/components/ui.tsx \
        src/config/api.ts \
        src/data/auth.ts \
        src/data/content.ts \
        src/data/enquiries.ts \
        src/data/hotels.ts \
        src/data/stay.ts \
        src/lib/pricing.ts \
        src/pages/About.tsx \
        src/pages/AdminDashboard.tsx \
        src/pages/Corporate.tsx \
        src/pages/Home.tsx \
        src/pages/HotelDetail.tsx \
        src/pages/HotelsList.tsx \
        src/types.ts
```

```
Carry the guest's stay forward, split adults from children, fix client items

The booking bar wrote ?checkin=&checkout=&guests= and nothing read them:
the hotels list looked only at `city` and the hotel page initialised its
dates to empty, so a guest picked dates on the home page and was asked
again on the next screen. data/stay.ts is now the single definition of
how a stay is spelled in a URL, used by the bar, the list, the hotel page
and checkout. A stale or hand-edited URL cannot poison the page.

Adults and Children replace the single Guests field, with an age per
child. The quote itemises the extra-adult uplift before payment and
mirrors backend/src/lib/pricing.ts exactly.

BOOK NOW was clickable on a zero-night range: same-day was selectable, so
checkout opened claiming "1 Night" at zero and the server rejected the
hold. Check-out now starts the day after check-in and the CTA is disabled
until the dates make a real stay.

Client change order:
- Corporate Booking showed a restaurant photo labelled "Quadis Lobby";
  now an actual lobby, addressed by filename not list position
- removed the (tm) from Quadis Airlines and Quadis Homes on About
- About now lists Homes before Airlines, matching the home page

VITE_API_URL is now the documented way to point the bundle at the API,
and a failure says so instead of surfacing "Unexpected token '<'".
```

### Commit 3 — styles

```bash
git add src/styles/chrome.css src/styles/components.css src/styles/pages.css
```

```
Fix the mobile booking bar and two responsive defects

On a narrow screen the destination select took a full-width row above the
dates, pushing Check-in and Check-out down the page — the client's
complaint. The dates now come first on mobile via CSS `order`, leaving
the desktop row and the DOM/tab order unchanged.

Splitting Guests into Adults and Children made six fields in a
five-column grid, so SEARCH STAYS wrapped onto a row of its own. The
desktop bar is one row again, with a new tablet breakpoint at 1180px.

Also: inputs under 16px trigger iOS auto-zoom, which leaves the page
scrolled sideways with the bar half off-screen; stepper buttons were 34px
against a 44px accessible minimum; and the virtual-tour caption was a
fixed 280px centred on its pin, so near a screen edge it ran off the side
and body{overflow-x:hidden} clipped it rather than scrolling.
```

### Commit 4 — docs and config

```bash
git add .env.example changes.md docs/
```

`.env.example` is safe to commit — it holds no values, and `.gitignore:27`
(`!.env.example`) deliberately un-ignores it. Confirm with `git status` that it
is staged and that `backend/.env` is **not**.

```
Document deployment, the change order, and the image pipeline plan

DEPLOYMENT.md exists because "registration is broken" is not a code bug.
The frontend resolves the API to /api on its own domain in production,
but the frontend is a static S3 upload and the backend a separate
service, so every API call 404s. The hotels list falls back to bundled
static data, which is why the site looks healthy while sign-in, forms,
bookings, payments and the chatbot are all dead. Both fixes are written
out, with the curl check to prove it worked.

change-order-3.md answers the client's 11 items. image-pipeline-plan.md
scopes admin-managed photography, which also resolves the ~266MB
per-deploy image duplication.

changes.md is marked complete — it is Change Order #2 and already
shipped; without the note the next reader re-runs it.
```

---

## 5. After committing

```bash
git log --oneline -4
git status          # should be clean except the ignored screenshot
```

**Do not push to `main` without asking.** If a PR is wanted, branch first:

```bash
git switch -c change-order-3
git push -u origin change-order-3
```

---

## 6. Out of scope — do not bundle in

These are pre-existing and unrelated. Raise them separately; do not "tidy" them
into this work.

- `image.png`, `image copy.png`, `Website Changes.pdf` (8.5 MB), `Greeting (3).zip`
  are already tracked in the repo root from earlier sessions. `.git` is ~409 MB
  largely because of committed binaries. Removing them properly means rewriting
  history — a decision for the repo owner, not a drive-by commit.
- The image duplication (180 of 190 images ship twice, ~266 MB per deploy) and
  the missing SEO surface are documented but deliberately untouched here.

---

## 7. If something does not match

This document was written against a specific working tree. If `git status` shows
files not listed above, or the test count is not 102, **stop and report the
difference** rather than guessing which bucket a file belongs in. Committing the
wrong file is cheap to prevent and expensive to undo.
