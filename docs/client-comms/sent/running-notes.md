# Questions for Quadis

Do not send these all at once. Send batch 1 now, the rest only when you actually
need them.

---

## Batch 1: send now (4 questions)

These are the only ones blocking you. Two of them take days on their side, so
they need to start today.

Ready to send. Also saved as plain text in `docs/whatsapp-message.txt` if you
just want to open and copy it.

```
Hey, website is almost done. Need 4 things from your side before I can make it live, 2 of them take a few days for approval so better to start now

1. Razorpay account for online payments. Has to be in the hotel's name with your PAN, GST and bank details. Form takes 10-15 min, approval few days. I can't use my own account to collect hotel payments

2. Hosting account, needs to be opened in the company name so the account and billing stay with you. I'll guide you through it

3. Do you use email on quadishotels.com, like info@quadishotels.com? And do you know who made your current website or who looks after it? Need to check before switching or your email can stop working

4. Company's full registered name and GST number, for the bills

Let me know, or we can just get on a call if that's easier
```

That is it. Everything else can wait.

---

## Batch 2: ask once AWS and Razorpay are moving

- What is your cancellation and refund policy? Razorpay asks for this before
  approving the account.
- Do you have a privacy policy and terms page, or should I write basic ones?
- When can we switch the site over? Any day or time that is quieter for
  bookings?

---

## Batch 3: ask while building

Only ask these when you are actually working on that part.

**Rooms and pricing**

Mostly answered by the rate sheet of 27 Jul 2026
(`client-assets/briefs/2026-07-27-rate-sheet.jpeg`): 197 keys,
per-hotel Deluxe rates from 1,500 to 3,000, three categories at +1,000 a step.
All of that is now in the site. Four things it did not settle:

- **Blocking, affects what guests are charged.** The rate sheet says "extra
  adult 500, child 250". Your WhatsApp on 26 Jul said the third adult adds 40%
  of the room rate and a child adds nothing. Those are different amounts — on a
  3,000 room it is 500 against 1,200 — and the sheet charges for children where
  the earlier rule did not. Which one is live? The site is still on the 40% rule
  until you confirm, because changing it silently would mis-bill real guests.
- Quadis Sector 51 is listed at 28 keys but broken down as 6 Deluxe + 3 Super,
  which is 9. Your Noida total of 125 only works if it is 28. Which is right?
  Seeded at 9 for now, so the site is under-selling that hotel by 19 rooms.
- Quadis Central shows 17 keys with no Deluxe/Super split, though it has a rate
  for both. Assumed 13 + 4. What is the real split?
- The rate sheet and `briefs/2026-07-27-hotel-links-and-rates.txt` disagree on
  four hotels. Used the rate
  sheet. Confirm: Downtown 15 (2,000 or 2,500), Cladis 15 (1,800 or 2,000),
  Amby Inn (2,500 or 2,700), Quadis Central (2,500 or 2,000).

**Admin panel**

- How many people will use the admin panel? Should everyone share one PIN or
  does each person need their own login?
- Is +91 92173 73532 the right WhatsApp number for booking alerts?

**Content**

- Can you send 6 to 9 real guest reviews with name, hotel, rating and date?
  From Google reviews is fine.
- Do you have links to the actual articles for the Featured In logos (Conde
  Nast, Outlook Traveller, Economic Times etc)? If there is no coverage we
  should remove that section.
- Do you have your logo as an SVG file?
- Do you have separate photos for each hotel? Right now some hotels are showing
  photos from other properties.
- Need a photo of Noida city (the current one is a building).
- The Quadis Select image in "Expanding into three categories" is about 395px
  wide, against 1,400px+ for Central and Experience. It renders visibly softer
  than the two beside it. Is there a full-size version?

---

## One thing to raise yourself, early

The current site is on shared hosting, which costs a few thousand rupees a year.
AWS with a database and CDN will be a few thousand rupees a month. If nobody has
told them that, tell them before the first bill arrives, not after.

If cost matters more than being on AWS specifically, say so and I will suggest a
cheaper setup. Nine hotels does not need heavy infrastructure.

---

## Internal notes, do not send

- Domain resolves to 115.124.108.190, nameservers at theserverindia.com. Indian
  shared hosting, not AWS. Going live is a migration plus DNS cutover.
- Get the full DNS zone exported before touching nameservers. If mail is on the
  same host and the MX records are not copied, their email goes down.
- AWS account and Razorpay must be in the client's name. If they are in yours,
  you are funding their business and you become a permanent dependency.
- Razorpay legally cannot be your merchant account collecting for their hotel.
