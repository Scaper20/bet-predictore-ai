---
title: "Founder tasks for the second pass"
subtitle: "Everything Claude needs from you, in the order that unblocks the most. 6 November 2026"
---

Tick each box as you go. The first section matters most: nothing built in the first pass is live until it is done. Reference: *KiqStat CTO review: first pass, full report* (`cto-review-first-pass-2026-11`).

# A. Do first (today or tomorrow)

| Tick | Task | How | Unlocks |
|---------|----------------------------|------------------------------------|-----------------------------|
| [ ] | Merge `dev` into production and promote the deployment | Merge on GitHub, then in Vercel open the new deployment and choose Promote to Production | Everything built in the first pass: renewal fixes, refund reversal, Traffic page, ask-watch cron, SEO pages, guides |
| [ ] | After the merge, open `/admin/renewals` and press **Check with Paystack now** | Admin, Renewals | Confirms the 24 October VIP renewal is recorded (item 1.5) |
| [ ] | Set `INDEXNOW_KEY` in Vercel (Production) and redeploy | Any string of letters, digits and dashes, 8 to 128 characters | Daily push of new pages to Bing, Copilot, ChatGPT search |
| [ ] | Open `/football/competition/npfl` and `/guides` once, and Admin, Traffic | Browser | I have not seen these pages rendered. Tell me anything that looks wrong |

# B. Figures and files to send me

| Tick | Item | Where to get it | Unlocks |
|---------|----------------------------|------------------------------------|-----------------------------|
| [ ] | **Paystack transactions export, 1 to 31 October** | Paystack dashboard, Transactions, Export (CSV) | Reconciles the revenue statement, gives real fees and decline reasons for failed card payments (2.1, 4.3) |
| [ ] | **October invoices**: Vercel, Supabase, TheSportsDB, Sendbyte, domain | Each provider's billing page | Replaces my cost estimates, so the operating result becomes a fact (2.2, 2.4) |
| [ ] | **Paystack webhook log for the 24 October ₦12,000 charge** | Paystack, Settings, API Keys and Webhooks, then Logs | Names the cause of the missed VIP renewal (1.5) |
| [ ] | **Anthropic billing figures** for October and November to date | Anthropic Console, Billing, Usage | Reconciles our Ask ledger against the bill and sets the overrun rule (3.3) |
| [ ] | **Google Analytics 4**: October visitors, sessions, top landing pages | GA4, Reports, Acquisition and Engagement | Finishes the site-visit part of 4.1 |
| [ ] | **Mixpanel**: is the bot filter on? | Mixpanel, Project Settings | Same |
| [ ] | **Supabase Backups screenshot** (Database, Backups) | Supabase dashboard | Evidence for 1.3 |

# C. Things only you can run

| Tick | Task | How | Unlocks |
|---------|----------------------------|------------------------------------|-----------------------------|
| [ ] | Redeploy so `ANTHROPIC_TEST_API_KEY` takes effect | Vercel, redeploy the production deployment | The Ask lab can reach Anthropic |
| [ ] | Run the five presets at `/admin/ask-lab` and rate each answer | About 40 questions across 5 configurations, costs up to about US$4 | I analyse the results and recommend one setting (3.2) |
| [ ] | Refund the 31 October ₦500 test pass and confirm the receipt and the refund email | Paystack, then check the inbox | Closes 1.4 |
| [ ] | Do a **test restore** from a Supabase backup into a scratch project | Supabase, Database, Backups, Restore | Proves the backup works (1.3) |
| [ ] | One real partner test: open a partner link in a private window, sign up a test account, pay ₦500, check the commission on the partner page, then refund it | Browser plus Paystack | The first real proof of the referral chain and the new refund reversal (5.4) |

# D. Decisions

| Tick | Decision | My recommendation | Item |
|---------|----------------------------|------------------------------------|-----------------------------|
| [ ] | Allowance versus cap on VIP: a day ends at about 82 questions, not the 100 promised. Raise the day cap, or lower the allowance? | Lower the promise to match the cap unless you want to pay up to about US$0.12 a day per heavy VIP member; Pro already fits | 2.5 |
| [ ] | Approve, edit or cut each of the 14 X captions | Cut anything you are not comfortable defending; never soften | 4.4 |
| [ ] | Do the X captions meet Nigerian gambling-advertising rules? | I could not check the regulator's wording; confirm before the first post | 4.4 |
| [ ] | Commission schedule: 20% of net standard, 25% named, 30% ceiling, no 35% | Approve as drafted | 5.2 |
| [ ] | Make pay-once the default option on the Pro and VIP pages | Yes: it sells about three times better per attempt | 4.3 |
| [ ] | Keep AI training crawlers blocked until scraper traffic is rate-limited | Yes | 4.6 |
| [ ] | Head-to-head pages: list only popular pairs in the sitemap and mark other pairs noindex | Yes: stops a crawl trap and wasted rendering | 4.6 |
| [ ] | Name an author (or confirm "the KiqStat team") for the six guide articles, and read them once | Read them: they speak for the product | 4.6 |

# E. Access and small confirmations

| Tick | Item | Notes |
|---------|------------------------------------------------|---------------------------------------------|
| [ ] | Verify `www.kiqstat.app` in **Google Search Console** and **Bing Webmaster Tools**, submit `/sitemap.xml` | About 10 minutes each; give me read access or send the exports (90 days of queries and pages) |
| [ ] | Confirm which of the 13 October paid orders were real customers and which were tests | Besides the ₦500 test, are there others? (2.1) |
| [ ] | Did the 24 October signup spike (38 signups) match a post or campaign you ran? | Helps me read the traffic data (4.1) |
| [ ] | Confirm the X profile can carry the bio link and a pinned post; say whether to post from one account or also a personal one | 4.4 |
| [ ] | Send the 9-slide carousel images and the week's fixtures you want posted about | 4.4 (P6) |
| [ ] | Confirm Flutterwave is used for partner customers | If yes, I will add the refund reversal for it too (5.4) |

# F. Outside parties

| Tick | Item | Owner |
|---------|------------------------------------------------|---------------------------------------------|
| [ ] | Recover the founder's questionnaire answers for the Partner Agreement V2 | You (5.1) |
| [ ] | Legal and tax: tax on commissions, partner status, limits on what a partner may say about returns, termination rights | You with your legal adviser (5.3) |

# G. Dates to keep in mind

| Date | What happens | What I do |
|---------|------------------------------------------------|---------------------------------------------|
| 7 November | The ₦500 VIP trial ends | Nothing yet |
| 8 November | The ₦500 pass upgrade check; the two Pro card plans renew | I count who upgraded and watch the first live renewal |
| When the X posts go out | 48-hour and 7-day reviews | I run the review query and report (4.5) |
| First partner payment | Referral chain proven with money | I confirm the commission and its 14-day hold (5.4) |

# H. What happens when you send these

1. **Revenue and costs:** I redo the revenue statement against the Paystack export and the invoices, finish the operating profit, and close 2.1, 2.2 and 2.4.
2. **AI:** I analyse the lab results, recommend a setting, reconcile the ledger with Anthropic's bill, and implement your 2.5 decision.
3. **Growth:** I finish 4.1 with GA4 and Mixpanel, run the first campaign review, and start the Search Console work from the SEO plan.
4. **Partners:** I update the agreement draft with your approved commission schedule once 5.1 and 5.3 are done.
5. I update the Claude Doc and send a second-pass report as Word and PDF, as before.
