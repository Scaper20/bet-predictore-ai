---
title: "KiqStat CTO review: first pass, full report"
subtitle: "Where all 25 checklist items stand, what was found, what was built, and what the second pass needs. 6 November 2026"
---

# 1. Is the first pass done?

**Yes, for everything that can be done without you.** The CTO's Complete Work Review of 4 November became a 25-item checklist. Every item that Claude owns alone is finished. What is left either needs a decision, a figure or an action from the founder, an outside party (legal), or an event that has not happened yet (the X posts, the first partner payment, the ₦500 pass trial ending on 7 November). Those are the inputs for the second pass.

| Status | Items | Count |
|------------------|----------------------|------------------------------------------------------------|
| Done by Claude | 1.2, 2.1, 2.3, 2.4, 3.1, 3.4, 4.2, 4.3, 5.4 | 9 |
| Closed by the founder | 1.1, 1.6 | 2 |
| Claude's part done, waiting on you or an event | 1.3, 1.4, 1.5, 4.1, 4.4, 4.5, 4.6, 5.2 | 8 |
| Open, needs the founder or an outside party | 2.2, 2.5, 3.2, 3.3, 5.1, 5.3 | 6 |

**Nothing built in this pass is live yet.** All code is on the `dev` branch (latest commit `9baa60b`, 1,305 tests passing). It reaches customers only when you merge `dev` into production and promote the deployment.

# 2. The headline findings

1. **Revenue is small and mostly one-off.** October collected ₦77,250 from 13 paid orders (about ₦74,900 after estimated fees). 43 people tried to pay and 65 attempts failed or were abandoned. Of the paid orders, 9 were one-off and 3 recurring.
2. **October did not cover its estimated fixed costs** of ₦95,000 to ₦108,000 a month, so it fell about ₦20,000 to ₦33,000 short. These are estimates until the invoices arrive (2.2).
3. **Margin per customer is healthy; the number of customers is the problem.** Every plan clears the 25% margin target in normal use, at any of three exchange rates (₦1,400, ₦1,550, ₦1,700), with a 0%, 20% or 35% partner. A 35% partner commission fails the target in the worst case, so it should not be promised.
4. **Ask KiqStat's AI cost is immaterial** (about US$0.001 a question) but had a real hole: cancelled calls were under-booked. Fixed.
5. **Checkout loses most buyers.** 22 of 262 accounts have ever paid; 36% of the 61 who reached checkout completed it. Paying once converts about three times better per attempt than a card subscription. No one has paid twice.
6. **A VIP renewal was missed on 24 October** (Paystack charged, access ended). The cause is still unconfirmed, but the code is now robust to both possible causes and a daily check catches anything missed.
7. **Most of the site's "visitors" are not people.** Vercel counted 30,592 October visitors, but only 2,376 are Nigerian and they average 7.3 pages each; everyone else averages 1.2 pages. The sign-up page alone had 10,904 non-human-looking visitors. The 263 signups themselves look like real people.
8. **Source tracking was broken until about 26 October.** 129 of 256 real accounts have no recorded source. Of the sources we can see, ChatGPT is the best: 40 signups, 8 payers (20%), ₦45,000, 43% of attributed revenue.
9. **Search and AI engines send almost nothing yet** (about 113 Google visitors, 4 from ChatGPT in 30 days), although the site's technical SEO is already good.
10. **The partner system had never handled real money** (3 partners, 3 referred signups, none paid) and had one gap: a Paystack refund left the partner's commission standing. Fixed.

# 3. All 25 items

## Priority 1: Production safety

| # | Item | Status | Result |
|--------|--------------------|-------------|-----------------------------------------------------------|
| 1.1 | Anthropic workspace spending limit | Closed by founder | Set at US$20 a month |
| 1.2 | Ask preflight and switch | Done | Preflight green in production; offline tests pass; Ask switch confirmed on |
| 1.3 | Backup and recovery | Claude's part done | Supabase is on the Pro plan (daily backups kept 7 days, no point-in-time recovery, 864 MB). Runbook `docs/backup-recovery.md` and an off-site weekly backup written; the first run was green. **You:** Backups screenshot and a test restore |
| 1.4 | Real ₦500 VIP pass, receipt and refund | Waiting on founder | The 31 October purchase is in our records. **You:** refund the test pass and confirm the receipt |
| 1.5 | VIP renewal anomaly | Claude's part done | Renewal handling rebuilt (`docs/renewals.md`), `/admin/renewals` page, dashboard alert, daily Paystack subscription check, recovery for lost payments. **You:** Paystack's webhook log for the 24 October ₦12,000 charge, which will name the cause |
| 1.6 | Booking codes and live win bar | Closed by founder | Verified: 100 of 102 member codes read back correctly from SportyBet; refusals (about 45% of attempts) are correct but a usability issue to follow up |

## Priority 2: Financial baseline

| # | Item | Status | Result |
|--------|--------------------|-------------|-----------------------------------------------------------|
| 2.1 | October revenue statement | Done | `revenue-statement-2026-10`. Four-month table: Aug ₦700 (1 order), Sep ₦13,400 (3), Oct ₦77,750 incl. a ₦500 test (14), Nov to the 5th ₦13,500 (4). **You:** Paystack export to reconcile and give real fees |
| 2.2 | October cost invoices | Open, founder | Vercel, Supabase, TheSportsDB, Sendbyte, domain |
| 2.3 | Plan-by-plan model | Done | `scripts/plan-economics.ts` and `plan-economics-2026-11`. Largest partner commission that still leaves 25%: 72% typical, 31% to 37% worst case |
| 2.4 | Free tier cost and operating profit | Done | Free and guest Ask cost under ₦11 in five weeks; fixed costs spread over 240 active accounts are about ₦400 to ₦450 each. Operating result is an estimate until 2.2 |
| 2.5 | Allowance versus cap per plan | Open, founder decides | A VIP member's day ends at about 82 questions, not the 100 promised, because the US$0.10 day cap bites first. Raise the cap or lower the allowance; Pro (30 a day, about US$0.025) fits its US$0.04 cap |

## Priority 3: AI sustainability

| # | Item | Status | Result |
|--------|--------------------|-------------|-----------------------------------------------------------|
| 3.1 | Offline verification | Done | Cancelled Ask calls are now booked for the text already streamed and the prompt sent (`src/lib/ask/engine.ts`, two new tests) |
| 3.2 | Live benchmark, 40 questions × 5 configurations (about US$4) | Open, both | The lab at `/admin/ask-lab` is ready and `ANTHROPIC_TEST_API_KEY` is in Vercel. **You:** redeploy so it takes effect, run the five presets and rate the answers; then I analyse and recommend |
| 3.3 | Ledger reconciled with Anthropic billing | Open, both | **You:** Anthropic billing figures for October and November to date |
| 3.4 | Margin and abnormal-usage alerts | Done | Daily cron `/api/cron/ask-watch`, rules in `src/lib/ask/watch.ts`, one email per finding per day |

## Priority 4: Analytics, growth and marketing

| # | Item | Status | Result |
|--------|--------------------|-------------|-----------------------------------------------------------|
| 4.1 | Signups are people; site visits | Partly done | Signups verified and filtered (7 of 263 set aside). Site visits answered from Vercel (see finding 7). **You:** GA4 figures and whether Mixpanel's bot filter is on |
| 4.2 | Source carried through to payment | Done | Admin → Traffic → Revenue by source. The page was also corrected so accounts with no recorded source are no longer shown as "Direct" |
| 4.3 | Pass conversion and upgrades | Done | `conversion-and-free-tier-2026-11`. The ₦500 pass upgrade check is due 8 November |
| 4.4 | X captions, sequence, tagged links | Drafted | `x-pack-2026-11`: 14 captions, a 14-day sequence, tagged links under campaign `nov26-test`. **You:** approve or edit; check against Nigerian advertising rules |
| 4.5 | 48-hour and 7-day reviews | Procedure ready | `docs/campaign-review.md`; runs once posts go out |
| 4.6 | SEO plan, widened to the whole site and every AI engine | Drafted and partly built | `seo-geo-plan-2026-11`. Built on `dev`: IndexNow daily push, pricing structured data, permanent competition pages, six question-style guides, a sharper Track page title, a citation block in `llms.txt`. **You:** Search Console and Bing access; agree the head-to-head clean-up |

## Priority 5: Partner Agreement V2

| # | Item | Status | Result |
|--------|--------------------|-------------|-----------------------------------------------------------|
| 5.1 | Founder's questionnaire answers | Open, founder | |
| 5.2 | Commission schedule | Drafted | `partner-commission-and-referrals-2026-11`: 20% of net for 12 months as standard, 25% for named partners, a 30% ceiling, no 35%. **You:** approve |
| 5.3 | Legal and tax | Open, founder and legal adviser | |
| 5.4 | Referral tracking end to end | Done | Chain checked link by link; the reversal function was run on the live database inside a rolled-back transaction. Paystack refunds now reverse the partner commission automatically. The first real payment through a partner link has still to be seen |

# 4. What was built (all on `dev`, not yet live)

| Area | Change |
|------------------------------|----------------------------------------------------------------------|
| Billing | Daily Paystack subscription check; payment recovery for lost webhooks; robust renewal detection with cycle fallbacks; failed-renewal email to the member; `/admin/renewals` with a dashboard alert; automatic partner-commission reversal on a Paystack refund |
| Reliability | Settlement of finished games every minute (migration 0100, applied to production); off-site database backup |
| Ask KiqStat | Cancelled calls booked correctly; daily margin and abnormal-usage watch; Ask lab for the live benchmark |
| Picks | Ordered top picks, frozen at publish for games from 6 November (`predictions_log.top_picks`, applied to production); Code Hub plan tag; pick integrity written up |
| Analytics | Signups filtered to people; revenue by source on the Traffic page; accounts without a recorded source kept apart from direct traffic |
| SEO and AI answers | IndexNow; pricing structured data; competition pages at `/football/competition/<code>` with each competition's own settled record; six guide articles; `llms.txt` citation block; Track page title |
| Docs | Backup runbook, renewals runbook, campaign review procedure, and the reports below |

Checks: typecheck and lint clean; 1,305 tests pass. I have not seen the new pages or the Traffic page rendered in a browser.

# 5. Reports delivered (reference index)

Every report exists as Word and PDF in `docs/reports/` and was sent to you as it was produced. Earlier reports predate the CTO review and are included so this document points to the whole set.

| Date | Report | What it covers |
|------------------|----------------------|------------------------------------------------------------|
| 29 Oct | `ask-kiqstat-cost-audit.pdf` | Technical and cost audit of Ask KiqStat |
| 29 Oct | `ask-kiqstat-cost-controls.pdf` | Findings on the spending controls |
| 29 Oct | `ask-kiqstat-staging-margin.pdf` | Staging verification and margin floor |
| 4 Nov | `model-audit-fixes-2026-11.pdf` | Model audit fixes and replay results |
| 4 Nov | `forge-code-hub-audit-2026-11.pdf` | Forge and Code Hub audit, replay labs, live grading SQL |
| 5 Nov | `revenue-statement-2026-10` | 2.1 October revenue statement |
| 5 Nov | `plan-economics-2026-11` | 2.3 per-plan margins and partner commission limits |
| 5 Nov | `traffic-and-sources-2026-11` | 4.1 and 4.2 signup quality and revenue by source |
| 6 Nov | `x-pack-2026-11` | 4.4 X captions, 14-day sequence, tagged links |
| 6 Nov | `seo-geo-plan-2026-11` | 4.6 whole-site SEO and AI-engine plan, Grok first |
| 6 Nov | `conversion-and-free-tier-2026-11` | 4.3 pass conversion, 2.4 free-tier cost |
| 6 Nov | `partner-commission-and-referrals-2026-11` | 5.2 schedule, 5.4 referral check |
| 6 Nov | `data-totals-xg-2026-11.pdf` | Data, market totals and xG audit (model work on `dev`) |
| 4 to 6 Nov | Claude Doc "KiqStat: CTO Review Progress" | The live version: findings, decisions, checkpoint log (https://claude.ai/artifact/LDRt5B5Y3M4AKmCDVzmeL9) |

Supporting documents in the repository: `docs/cto-review-checklist.md`, `docs/backup-recovery.md`, `docs/renewals.md`, `docs/pick-integrity.md`, `docs/campaign-review.md`.

# 6. What the second pass needs from you

**Do first, because everything else depends on it**

1. Merge `dev` into production and promote the deployment.
2. Set the `INDEXNOW_KEY` variable in Vercel (any string of letters, digits and dashes) to switch on IndexNow.

**Inputs that unlock Claude's remaining work**

| For | What |
|------------------------------|----------------------------------------------------------------------|
| 2.1, 2.2, 2.4, 4.3 | Paystack transaction export for October (real fees, decline reasons); October invoices for Vercel, Supabase, TheSportsDB, Sendbyte and the domain |
| 1.5 | Paystack webhook log for the 24 October ₦12,000 charge |
| 1.3 | Supabase Backups screenshot; a test restore |
| 1.4 | Refund the 31 October ₦500 test pass; confirm the receipt |
| 3.2 | Redeploy, run the five presets in `/admin/ask-lab`, rate the answers |
| 3.3 | Anthropic billing figures |
| 4.1 | GA4 October visitors, sessions and landing pages; Mixpanel bot-filter setting; whether the 24 October signup spike matched a campaign |
| 4.6 | Search Console and Bing Webmaster access; agree the head-to-head clean-up; name an author for the guides; approve the competition explainers |

**Decisions**

| For | Decision |
|------------------------------|----------------------------------------------------------------------|
| 2.5 | Allowance versus cap per plan (VIP currently ends the day at about 82 questions) |
| 4.4 | Approve or cut the 14 X captions; advertising-rule check; send the carousel images and the week's fixtures |
| 5.2 | Approve 20% standard, 25% named, 30% ceiling, no 35% |
| 4.3 | Make pay-once the default on the pricing page |
| 4.6 | Keep AI training crawlers blocked until scraper traffic is rate-limited (my recommendation: yes) |

**Outside parties**

5.1 the questionnaire answers; 5.3 legal and tax with your adviser.

**Events that will arrive on their own**

- 7 November: the ₦500 trial ends; 8 November: the upgrade check runs.
- 8 November: the two Pro card plans renew, the first live test of the renewal code.
- When X posts go out: 48-hour and 7-day reviews (4.5).
- The first real payment through a partner link: confirms 5.4 with money.

# 7. Honest limits

- Revenue and cost figures are cash received and estimates; the invoices and Paystack export will replace the estimates.
- Search, ranking and AI-mention results are unmeasured because I could not see Search Console, Bing, GA4 or any AI engine's own reporting.
- Grok has no documented crawler, so nothing on the site can tune for it directly; the plan relies on the X account.
- Small samples throughout (22 payers, 8 ChatGPT payers): treat rankings as leads, not results.
- The refund fix and the new pages are covered by type checks and unit tests, not by a live end-to-end run.
