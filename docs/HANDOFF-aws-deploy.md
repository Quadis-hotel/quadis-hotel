# Handoff — Quadis AWS deployment

Everything an agent needs, in priority order. Verified against the live account
on 27 Jul 2026; where reality differs from the original plan, this file records
reality.

**Part 1 is urgent — the website is currently blank.** Parts 2 and 3 are the
work that follows. Part 4 is what is blocked on the client, listed so nobody
burns time trying.

---

## Account facts

| Thing | Value |
|---|---|
| AWS account / region | `093650262440` / `us-east-1` |
| Repo | `/home/divyansh-rawat/Quadis`, branch `main`, pushed |
| EB application / environment | `quadis-backend` / `quadis-backend-live` |
| API endpoint | `http://quadis-backend-live.eba-ekdyt4m3.us-east-1.elasticbeanstalk.com` (**HTTP only**) |
| Deployed version | `co3-7140ed6` — stale, see Part 1 |
| RDS | `quadis-db-live`, Postgres 18.3, db.t3.micro — migrated and seeded, 9 properties / 20 room types / 197 keys |
| Frontend bucket | `quadis-hotels-test-co3` → `http://quadis-hotels-test-co3.s3-website-us-east-1.amazonaws.com` |
| Photo bucket | `quadis-hotel-images` — public-read, uploads verified working |
| EB instance SG | **`sg-07e7ba582065ed9e8`** — corrected 31 Jul. This row previously said `sg-0f03fb094dfbada9c`, which is the **load balancer**, and applying it is what caused incident 3. See AGENTS.md §3. |
| RDS SG | `sg-03e1c65d4487ac04a` — this one is correct |

Already set on the environment, do not re-send: `SESSION_SECRET`,
`ADMIN_PASSWORD`, `DATABASE_URL`, `CORS_ORIGIN`, `IMAGE_BUCKET`, `AWS_REGION`,
`ADMIN_PIN`, `GROQ_API_KEY`. IAM policy `quadis-hotel-images-rw` is attached to
`aws-elasticbeanstalk-ec2-role`.

---

# PART 1 — URGENT: the site is blank

## Why

node-postgres returns `NUMERIC` as a **string**, because the type is
arbitrary-precision — and every price, rate and rating in this schema is
`NUMERIC`. Connecting the real database made the API serve:

```json
"base_price": "1500.00",  "rating": "4.60"
```

The frontend calls `rating.toFixed(1)`. On a string that throws
`toFixed is not a function`, React unmounts, every page renders blank.

The quieter half is worse: `hotel.price + roomOffset` **concatenates** when
price is a string, so a ₹1,500 room with a ₹1,000 upgrade quotes `"15001000"`
instead of 2500 — a wrong price on a booking page, with nothing to surface it.

Nothing caught it. The in-memory store holds real numbers, so local development,
CI and every test passed while production was white. It only exists against
PostgreSQL.

Fixed in **`809b0d6`**, which patches *both* halves — type parsers on the
backend and coercion on the frontend. That is why both must be redeployed.

## 1.1 Redeploy the backend

```bash
cd /home/divyansh-rawat/Quadis
git pull origin main          # must include 809b0d6

cd backend
npm install
npm run build

VER="co3-$(git rev-parse --short HEAD)"
zip -qr "/tmp/$VER.zip" dist package.json package-lock.json Procfile .ebextensions -x "*.map"

aws s3 cp "/tmp/$VER.zip" "s3://elasticbeanstalk-us-east-1-093650262440/$VER.zip"

aws elasticbeanstalk create-application-version \
  --application-name quadis-backend --version-label "$VER" \
  --source-bundle S3Bucket=elasticbeanstalk-us-east-1-093650262440,S3Key=$VER.zip

aws elasticbeanstalk update-environment \
  --environment-name quadis-backend-live --version-label "$VER"
```

No `--option-settings`. Every variable is already set and re-sending risks
clobbering one.

Do not zip `node_modules` — `sharp` ships platform-specific binaries and
Beanstalk must build them on Amazon Linux.

## 1.2 Rebuild and re-upload the frontend

Required, not optional. Half the fix lives in the bundle.

```bash
cd /home/divyansh-rawat/Quadis

# Must be the CloudFront origin, not the Elastic Beanstalk URL. EB is plain HTTP,
# and the site is served over HTTPS — baking the EB URL in gets every API call
# blocked as mixed content, in the browser only. curl will not show it.
VITE_API_URL=https://djqj43186y3yh.cloudfront.net/api \
  npm run build

printf 'User-agent: *\nDisallow: /\n' > dist/robots.txt   # test bucket, never index it
rm -f dist/sitemap.xml

B=quadis-hotels-test-co3
aws s3 sync dist/ "s3://$B/" --delete --only-show-errors \
  --exclude index.html --exclude robots.txt \
  --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$B/index.html" --only-show-errors \
  --cache-control "no-cache,must-revalidate" --content-type "text/html; charset=utf-8"
aws s3 cp dist/robots.txt "s3://$B/robots.txt" --only-show-errors \
  --cache-control "no-cache" --content-type "text/plain; charset=utf-8"
```

## 1.3 Verify — a healthy API proves nothing here

The previous deploy was `Ready / Green` with a 200 health check while every page
was white. Check in this order.

```bash
API=http://quadis-backend-live.eba-ekdyt4m3.us-east-1.elasticbeanstalk.com
curl -s "$API/api/properties" | grep -o '"base_price":[^,]*' | head -3
#  want "base_price":1500      NOT "base_price":"1500.00"
curl -s "$API/api/properties" | grep -o '"rating":[^,]*' | head -3
#  want "rating":4.6           NOT "rating":"4.60"
```

**Then open a browser** at
`http://quadis-hotels-test-co3.s3-website-us-east-1.amazonaws.com/hotels`

- Hotel cards visible. A blank cream page means the fix did not reach the
  bundle — rebuild the frontend.
- Console free of `toFixed is not a function`.
- Prices read `₹3,000 / night`, not `₹3000.00`, not `₹15001000`.

A browser is mandatory. `curl` cannot see a React crash, and CORS failures only
occur in a browser — requests without an `Origin` header pass regardless.

---

# PART 2 — security, do next

## 2.1 Close the database to the internet

`quadis-db-live` is `PubliclyAccessible` with **5432 open to `0.0.0.0/0`**. A TCP
connection from an ordinary laptop succeeds. The only thing protecting guest
names, phone numbers and booking records is the password.

> **DO NOT RUN THIS — it is already applied, and one value in it was wrong.**
> AGENTS.md §3 records RDS 5432 as already restricted to the instance SG, so
> re-running the revoke fails with `InvalidPermission.NotFound` and the
> authorize just adds a redundant rule.
>
> The original block passed `--source-group sg-0f03fb094dfbada9c`. **That is
> the load balancer, not the instances.** Granting RDS access to the LB cuts
> the app off from its own database while health checks keep passing and every
> data call hangs for forty seconds — incident 3, verbatim. Corrected below,
> kept for the record.

```bash
# Allow only the Beanstalk INSTANCES. Note the source group: sg-07e7ba58…,
# not sg-0f03fb09… — the latter is the load balancer and is the trap.
aws ec2 authorize-security-group-ingress --group-id sg-03e1c65d4487ac04a \
  --protocol tcp --port 5432 --source-group sg-07e7ba582065ed9e8

# Then remove the world.
aws ec2 revoke-security-group-ingress --group-id sg-03e1c65d4487ac04a \
  --protocol tcp --port 5432 --cidr 0.0.0.0/0
```

Better still, resolve it rather than copy it — the literal ID is what goes
stale:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:elasticbeanstalk:environment-name,Values=quadis-backend-live" \
  --query 'Reservations[].Instances[].SecurityGroups[].GroupId' --output text
```

Order matters — add the replacement before removing the old rule, or the running
app loses its database.

Ports **80** and **3001** are open to `0.0.0.0/0` on the same group and should
also be reviewed. 3001 in particular should not be reachable directly; nginx
proxies to it on localhost.

After this, `psql` from a laptop stops working. That is the point. Use a bastion
or a temporary rule when direct access is genuinely needed.

## 2.2 Verify the database certificate

`backend/src/db/index.ts` connects with `rejectUnauthorized: false` — encrypted,
but the server certificate is not checked, so an active man-in-the-middle is not
ruled out. Ship Amazon's RDS root CA and point `ca` at it:

```
https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

Read the comment above `sslFor()` first — it explains why the setting exists and
what it does and does not protect against.

---

# PART 3 — remaining work

Roughly in the order it is worth doing.

## 3.1 Put CloudFront in front of the frontend

Fixes three problems at once, and the free tier covers this traffic:

- **HTTPS.** The site is HTTP-only today. Any HTTPS frontend would block the
  HTTP API call as mixed content, so this and the API must move together.
- **Deep links return HTTP 404.** S3 `ErrorDocument` serves `index.html` but
  keeps the 404 status, so a crawler sees 404 on all nine hotel pages.
  CloudFront rewrites it to 200.
- **Image bandwidth.** S3 egress is roughly $0.09/GB and the site ships heavy
  images.

Route `/api/*` to the Beanstalk origin and everything else to the bucket. That
also removes the need for `CORS_ORIGIN`, since the frontend becomes same-origin.

## 3.2 Optimise the bundled images

**558 MB across 412 objects**, single PNGs up to 3.45 MB. Newly uploaded photos
are already resized to WebP on upload; this is the pre-existing set under
`public/images/`. See `docs/image-pipeline-plan.md`.

## 3.3 Add the /cancellation-policy page

The client supplied the full text — it is in
`client-assets/briefs/2026-07-27-cancellation-and-refund-policy.txt`. Razorpay
requires it publicly visible before approving the account, so this blocks
payments going live. Pure frontend work, no dependencies.

## 3.4 Delete the stale buckets

Three `quadis-hotels-frontend-*` buckets from 25–26 July, two publicly readable,
left over from earlier deploy attempts. Confirm they are unused, then remove.

## 3.5 Test the booking flow end to end against the live database

Two production-breaking bugs surfaced within an hour — the TLS refusal and the
numeric strings — and **both** were invisible until a real database was
attached. Local development, CI and 102 passing tests all reported healthy while
production was down. Assume a third exists.

Walk a real booking: search, select a room, hold, pay, receive the invoice.
Nothing in the automated suite exercises that path against PostgreSQL.

---

# PART 4 — blocked on the client, do not attempt

Listed so no one wastes time.

- **Razorpay is `rzp_test_simulated`.** No real payment can be taken. Live keys
  must come from the client's own account, via team access rather than a shared
  password.
- ~~**The third-person charge is unconfirmed.**~~ **RESOLVED 27 Jul 2026.**
  She confirmed **30%** for an extra adult, and children are **not** free —
  three bands: under 8 free, 8–12 at **20%**, 13+ charged as an adult. The
  "children free" half of this bullet was wrong and under-billed every child
  aged 8 or over. AGENTS.md §2 rule 3 is binding; it still decides what guests
  are billed, so it still needs a written answer before it changes again.
- **Photo storage.** The client is choosing between Cloudinary and S3.
  `ImageStore` is an interface with `S3ImageStore` behind it, so switching is
  two methods and an env var. Do not hard-wire either.
- **The PMS question.** Whether "Book Now" stays on our site or redirects to the
  vendor's booking engine is unanswered. If it redirects, CheckoutModal,
  RazorpayService, InvoiceService and the soft-hold engine all stop being used.
  **Do not build anything further in booking or payments until this is settled.**

---

# Traps

- **Never sync `dist/` to `quadis-hotel-images`.** The frontend bucket is synced
  with `--delete`; aiming that at the photo bucket erases every uploaded photo.
  They are separate buckets for exactly this reason.
- **Never upload `client-assets/`.** It holds the client's GoDaddy and Razorpay
  logins in plaintext. It is gitignored and must never reach a bucket.
- **Do not commit generated secrets.** `ADMIN_PASSWORD` and the RDS password
  live in the Beanstalk config and nowhere else.
- **`Ready` is not `working`.** Always finish with a browser check.

# Not in scope

**Do not touch DNS.** `quadishotels.com` still points at the client's existing
host, and its nameservers are at theserverindia, not GoDaddy — so the zone,
including the Google MX records, is served by the web host. Repointing
nameservers without recreating those records takes the client's email down.
Everything deployed here is a test bucket. See `docs/dns-cutover.md`.
