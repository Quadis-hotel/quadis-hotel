# Migrating to the client's AWS account

> **READ THIS FIRST — 31 Jul 2026. Parts of this file are history, not a plan.**
>
> **The build is DONE.** Her account `266877689020` runs one **`t3.medium`** EC2
> box in `ap-south-1` with an Elastic IP, Postgres on the instance, and S3 for
> photos. The app is deployed and serving. See AGENTS.md §3b.
>
> So: **"Decisions to make before building anything" below is decided**, and the
> Order-of-work steps that describe standing up **Beanstalk, a fresh RDS, or a
> CloudFront distribution are superseded** — AGENTS.md §4 rejected that shape.
> Following them now would build a second, parallel stack on a paid account.
>
> **Still binding, and the reason to keep this file:** the CLI-access section,
> everything about **DNS, the mail records and the DKIM/DMARC warning**, the
> environment-variable table, and the Razorpay notes. The zone itself is now
> captured record-by-record in `docs/dns-zone-live-capture.txt`.
>
> Deploy procedure today: `deploy/build-artifact.sh` → `deploy/push.sh`, and
> `deploy/cutover.sh` on the day DNS moves.

Written 29 Jul 2026 so this can be picked up cold. Everything below was read off
the live account, not assumed.

**No credentials in this file, or anywhere in this repo.** Access keys live in
`~/.aws/credentials` only. Account IDs are not secret; keys are.

---

## Where things run today

The builder's account. Free Tier — the July bill is effectively zero, which is
why everything is the smallest possible size.

| Thing | Value |
|---|---|
| Account / region | `093650262440` / `us-east-1` |
| Frontend bucket | `quadis-hotels-test-co3` (S3 **website** endpoint) |
| Photo bucket | `quadis-hotel-images` |
| CloudFront | `E1ZV1EQ1QRKH08` → `djqj43186y3yh.cloudfront.net` |
| EB app / env | `quadis-backend` / `quadis-backend-live` |
| EB instance | `t3.micro` — 2 vCPU, **1 GiB** |
| RDS | `quadis-db-live`, Postgres 18.3, `db.t3.micro`, 20 GB, single-AZ |
| RDS data | 9 properties, 20 room types, 197 keys, plus any real bookings |

Also on that account and **not** part of the app:
`aws-cloudtrail-logs-…`, `elasticbeanstalk-us-east-1-…`.

---

## Decisions to make before building anything

**1. Region. Recommend `ap-south-1` (Mumbai).** Everything is in `us-east-1`
today. The hotels are in Delhi and Noida and so are the guests. Moving accounts
is the one moment changing region is nearly free — afterwards it is a second
migration.

**2. Instance size. `t3.small` minimum, not `t3.micro`.** 1 GiB is what wedged
the API for 30 minutes on 29 Jul (AGENTS.md incident 6). On the client's account
there is no Free Tier reason to accept it. `backend/.ebextensions/02_swap.config`
adds swap and should still ship, but it is a safety net, not a substitute.

**3. ~~Does her account still have Free Tier?~~ ANSWERED 31 Jul — and it was
not a cost detail, it was a hard blocker.** Her account was on the AWS **Free
plan**, which (a) refuses `ModifyInstanceAttribute` with
`FreeTierRestrictionError`, so the box could not be resized past `t3.small`,
(b) blocks Reserved Instances, and (c) **closes the account automatically** when
the plan ends — hers was dated **29 Jan 2027**, which would have deleted the
site and its database. It is now on the **Paid** plan; the upgrade is one-way
and her **$99.47 of credits survived it**. Full detail in AGENTS.md §3b.

---

## CLI access

```bash
aws configure --profile quadis-client      # her keys, prompted, not stored here
aws sts get-caller-identity --profile quadis-client
```

**Already done — verified 30 Jul.** The `quadis-client` profile is configured and
works:

| | |
|---|---|
| Her account | `266877689020` |
| IAM user | `Quadishotels` |
| Permissions | `AdministratorAccess` + `IAMUserChangePassword` |
| Contents | **empty** — 0 EC2, 0 RDS in both `us-east-1` and `ap-south-1`, no S3 buckets |
| `ap-south-1` | enabled and reachable |

So **nothing further is needed from her to start building on AWS.** Access is
not the blocker; the hosting-shape decision is. Two things we cannot see from
the CLI and should confirm with her before spending:

1. **Whose card is on the account**, and that it is valid. It must be the
   company's, not the builder's — §2 of AGENTS.md, same reasoning as Razorpay.
2. ~~**Whether the account is still inside its 12-month free tier.**~~
   **Answered 31 Jul — it was on the Free plan, which is now upgraded to Paid.
   See decision 3 above; it blocked the instance size and would have closed the
   account in January.**

Also: our key is an IAM user with full admin on her account. It has to be
deleted when the engagement ends, and she should have MFA on root.

Then every command takes `--profile quadis-client`. Keep the default profile
pointed at the builder account so the two are never confused — the whole
migration involves both at once, and a mis-targeted `aws s3 sync --delete` is
unrecoverable.

Read-only checks first. Create nothing until `get-caller-identity` shows the
account you expect.

---

## Order

Steps 1–3 are reversible and touch no live traffic. Step 5 is the one with teeth.

1. **Rebuild on her account** — chosen region, `t3.small`, fresh RDS, run
   `migrate.ts` and the seed. Set every environment variable (list below).
2. **Verify on the new CloudFront URL** — the §6 checks in AGENTS.md, plus a
   real browser walk. Nothing has touched DNS yet, so the live site is unaffected.
3. **Copy the photo bucket** — `quadis-hotel-images` holds admin-panel uploads,
   which are not in git and not reproducible from the repo.
4. **Export the DNS zone from theserverindia and diff it.** See below.
5. **Switch nameservers.**
6. **Test mail immediately** — send *and* receive on `info@quadishotels.com`,
   then again the next day.
7. **Test payment on the real domain.**
8. **Keep the old hosting paid 2–3 weeks.** Propagation is uneven.
9. Only then tear down the builder account, and rotate the Razorpay keys and
   admin password afterwards.

---

## DNS — the part that can break her business

`quadishotels.com` today, verified 29 Jul:

```
A     quadishotels.com  ->  115.124.108.190      (theserverindia, IIS/ASP.NET/Plesk)
NS    yellow1.theserverindia.com, yellow2...
MX    1 smtp.google.com                          (Google Workspace)
```

`quadishotel.com` — singular — does not resolve at all. No A, no NS, no MX. The
domain is the plural one.

**CloudFront has no static IP, so an apex A record cannot point at it.** Apex →
CloudFront needs an ALIAS, which in practice means Route 53. That rules out the
low-risk path in `docs/dns-cutover.md` ("change one A record, touch nothing
else") and forces a nameserver move, which relocates the whole zone.

Every record has to exist in the new zone **before** the switch:

```
@          A      -> CloudFront ALIAS (was 115.124.108.190)
www        CNAME  quadishotels.com.
mail       A      115.124.108.190
webmail    A      115.124.108.190
ftp        CNAME  quadishotels.com.
blog       A      115.124.108.190
api        A      115.124.108.190
booking    A      115.124.108.190

MX   1  smtp.google.com                    <-- her email dies without this
TXT  v=spf1 a mx include:websitewelcome.com include:_spf.google.com
     include:Yellow.theserverindia.com ~all
TXT  google-site-verification=tx0Bc_a9v1k8qT6UHjQ716HZvDHpLwFt5VFYZjA0u3Y
TXT  google-site-verification=c8NaV2tMxsnJt69f5Wto3bILWNlsYcz1NMDpUcewLP4

TXT  default._domainkey  v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…
TXT  _dmarc              v=DMARC1; p=quarantine; adkim=r; aspf=r
```

**The DKIM and DMARC lines were added 30 Jul** — this list was wrong until then,
and wrong in the worst direction. DMARC is `p=quarantine`: recreate the zone
without DKIM and her mail keeps *delivering*, into spam, with no bounce to tell
anyone. That is harder to notice than mail simply stopping, and it decays her
sending reputation while it happens.

`default` was found by guessing common selector names. Other selectors may
exist. **This is not a substitute for the zone export.**

Two more things read off the live host on 30 Jul, both of which contradict what
is written below:

- **`www` is canonical, not the apex.** `quadishotels.com` 301s to
  `www.quadishotels.com` on both HTTP and HTTPS. The plan below points the apex
  at CloudFront and CNAMEs `www` to it, which inverts her current setup.
  Whatever we cut over to has to serve `www` as primary.
- **The zone was edited 23 Jul 2026** (SOA serial `2026072302`) and her homepage
  was modified 22 Jul. The old host is actively maintained, not abandoned. The
  SOA contact is `websolvo5@gmail.com` — that is the zone administrator, and we
  have been chasing "the old designer" without a name.

**Before any of this runs, read AGENTS.md §3a.** 63 of her 74 indexed URLs 404
against the current routes. DNS is not the only thing that has to be ready.

That list is what a public resolver can see. **Get the real zone export from
theserverindia and diff it** — DKIM selectors under `_domainkey`, autodiscover
records and any subdomain not guessed above will not show from outside.

`mail`, `webmail`, `blog`, `api` and `booking` currently point at the old host
and should keep doing so unless someone decides otherwise. Note `booking.` has
had an expired certificate since 18 Apr 2026, so it is almost certainly dead —
see AGENTS.md §5 — but leaving the record intact costs nothing.

---

## Environment variables to recreate

Names only. Values come from the password manager, not from here.

```
DATABASE_URL           new RDS endpoint
CORS_ORIGIN            MUST become https://www.quadishotels.com at cutover
                       — WITH the www. Her canonical host is www and the apex
                       301s to it, so every browser request carries
                       Origin: https://www.quadishotels.com. Setting the bare
                       apex here is incident 5 exactly: reads fine, checkout
                       dead, and curl cannot see it because it sends no Origin.
                       Safest is to allow both hosts.
RAZORPAY_KEY_ID        rzp_live_… (must start rzp_live_, see below)
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
ADMIN_PASSWORD         regenerate, do not copy
ADMIN_PIN              regenerate, do not copy
SESSION_SECRET         regenerate, do not copy
GROQ_API_KEY
IMAGE_BUCKET           new photo bucket name
AWS_REGION, NODE_ENV=production, PORT=3001
```

Also re-point the **Razorpay webhook** at the new URL, and re-set the same
webhook secret. `docs/razorpay-golive.md` has that procedure.

---

## Two traps carried over

**Razorpay rejects unregistered domains.** The ₹2 test on 29 Jul failed with
*"Business – Website mismatch"* because only `quadishotels.com` is Approved and
we serve from `djqj43186y3yh.cloudfront.net`. The good news: **the cutover fixes
payment for free** — the real domain is already approved, so no throwaway
CloudFront approval is needed.

**A real test key passes our own check.** `RazorpayService` only rejects the
literal `rzp_test_simulated` and `mock`, so an `rzp_test_…` key flips the app
into live mode against Razorpay's test environment — checkout looks like it
works and takes no money. Always confirm `rzp_live_`.

---

## Still owed to the client

- The AWS cost figure — asked twice, on 29 Jul
- That the regenerated Razorpay key may have broken her existing site's payments
- Which of the **two** Razorpay accounts is the real one (Sept '21 vs Feb '26)

---

`docs/HANDOFF-aws-deploy.md` describes the *original* deploy to the builder
account and is now partly stale — it opens by saying the site is blank, which it
has not been since 27 Jul. Read this file for the migration; read that one only
for history.
