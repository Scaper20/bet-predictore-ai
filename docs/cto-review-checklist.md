# CTO review checklist (from the Complete Work Review, 4 Nov 2026)

The live, shareable version with findings, decisions and the checkpoint log is the Claude Doc
**KiqStat: CTO Review Progress**: https://claude.ai/artifact/LDRt5B5Y3M4AKmCDVzmeL9. This file mirrors
the checklist so it is visible next to the code. Owners: Claude (code, data, reports), Founder/CTO
(dashboards, money, legal), Both.

## 1. Production safety
- [x] 1.1 Anthropic workspace hard spending limit set (Founder/CTO)
- [x] 1.2 Ask preflight green in production, offline tests pass, Ask switch confirmed on (Claude, 4 Nov)
- [x] 1.3 Backup and recovery (Both, 6 Nov): Supabase daily backups confirmed by screenshot; weekly off-site dump restored into a scratch database and matched production on 7 tables (restore drill now automatic every Sunday)
- [x] 1.4 Real ₦500 VIP Pass purchase, receipt and refund (Both): purchase confirmed in Paystack and our records; refund test waived by the founder, 6 Nov
- [x] 1.5 VIP renewal anomaly (Both, 6 Nov): root cause found in the Paystack export: the 24 Oct charge was reversed by the card issuer, so no money was kept and no webhook was lost. Renewal handling stays robust; the daily check now reports reversed charges as such
- [x] 1.6 Personal booking codes and live win-probability bar verified live (Both)

## 2. Financial baseline
- [x] 2.1 Same-period revenue statement: docs/reports/revenue-statement-2026-10 (Claude, 5 Nov; Paystack export and invoices pending from founder)
- [x] 2.2 October cost invoices: the founder accepted the estimated range (₦95,000 to ₦108,000 a month) as the real figure, 6 Nov
- [x] 2.3 Plan-by-plan model as a script (scripts/plan-economics.ts, docs/reports/plan-economics-2026-11): 6 recurring options + passes, at three exchange rates, 0/20/35% commission, 25% target (Claude)
- [x] 2.4 Free-tier cost and operating profit (Claude, 6 Nov; operating profit is an estimate until 2.2 invoices)
- [x] 2.5 Allowance versus cap: approved by the founder 6 Nov; VIP Ask allowance lowered from 100 to 80 a day to match the US$0.10 day cap (on dev)

## 3. AI sustainability
- [x] 3.1 Offline verification incl. cancelled-call cost booking: cancelled calls now booked for streamed text and sent prompt (Claude, 5 Nov)
- [ ] 3.2 Live benchmark, 40 questions × 5 configurations, ≤ about US$4; needs `ANTHROPIC_TEST_API_KEY` (Both)
- [ ] 3.3 Ledger reconciled with Anthropic billing; overrun rule (Both)
- [x] 3.4 Margin and abnormal-usage alerts: daily cron /api/cron/ask-watch, rules in src/lib/ask/watch.ts (Claude, 5 Nov)

## 4. Analytics, growth and marketing
- [~] 4.1 Signups verified as people and filtered (Claude, 5 Nov); site visits: Vercel shows Nigeria is 2,376 of 30,592 October visitors, the rest are non-human (see SEO plan); GA4 and Mixpanel bot filter still from founder
- [x] 4.2 Acquisition source carried through to payment: Revenue by source on Admin Traffic (Claude, 5 Nov)
- [x] 4.3 Pass conversion and upgrade report (Claude, 6 Nov; the 500 naira pass upgrade check is due 8 Nov)
- [~] 4.4 X captions, posting sequence, tagged links (Claude drafts, Founder approves): 14 captions, 14-day sequence and tagged links drafted in docs/reports/x-pack-2026-11.md, awaiting founder approval
- [~] 4.5 48-hour and 7-day campaign reviews (Claude): query and procedure ready in docs/campaign-review.md; runs once the X posts go out
- [~] 4.6 SEO plan for NPFL, CAF, AFCON (Claude): widened to whole site plus GEO (Grok first); plan in docs/reports/seo-geo-plan-2026-11.md, needs founder inputs

## 5. Partner Agreement V2 (on hold until section 2 closes)
- [ ] 5.1 Founder's questionnaire answers recovered (Founder)
- [x] 5.2 Commission schedule approved 6 Nov (20% standard, 25% named, 30% ceiling; passes excluded from commission). Partner Agreement V2 written for kingbra (20%) and squid (25%), ready to send once the blanks are filled
- [ ] 5.3 Legal and tax items (Founder + legal adviser)
- [x] 5.4 Referral tracking verified (Claude, 6 Nov): chain checked, Paystack refund now reverses the commission; first real payment still to be seen
