---
title: "KiqStat traffic quality and revenue by source (checklist 4.1 and 4.2)"
subtitle: "Signups since 1 October 2026 and all paid orders, from the database, 5 Nov 2026"
---

# Headline

- **The signups look like people.** Of 263 accounts, 256 are ordinary addresses; 7 are our own team or mistyped addresses and are now left out of every count. 74% of the accounts created since 1 October came back after the visit they signed up in. No sign of a bot wave: every address is a real mailbox provider, signups are spread across the day, and the one spike (24 October, 38 signups) came from the X post and direct links with a 60% return rate.
- **ChatGPT is the best source we have.** 40 signups, 17 tried to pay, 8 paid (20%), **₦45,000 collected, 43% of all attributed revenue**. Google sent 11 signups and no payment; X (t.co) sent 16 signups and 1 payment (₦5,000).
- **Half the accounts have no recorded source.** 129 of 256 (50%) were created before first-visit capture worked. It was broken until about 26 October (Google sign-ins never reached the code that saves it). Every account since 26 October has a source, so the report is complete from here on.
- **We cannot check raw site visits from here.** The visitor counts live in Google Analytics, Vercel Analytics and Mixpanel; I have no access to them. 4.1 is therefore done for signups and open for visits (see what I need).

# 4.1 Are the signups people?

| Check | Result |
|---|---|
| Accounts in total | 263 |
| Counted as people | 256 |
| Our own domains (team, tests) | 4 |
| Mistyped addresses (gmal.com, gmail.con) | 2 to 3 |
| Throwaway mailbox providers | none found |
| Came back after the signup visit (since 1 Oct) | 74% |
| Biggest day | 24 Oct, 38 signups (t.co 10, direct 21, Google 3, other 4) |

The rules now live in `src/lib/signup-quality.ts` and are applied on the Admin, Traffic page: our own accounts and unusable addresses are excluded from the totals and source breakdowns, and a "Came back" figure shows how many accounts returned. A bot using a real Gmail address would pass the address check; the return rate is what exposes it, and the last four weeks show no such pattern.

# 4.2 Which source pays

Counted from each paying customer's first-touch source (the paid orders are joined to the profile; no copy is stored on the payment).

| Source | Signups | Paid | Conversion | Collected (₦) |
|---|---|---|---|---|
| chatgpt.com | 40 | 8 | 20% | 45,000 |
| No data (before capture) | 129 | 8 | 6% | 32,350 |
| Direct (no referrer) | 57 | 5 | 9% | 23,000 |
| t.co (X) | 16 | 1 | 6% | 5,000 |
| www.google.com | 11 | 0 | 0% | 0 |
| com.twitter.android | 2 | 0 | 0% | 0 |
| accounts.google.com | 1 | 0 | 0% | 0 |

Collected here is ₦105,350 across all time, which is more than October's ₦77,250 because it includes August, September and November orders. These are small numbers (8 payers from ChatGPT), so treat the ranking as a lead, not a result.

What it suggests:

1. **ChatGPT recommends us and those visitors buy.** It is worth finding out what people ask that sends them to KiqStat, and making sure the pages ChatGPT links to are the strongest ones. This is also the argument for the SEO work in 4.6.
2. **X brings visitors who sign up but mostly do not pay** (6%). Check what the post promises against what the landing page offers.
3. **Direct traffic is 22% of tracked signups and pays at 9%.** These are people who typed the address or opened a link from WhatsApp or an app that hides the referrer. Tagged links (4.4) would show which.

# What changed in the product

- Admin, Traffic: signup counts now exclude team and unusable accounts; a "Came back" tile; and a new **Revenue by source** table (signups, payers, conversion, naira collected).
- No database change: the source stays on the profile and is joined to payments on demand, so old and new orders are covered alike.

# What I need from you

1. **GA4 and Vercel Analytics for October:** unique visitors, sessions and top landing pages, so I can compare site visits with the 237 signups and finish the bot check on traffic (4.1).
2. **A screenshot of Mixpanel's bot or crawler filter setting** (or tell me whether it is on), because crawlers inflate visit counts there.
3. Whether the **24 October spike** matches a post or campaign you ran that day.
