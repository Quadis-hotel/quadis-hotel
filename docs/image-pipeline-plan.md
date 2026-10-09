# Project: admin-managed photography

Scope document, 26 Jul 2026. Requested as a follow-on to Change Order #3 item 5
("whatever a hotel admin should control should be editable from their end").

This is the one remaining thing an admin cannot change. It is a real project
rather than a change-order item, and it needs three decisions from you before
Phase 1 can start — see §6.

---

## 1. Why this is bigger than the text editor

Making copy editable was a table and a fallback. Images are not, because the
current system has no notion of an image *record* at all.

`src/data/images.ts` resolves photography by **globbing the filesystem at build
time**:

```ts
const files = import.meta.glob('/public/images/**/*.{jpg,jpeg,png,webp,avif}', { eager: true, ... })
```

Consequences that shape this project:

1. **Photos are addressed by folder convention, not by id.** `hotels/<slug>/hero.jpg`
   *is* the hero image. There is no row anywhere saying so.
2. **Adding a photo requires a rebuild and redeploy.** The glob runs in Vite, not
   in the browser.
3. **Assignment is implicit and lossy.** A property with fewer than five photos is
   padded from a shared pool, so a Lajpat Nagar room card can display a Noida
   room. (Flagged P1 in `Quadis-Audit-1.md`; still open. This project fixes it.)
4. **Nothing is optimised.** 121 files exceed 1 MB, 263 MB total, photographs
   stored as PNG, no thumbnails, no `srcset`.
5. **Every image ships twice.** Because the glob targets `public/`, Vite copies
   each file verbatim *and* emits a content-hashed duplicate into `dist/assets/`.
   180 of 190 images are byte-identical pairs — roughly 266 MB of dead weight per
   deploy, and the same photo served under two URLs so browser caches cannot
   share it.

Point 5 matters here: **this project also fixes the duplication and the
unoptimised assets.** Those were separately-reported problems; doing images
properly resolves all three at once. That is the argument for doing it now rather
than layering an uploader on top of the current scheme.

---

## 2. Target design

### Data

```sql
CREATE TABLE images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Storage key, not a URL: the CDN host must be swappable without a migration.
  storage_key   TEXT NOT NULL,
  alt_text      VARCHAR(300) NOT NULL DEFAULT '',
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  bytes         INTEGER NOT NULL,
  -- Set of generated derivatives: {"thumb":"...","md":"...","lg":"..."}
  variants      JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- What each image is FOR. One image can appear in several places.
CREATE TABLE image_placements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id    UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  -- 'property' | 'room_type' | 'banquet' | 'gallery' | 'page_section'
  subject_type VARCHAR(32) NOT NULL,
  -- property id, room_type id, or a section key like 'home.hero'
  subject_id   VARCHAR(128) NOT NULL,
  role         VARCHAR(32) NOT NULL DEFAULT 'gallery',  -- 'hero' | 'gallery'
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_placements_subject ON image_placements (subject_type, subject_id, role, sort_order);
CREATE UNIQUE INDEX idx_one_hero_per_subject
  ON image_placements (subject_type, subject_id) WHERE role = 'hero';
```

That last index is the fix for problem 3: a subject has at most one hero, and a
property's gallery is exactly the rows pointing at it. **No pool, no padding, no
other hotel's rooms.** A property with three photos shows three.

### Processing

On upload, generate derivatives once and store all of them:

| Variant | Longest edge | Format | Used by |
|---|---|---|---|
| `thumb` | 480px | WebP q75 | gallery grid, card thumbnails |
| `md` | 1200px | WebP q80 | detail galleries, section artwork |
| `lg` | 2000px | WebP q82 | hero, lightbox |
| `orig` | untouched | as uploaded | archival, re-processing |

`sharp` is the obvious dependency. Serve with `srcset`, so a phone downloads
`thumb` where it currently downloads a 3 MB PNG. Expected payload reduction on
the gallery page: **~270 MB → under 15 MB.**

### Reading

Replace the build-time glob with a runtime fetch, cached exactly like
`src/data/content.ts` already does for copy:

```ts
// GET /api/images?subject=property:prop-2  ->  ordered list with variants
```

Keep the existing `public/images/**` tree as the fallback for any subject with no
rows, so the site never regresses to empty frames while photos are migrated.
Same principle as the text editor: **the database enhances, it never blanks.**

---

## 3. Phases

Each phase is independently shippable and leaves the site working.

| # | Phase | Deliverable | Est. |
|---|---|---|---|
| 1 | Storage + upload | `POST /api/admin/images` (multipart, admin-only), sharp derivatives, S3 put, `images` rows. No UI yet — verified by tests + curl | 1–2 days |
| 2 | Placement API + admin UI | Assign/reorder/remove images per property, room, banquet, gallery. Drag-to-reorder, hero picker, alt-text field | 2–3 days |
| 3 | Frontend read path | `useImages()`, `srcset` everywhere, retire the glob, delete the padding fallback | 1–2 days |
| 4 | Migration | One-off script: ingest the existing 190 files, generate variants, write placements matching today's folder convention so nothing visibly changes | 1 day |
| 5 | Cleanup | Remove `public/images/**` from the bundle, kill the double-ship, add cache headers | 0.5 day |

Phases 1–3 are the feature. Phase 4 is what makes it safe to switch on. Phase 5
is where the 266 MB comes back.

### Guardrails (non-negotiable in Phase 1)

- **Admin-only.** `requireAdmin` on every write. An open image uploader is free
  hosting for whatever a stranger wants to serve from your domain.
- **Validate by content, not by filename.** Sniff the magic bytes; accept only
  JPEG/PNG/WebP/AVIF. A `.jpg` extension proves nothing.
- **Hard size cap** (10 MB) and a **pixel cap** (~50 MP) — a "decompression bomb"
  is a small file that expands to gigabytes in sharp and takes the server down.
- **Never serve from the upload path.** Store under a generated key, not the
  user's filename, so a name like `../../index.html` cannot escape.
- **Strip EXIF.** Guest-supplied or phone-shot photos carry GPS coordinates.

---

## 4. What this does not cover

- Video (`public/videos/Quadis.mp4`, 5.1 MB) stays a code-deployed asset.
- The logo/SVG marks stay in the repo; they are brand assets, not content.
- Section *layout* remains code. This is about which photo appears, not where.

---

## 5. Interim answer for the client

Until Phase 2 ships, the honest position is: *"Hotel details, room categories,
rates, occupancy rules and page text are all editable from the admin panel today.
Photography still goes through the developer — an upload feature is scoped and
ready to start."*

Adding a photo today: drop it into `public/images/<subject>/`, matching the
existing naming, then rebuild and redeploy.

---

## 6. Decisions needed before Phase 1

1. **Where do the files live?** S3 bucket (recommended — you are already on AWS;
   needs a bucket name, region, and an IAM user with `s3:PutObject` scoped to it)
   or a persistent disk on the backend host (simpler, but Render's free tier has
   no persistent disk, so uploads would vanish on redeploy).
2. **Served how?** CloudFront in front of the bucket (recommended, and it pairs
   with the `/api` routing fix in `DEPLOYMENT.md` §1) or direct public-read S3
   URLs.
3. **Who uploads?** Reusing the single shared admin PIN means every uploaded file
   is attributable to "admin". If you want per-staff accounts and an audit trail,
   that is a small additional piece — worth deciding now rather than retrofitting.

Nothing else is blocking. Once §6 is answered I can start Phase 1.
