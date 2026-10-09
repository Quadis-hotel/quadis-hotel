# DNS cutover for quadishotels.com

Verified live on 27 Jul 2026, and it changes the plan in one important way.

## What is actually true today

```
A       quadishotels.com  ->  115.124.108.190          (theserverindia shared hosting)
MX      quadishotels.com  ->  1 smtp.google.com        (Google Workspace)
NS      quadishotels.com  ->  yellow1.theserverindia.com
                              yellow2.theserverindia.com
```

Two things follow, and the second is the one people get wrong.

**Mail is on Google, not on the web host.** The client said *"Mail id gmail pr
chlti h baki server k through bni h ye"* and the MX record confirms it. So
moving the website does not, by itself, touch mail delivery.

**The domain is registered at GoDaddy but its DNS is served by
theserverindia.** The nameservers are `yellow1/yellow2.theserverindia.com`, so
the zone — including those Google MX records — lives in theserverindia's panel,
not in GoDaddy. Logging into GoDaddy and changing records there will do nothing
until the nameservers are moved, and moving the nameservers moves the whole zone.

## The safe path

**Update 27 Jul: the client has refused the panel login**, because their other
websites are hosted on the same server. That is a fair refusal — a shared-hosting
cPanel exposes every site on the account — and it is not needed.

Ask the previous designer or theserverindia support to change **one record**:

> Point the A record for `quadishotels.com` at the new address. Change nothing
> else — leave MX, TXT and every subdomain exactly as they are.

Nobody has to hand over a password for that. It is the lowest-risk option
because the zone never moves, so nothing can be lost in transit.

## The fallback, if they will not do even that

Move **only quadishotels.com's** nameservers to Route 53 or GoDaddy DNS. This is
done at the registrar, where the client already has access, so theserverindia is
not involved.

**Their other websites are safe.** Verified 27 Jul: reverse DNS on
115.124.108.190 is `yellow.theserverindia.com`, a shared server, and the client's
other sites are separate *domains* on it — not subdomains of quadishotels.com.
Moving this domain's nameservers cannot touch them. Their objection is honest but
does not apply here, and saying so plainly is what unblocks the conversation.

The real risk is losing records that only exist in the old zone. A public
resolver shows the following; `docs/dns-zone-observed.txt` has the captured
version. Every one must exist in the new zone **before** the switch:

```
@          A      115.124.108.190
www        CNAME  quadishotels.com.
mail       A      115.124.108.190
webmail    A      115.124.108.190
ftp        CNAME  quadishotels.com.
blog       A      115.124.108.190
api        A      115.124.108.190
booking    A      115.124.108.190
```

There is no wildcard — those are explicit records, so each one is a live thing
that breaks if it is dropped. Plus the mail records:

```
MX   1  smtp.google.com

TXT  v=spf1 a mx include:websitewelcome.com include:_spf.google.com
     include:Yellow.theserverindia.com ~all

TXT  google-site-verification=tx0Bc_a9v1k8qT6UHjQ716HZvDHpLwFt5VFYZjA0u3Y
TXT  google-site-verification=c8NaV2tMxsnJt69f5Wto3bILWNlsYcz1NMDpUcewLP4
```

Export the full zone from theserverindia first and diff it against the new one.
The list above is what a public DNS query can see; a zone export may hold more
(DKIM selectors under `_domainkey`, subdomains, mail autodiscover records) that
does not show up from outside.

Also note the SPF record includes `Yellow.theserverindia.com` and
`websitewelcome.com`. If mail is ever sent from the new host, SPF has to be
updated or it will fail authentication.

## Rollout

1. Lower the A record TTL a day ahead, so a rollback is minutes rather than hours
2. Change the A record only
3. Keep the old hosting paid and running for 2–3 weeks — propagation is uneven
4. Send and receive a test mail on `info@quadishotels.com` immediately after,
   then again the next day
