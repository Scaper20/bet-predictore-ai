# CTO review checklist (from the Complete Work Review, 4 Nov 2026)

The live, shareable version with findings, decisions and the checkpoint log is the Claude Doc
**KiqStat: CTO Review Progress**: https://claude.ai/artifact/LDRt5B5Y3M4AKmCDVzmeL9. This file mirrors
the checklist so it is visible next to the code. Owners: Claude (code, data, reports), Founder/CTO
(dashboards, money, legal), Both.

## 1. Production safety
- [ ] 1.1 Anthropic workspace hard spending limit set (Founder/CTO)
- [x] 1.2 Ask preflight green in production, offline tests pass, Ask switch confirmed on (Claude, 4 Nov)
- [ ] 1.3 Database backup and recovery: runbook, nightly backup, test restore; Supabase Pro decision (Both)
- [ ] 1.4 Real ₦500 VIP Pass purchase, receipt and refund checked end to end (Both)
- [ ] 1.5 VIP renewal anomaly: renewal handling made robust (docs/renewals.md), admin page /admin/renewals and a dashboard alert added; Paystack webhook log for the 24 Oct charge pending (Both)
- [ ] 1.6 Personal booking codes and live win-probability bar verified live (Both)

## 2. Financial baseline
- [ ] 2.1 Same-period revenue statement (Claude)
- [ ] 2.2 October cost invoices (Founder)
- [ ] 2.3 Plan-by-plan model as a script: 6 recurring options + passes, at three exchange rates, 0/20/35% commission, 25% target (Claude)
- [ ] 2.4 Free-tier cost and operating profit (Claude)
- [ ] 2.5 Allowance versus cap decision per plan, then implemented (Founder decides, Claude implements)

## 3. AI sustainability
- [ ] 3.1 Offline verification incl. cancelled-call cost booking (Claude)
- [ ] 3.2 Live benchmark, 40 questions × 5 configurations, ≤ about US$4; needs `ANTHROPIC_TEST_API_KEY` (Both)
- [ ] 3.3 Ledger reconciled with Anthropic billing; overrun rule (Both)
- [ ] 3.4 Margin and abnormal-usage alerts (Claude)

## 4. Analytics, growth and marketing
- [ ] 4.1 Human-traffic verification; bot filtering on signup source (Claude)
- [ ] 4.2 Acquisition source carried through to payment (Claude)
- [ ] 4.3 Pass conversion and upgrade report (Claude)
- [ ] 4.4 X captions, posting sequence, tagged links (Claude drafts, Founder approves)
- [ ] 4.5 48-hour and 7-day campaign reviews (Claude)
- [ ] 4.6 SEO plan for NPFL, CAF, AFCON (Claude)

## 5. Partner Agreement V2 (on hold until section 2 closes)
- [ ] 5.1 Founder's questionnaire answers recovered (Founder)
- [ ] 5.2 Commission schedule by plan and period from the model; no 35% promise (Claude drafts)
- [ ] 5.3 Legal and tax items (Founder + legal adviser)
- [ ] 5.4 Referral tracking verified end to end, incl. refund clawback (Claude)
