---
title: "KiqStat CTO review: second pass"
subtitle: "What your Paystack export, backups screenshot, decisions and ticks changed. 6 November 2026. Follows the first-pass report (cto-review-first-pass-2026-11) and your task list (founder-tasks-second-pass-2026-11)"
---

# 1. Summary

- **The 24 October "missed renewal" is explained, and it is good news.** The Paystack export shows the member's ₦12,000 card charge at 1:15 PM that day with the status **reversed**: the card issuer took it back. No money was kept and no webhook was lost. Item 1.5 is closed.
- **The Paystack export matches our database exactly:** 14 successful payments, ₦77,750, the same people and amounts. Nothing is missing. The October statement (2.1) is final.
- **Card payments at checkout are almost dead.** Card: 48 attempts, 2 successes (4%), none since 8 October. Bank and bank transfer (OPay, PalmPay): 21 attempts, 12 successes (57%). This is the biggest revenue finding so far.
- **Real fees were lower than my estimate.** From 19 October the buyer pays Paystack's fee on top, so we paid only ₦574 in October. Real customers left us **₦76,676**.
- **I found and fixed a bug in Ask KiqStat** that the benchmark exposed: when it used the pick cards it wrote its answer twice (4 of 40 answers).
- **All your approved decisions are in the code on `dev`**, along with the refund email and the improved renewal check.
- **Still waiting on you:** GA4 and Mixpanel, the Anthropic billing figures, the carousel images and fixtures, 5.1 and 5.3, the ad spend, and the merge and promote.

# 2. What your inputs closed

| Item | Result |
|------------------------------|----------------------------------------------------------------------|
| 1.3 Backups | Closed. Screenshot received: daily physical backups every night at about 00:28 UTC, 30 October to 6 November. The weekly off-site copy was restored into a scratch database and matched production on all seven tables (section 5) |
| 1.4 ₦500 pass refund | Waived by you; the purchase itself is confirmed in Paystack (31 Oct, ₦500, settled 1 Nov) |
| 1.5 Renewal anomaly | Closed: the charge was reversed by the card issuer (section 3) |
| 2.1 Revenue statement | Final, reconciled to Paystack (section 3) |
| 2.2 Invoices | Closed: the estimated range ₦95,000 to ₦108,000 a month is treated as the real cost |
| 2.4 Free tier and operating profit | Final on that basis (section 4) |
| 2.5 Allowance versus cap | Approved: VIP allowance lowered from 100 to 80 a day so it matches the US$0.10 day cap |
| 5.2 Commission schedule | Approved: 20% standard, 25% named, 30% ceiling; the ceiling in the admin is now 30% (it was 50%) |

# 3. Reconciling October with Paystack

Source: your Paystack export for 1 to 31 October, 72 rows. Three rows are our own `@kiqstat.app` test checkouts and are left out.

| Paystack status | Count | Notes |
|----------------------|------------------------------|------------------------------------------------|
| Successful | 14 | ₦77,750, identical to our payments table, including the ₦500 test pass |
| Abandoned | 53 | The buyer opened checkout and left, or never sent the transfer |
| Failed | 1 | A transfer closed by timeout |
| Reversed | 1 | The 24 October ₦12,000 VIP renewal |

**Fees.** Paystack's fees total ₦2,393.60. Four early payments (4 and 8 October) carried fees paid by us: ₦573.75. From 19 October the checkout adds the fee to the customer's price (₦5,177.67 for a ₦5,000 plan), so the ten payments after that cost us nothing. Real money received from real customers: **₦76,676**, against the ₦74,891 I estimated earlier.

**What this means for pricing and partners.** With the buyer paying the fee, a ₦5,000 Pro sale brings in the full ₦5,000. Break-even on the estimated costs is therefore about 19 to 22 Pro sales a month with no partner. Partner commission uses the fee Paystack reports for each payment, so on these buyer-paid-fee payments the net equals the price and partners earn on the full ₦5,000 (₦1,000 at 20%, not the ₦965 in the earlier partner report). Only when Paystack reports no fee does the code fall back to an estimate. **Correction:** an earlier draft of this paragraph said partners were underpaid by about 3%; that was wrong, and the code already matches the Net Payment wording in the Partner Agreement V2 draft.

**The 24 October renewal, in full.** Paystack charged the card at 1:15 PM ("Approved by Financial Institution"), then the status became reversed. The member's period ended that day, so access ended with it, correctly. The daily subscription check now recognises a reversed charge and says so in its email, so it will stop calling this "unexplained". The member has already been given a gifted month. Paystack still shows the subscription active with the next charge on 24 November.

## 3.1 The 24 October X ad

You ran an X ad that day. Our records for people who signed up on 24 October: **37 signups, 10 from X links, 7 of them tried to pay, 2 paid, ₦17,000.** The Paystack export shows nine checkout attempts that day (four people on the ₦12,000 VIP price), and only one completed that evening. One buyer tried six times between 24 and 30 October (five bank transfers left unpaid, one card) and finally paid ₦12,000 on 4 November.

I cannot judge the ad's return without its cost. **Please send the ad spend** and I will put it beside ₦17,000 and the later purchases from that cohort.

## 3.2 Payment method

| Method | Attempts | Successful | Rate |
|--------|------------------------|--------------|------------------------------------------------------|
| Card | 48 | 2 | 4% (both on 8 October) |
| Bank (OPay and others) | 9 | 7 | 78% |
| Bank transfer (PalmPay, OPay, others) | 12 | 5 | 42% |

Of the 25 card attempts after 19 October, none succeeded; 45 of 48 card attempts ended "The transaction was not completed", meaning the buyer reached the card form and left. Seven bank-transfer attempts ended "Awaiting Transfer": the buyer asked for an account number and never paid.

**Recommendation (a decision for you, not changed in code):** make bank and bank transfer the first thing a buyer sees at checkout, and consider hiding or demoting card until we learn why it fails. I have not changed the checkout because I cannot verify here how Paystack orders its payment tabs; the change is small once you agree, and it is the cheapest revenue gain available.

# 4. Money position (final on the accepted costs)

| | ₦ per month |
|------------------------------|----------------------------------------------------------------------|
| October collected from real customers | 77,250 |
| Received after the fees we bore | 76,676 |
| Estimated fixed costs (accepted as real) | 95,000 to 108,000 |
| **Result** | **about 18,000 to 31,000 short** |
| Pro monthly sales needed to cover costs, no partner | 19 to 22 |

October had 13 paid orders; 9 were one-off. The free tier costs next to nothing in AI (under ₦11 in five weeks), so the shortfall is a volume problem, and the biggest lever is checkout conversion (section 3.2).

# 5. Backup restore test

**Result: the backup restores, and the restored copy matches production.** I ran the weekly off-site backup from GitHub (run 4, `dev` copy of the workflow), then restored that dump into a throwaway database inside the GitHub runner and counted rows. Nothing touched production except read-only counts. Production was not restored over, and nothing of yours can be damaged by it.

| Table | Production | Restored copy | Result |
|--------|------------------------|--------------|------------------------------------------------------|
| profiles | 269 | 269 | match |
| subscriptions | 21 | 21 | match |
| payments | 117 | 117 | match |
| passes | 5 | 5 | match |
| predictions_log | 1,555 | 1,555 | match |
| partner_commissions | 0 | 0 | match |
| auth.users | 269 | 269 | match |

- The restore took 14 seconds for the data. The whole job (dump, encrypt, upload, restore, compare) took about two minutes.
- The restore log showed 3 harmless errors: the scratch database already had a `public` schema, and a text-search helper (`unaccent`) was not installed in it. The helper is now installed in the scratch database so the log is clean next time.
- The encrypted dump was also saved as an artifact for 8 days, as the weekly job always does.
- **This drill now runs by itself every Sunday** with the backup, and turns the job red if any table comes back short. Supabase's own daily backups (your screenshot) are the first line; this is the independent second copy, and it is now proven to restore.
- What this does not prove: restoring a *Supabase* daily backup through their dashboard. That is their feature and I cannot run it without risking the live project; the weekly drill covers recoverability of the data itself. Item 1.3 is closed on that basis.

# 6. Ask KiqStat: lab results and a bug found

**What the lab holds.** One run only: 40 questions on one preset ("capped") on 5 November, costing US$0.032 (about US$0.0008 a question), with no ratings entered. I found no data for the other four presets, so the five-way comparison (3.2) has not happened. 39 of the 40 questions were answered; one gave no answer.

| Question type | Questions | Average cost (US$) | Model calls | Answer length |
|--------------------|--------------------|--------------------|--------------------|--------------------|
| Combo | 6 | 0.00116 | 3.2 | 836 characters |
| Tool-heavy | 6 | 0.00117 | 3.8 | 528 |
| Analysis | 6 | 0.00086 | 3.7 | 572 |
| Price | 6 | 0.00096 | 3.7 | 413 |
| Simple | 8 | 0.00065 | 3.1 | 328 |
| Off-topic | 5 | 0.00024 | 1.4 | 397 |
| Live | 3 | 0.00021 | 2.3 | 214 |

The most expensive single question cost US$0.0019, so the daily caps are never the limit in normal use.

**The bug.** In 4 of the 40 answers (3 combo, 1 analysis) the answer text appeared twice, run together, with a slightly different wording the second time. All four happened on the path where the assistant shows pick cards: it wrote the answer, called the cards tool, then wrote the answer again. Real users on that path would have read it twice. **Fixed on `dev`:** the system prompt now says to answer once and write nothing after the cards appear, and the cards tool tells the model the same thing in its result. A test guards the prompt wording.

**For 3.2 to finish:** run all five presets at `/admin/ask-lab` (about US$4) and rate the answers. If you did run them, the results are not in the database and the run may have failed; tell me and I will look at the logs.

# 7. What was built since the first pass (all on `dev`)

| Change | Why |
|------------------------------|----------------------------------------------------------------------|
| Daily subscription check recognises a charge reversed by the card issuer | 1.5: no more "unexplained" alert for the 24 October case |
| An email to the founder whenever a Paystack refund reverses a partner commission, saying whether it was cancelled or needs deducting from the next manual payout | Partners are paid by hand; you must know |
| Partner commission ceiling lowered from 50% to 30% | 5.2 |
| VIP Ask allowance lowered from 100 to 80 a day (pricing page, plan list, docs) | 2.5 |
| Ask answers no longer repeat after the pick cards | Benchmark bug |
| `robots.txt` blocks `/football/h2h?` pair pages | The crawl trap, approved in 4.6 |
| Restore drill added to the weekly off-site backup | 1.3 |
| Revenue statement updated with the Paystack reconciliation | 2.1 |

Your pay-once decision needed no change: pay-once is already the main button on the billing page and "Auto-renew with a card instead" is the secondary link.

**About the partner refund email.** I read your note as: when a partner's customer is refunded, you receive an email so you can adjust the manual payout. That is what was built. If you meant something else (a partner asking you for a refund of their own purchase, or a partner requesting a payout), tell me and I will add that email too. Today partners have no self-service page, so there is nothing for them to request in the app.

# 8. What is still open

| Item | Needs |
|------------------------------|----------------------------------------------------------------------|
| Merge `dev` and promote | You. Nothing above is live until then |
| 2.5 follow-up | Nothing; done in code after the merge |
| 3.2 Ask lab | Run all five presets and rate the answers |
| 3.3 Ledger against Anthropic billing | Anthropic billing figures (October and November to date) |
| 4.1 Site visits | GA4 figures and the Mixpanel bot-filter setting (the Vercel analysis is already in the SEO plan) |
| 4.4 X test | Carousel images and the week's fixtures; the ad spend; then post and I run the 48-hour review (4.5) |
| 4.6 SEO | Search Console verified (you ticked it); I need read access or exports to measure, plus the author line (you chose "the KiqStat team") |
| 5.1, 5.3 | Questionnaire answers; legal and tax with your adviser |
| Flutterwave | Whether it is used for partner customers (refund reversal only covers Paystack) |
| Dates | 8 November: the ₦500 pass upgrade check and the two Pro renewals |
