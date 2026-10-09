# Client communications

## Tone

Casual Hinglish. **No "Ma'am", no formal register** — she is informal and it
reads wrong coming from us. Short sentences, WhatsApp `*bold*`, one topic per
message. Say the number, say what it buys, ask one closed question at the end.

## Send from this file

> **Every `*-SEND.txt` in this folder opens with internal notes. The `---` line
> is the boundary — copy from BELOW it, never the whole file.** No exceptions,
> including the ones whose own header says "message text only". `questions-round-4.txt`
> claimed message A had no header and could be pasted whole; it has ~40 lines of
> notes citing AGENTS.md and "do NOT quote 2,380 as the headline". Corrected
> 31 Jul, in both places that said it.

**Current queue, in order. Round 3 is superseded — do not send from it.**

The letters are **identifiers, not priority** — a file keeps its letter for life
so that references to it from AGENTS.md stay valid. Row order is the send order.
That is why G sits at the top.

| # | File | Status |
|---|---|---|
| **G — SEND FIRST** | `message-g-where-bookings-show-SEND.txt` | **She asked this twice on 3 Aug and is waiting.** Where bookings and form details show: `https://www.quadishotels.com/admin`, verified live. Two fill-ins before sending — our availability, and the **PIN, which goes in a separate message and never into a file under `docs/`** (this repo is public). It also carries the two-systems question that row **E** has been waiting since 27 Jul to ask — asking it *inside* an answer she requested beats raising it cold |
| **B** | `message-b-dns-access-SEND.txt` | **SENT 31 Jul — and ANSWERED.** She drafted the support mail herself and it is correct as written; she only asked *which address* to send it to. Her reply: `client-assets/briefs/2026-07-31-whatsapp-support-email-draft-and-addresses.png` |
| **C** | `message-c-which-support-address-SEND.txt` | **SENT 31 Jul.** Told her: mail `serverindiagurgaon@gmail.com`, CC `support@host.co.in`, call +91 966 576 0700. **She then appears to have mailed them — ⚠️ believed, not confirmed** (see below). Now waiting on the host |
| **A — SEND NEXT** | `message-a-server-cost-SEND.txt` | The corrected server cost, **~₹3,500/mo**. **Rewritten 31 Jul** — it no longer re-asks a price she has already agreed to, no longer says work starts after she confirms (the server is built and running), and the **$99.47 ≈ ₹8,500 credit is now in the message text** instead of being a hand-edit note here. Nothing blocks this one; it only needs her |
| D | `questions-round-4.txt` → Razorpay | Her money, possibly broken right now |
| E | `questions-round-4.txt` → PMS / admin panel | Decides the most work; needs the revenue manager. **Its opening question is now folded into G**, because she asked it herself on 3 Aug. Do not ask it twice — read G before sending this |
| F | `message-photo-storage.txt` | Read its warning header first — photo editing is **not** live |

> ⚠️ **"She sent the mail" is an assumption, and it is the kind that costs
> days.** It reached us as *"ig she sent mail to them"* — nobody has seen the
> sent mail, a reply, or a ticket number. If it was never actually sent, the
> symptom is identical to the host ignoring it: silence. **Ask her to forward
> the sent mail or the ticket number**, which also gives us something to quote
> when chasing. Same failure this file already records twice (§4a): a thing
> relayed in conversation, not read off a thread, then treated as fact.
>
> The cheap independent check needs nobody: `./deploy/cutover.sh --check`. The
> moment the apex A record moves to `13.234.85.127`, they acted.

**This table is the authority on send order.** `questions-round-4.txt` carries
the send-order *reasoning* and is the working file for D onward, but its own
internal lettering (A, B, C, D, E, G, F) predates the DNS thread and no longer
matches — its "C" is Razorpay, this table's C is the support-address answer.
Go by the filenames, not the letters.

**`questions-round-3.txt`** — **superseded.** Its cost item quotes
₹1,500-2,000, which is wrong and was already sent to her twice. It disowns
itself internally; kept only as the record.

**`message-photo-storage.txt`** — send separately. Explains what the admin panel
already does, then asks the client to choose where uploaded photos are stored:
Cloudinary or Amazon S3. Read its warning header first — photo editing is being
built but is **not** live, and the message must not imply that it is.

Send Part A in three goes, not one: message 1 alone first, then 2, then 3 and 4
together. Round 1 went out as a single block and came back roughly half
answered — and the skipped items were the launch blockers, not the easy ones.

Everything else in `sent/` is history. Do not send from it.

## sent/

| File | What it is |
|---|---|
| `round-1-sent.txt` | Sent 26 Jul. Their replies are in `client-assets/briefs/2026-07-27-SENSITIVE-answers-and-logins.txt` |
| `round-2-superseded.txt` | Never sent as written — the client answered the room counts and rates before it went out. What survived is folded into round 3 |
| `running-notes.md` | Working list, grouped by urgency |

## What round 3 still turns on

~~The **third-person charge**.~~ **RESOLVED 27 Jul 2026.** Extra adult **30%**;
children in three bands — under 8 free, **8–12 at 20%**, 13+ as an adult.
AGENTS.md §2 rule 3 is binding.

**"Children are free in the code today" was wrong and is fixed.** It was not
just a note here: the same claim had reached the live chatbot prompt, which told
guests a child costs nothing while the booking engine charged 20% for ages 8–12.
Corrected 31 Jul across `AIService.ts`, both `pricing.ts` files, `schema.sql`,
`DEPLOYMENT.md` and `change-order-3.md`. Do not reintroduce it here.

And message 4 question 1, which decides the most: after **Book Now**, does the
guest stay on our site or go to the PMS vendor's booking page? If it is the
vendor's page, the checkout, payments and GST invoice work all stops being used.
