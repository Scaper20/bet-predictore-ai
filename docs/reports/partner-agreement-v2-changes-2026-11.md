---
title: "Partner Agreement V2: what changed from V1, and what is still open"
subtitle: "Companion to the V2 working draft. 6 November 2026. Based on the Final V1 you sent, the CTO review (section 7), the commission model and the code as it stands"
---

# 1. The short version

- **V2 keeps V1's structure and numbering (clauses 1 to 16), so the two can be compared clause by clause.** I changed thirteen clauses, added two clauses (4.7 pilot and 4.8 ceiling) and two annexes. Everything else is V1 word for word, apart from small cross-reference fixes.
- **The main change is clause 11.3.** In V1 a customer who was attributed before termination but paid for the first time *after* termination still earned the Partner 12 months of commission. That is open-ended exposure, which the CTO review flagged. In V2 only customers who had **already made a first payment** before termination keep earning, and only to the end of their own 12 months, so the longest any liability can run is 12 months after termination.
- **Commission follows your approved schedule:** 20% of net standard, up to 25% by written approval, a hard ceiling of 30% written into the contract (clause 4.8). There is no 35%. The schedule is in Annex A by plan and billing period, all at 20% today, so a different rate for a plan can be set later without redrafting.
- **KiqStat gets controlled flexibility:** a 90-day pilot with seven days' notice (4.7) and prospective rate changes on 30 days' notice that affect only new customers (4.6).
- **The agreement matches the software almost exactly.** The gaps are listed in section 4. None blocks signing.
- **This is a working draft, not legal advice.** A Nigerian lawyer should review it, especially tax (5.5) and advertising (7.3).

# 2. Clause by clause

| V1 clause | V2 change | Why |
|----------------|----------------------------------------------|--------------------------------------|
| Front page | Added a "key terms at a glance" table | A partner can see the deal without reading 16 clauses; the clauses still govern |
| Headings | Fixed V1's repeated headings ("3 Referral attribution continued", "5 Payment adjustments and taxes", "9 Information protection continued", "11 Payments after termination"), which were page-break artefacts | Clean numbering; no content change |
| 3.1 | Eligible referral now says "a successful payment for a qualifying product under 4.2" instead of "subscription payment" | Matches 4.2 on passes |
| 4.1 Net Payment | Now "the amount KiqStat actually receives, being the price less any processor fee KiqStat itself bears"; a fee the customer pays on top is not deducted again | Since 19 October pay-once buyers pay Paystack's fee on top (Paystack export). V1's "less the actual processor fee" would have deducted a fee KiqStat never paid |
| 4.2 | Lists qualifying products; adds a bracketed choice on passes and trial offers (NGN 250 and up), and excludes gifted access | The software currently credits commission on passes; decide whether that is intended |
| 4.5 | Where the processor has not yet reported a fee, an estimate may be used and must be corrected in the next statement; commission is recorded in the payment's currency, paid in naira | Matches how the software works |
| 4.6 Rate changes | KiqStat may change the standard rate on 30 days' notice for customers first attributed afterwards, without needing the Partner's acceptance; the Partner can terminate instead. Existing referrals keep their rate. A cut for existing referrals still needs written agreement | V1 required acceptance for any change, which is the opposite of the "prospective changes" the CTO review asks for |
| 4.7 Pilot (new) | First 90 days after activation: seven days' notice either way; written decision by the 15th business day after; silence means the Partner continues | "Controlled pilots" in the CTO review |
| 4.8 Ceiling (new) | No rate above 30% ever; none KiqStat believes would make a paid plan unprofitable under its full-usage review | Conditions 1 and 2 of the CTO review; 30% is the limit in the commission model's worst case |
| 5.4 | Reversals are notified to the Partner; partial refunds are still prorated as in V1 | The Partner must be able to see why a payout is smaller |
| 5.5 Tax | Marked as to be settled with the legal adviser | Checklist 5.3 |
| 7.1 | Any figure about KiqStat's record must come from the published track record page on the day, with its date | The rule already used in the X pack; avoids made-up accuracy claims |
| 11.1 | Seven days' notice during the pilot | Follows 4.7 |
| 11.2 | A customer attributed but not yet paid at termination does not qualify, with a bracketed optional 30-day tail if KiqStat terminates without cause | Closes the V1 "later first payment" loophole |
| 11.3 | Locked Referrals: only customers who paid before termination, to the end of their 12 months. If KiqStat terminates for the Partner's breach of clause 7 or for fraud, commission on customers acquired through the bad promotion is forfeited; the rest continue | The central CTO-review fix, and a proportionate remedy |
| 14.3 | Cross-refers rate changes to 4.6 | Consistency |
| 16.1 | Subject to Annex B for existing partners | V1 would have replaced earlier terms wholesale |
| Annex A (new) | Commission schedule by product and period with worked examples | "Schedule by plan and period" in the CTO review |
| Annex B (new) | Placeholder for partners who signed V1 | Needs your input (section 3) |

Clauses 1, 2, 3.2 to 3.4, 4.3 and 4.4 (wording tidied only), 5.1 to 5.3 and 5.6, 6, 8, 9, 10, 12, 13, 15 and the signature block are unchanged from V1.

# 3. What I need from you (and the lawyer)

1. **The details of any V1 agreements already signed** (who, rate, date), to complete Annex B. The live partner list has three partners: kingbra at 20%, squid at 25% and scaper at 20% (suspended). I do not know which of them signed V1.
2. **Passes and trial offers:** should the ₦500 VIP pass and similar offers earn commission (clause 4.2)? The software currently pays it; at 20% that is ₦100 a pass. My lean: include, for simplicity.
3. **The 30-day tail** in clause 11.2: include it if KiqStat ends the relationship without cause?
4. **The questionnaire answers** (5.1) on subscription eligibility, earning duration, existing agreements and pilot review. I used the V1 positions and the approved commission schedule; check that nothing you answered conflicts.
5. **Legal adviser (5.3):** tax wording in 5.5; whether the advertising clearance wording in 7.3 meets Nigerian rules for betting-related promotion; the liability cap in 12.3; and enforceability of the forfeiture in 11.3.
6. **The legal operator's name, registration details and addresses** for clause 1.1, and the territories for 2.1.

# 4. Does the software match the agreement?

I checked each commercial term against the code.

| Term | Software today | Status |
|----------------|----------------------------------------------|--------------------------------------|
| 20% of net, ceiling | Default 20%; admin ceiling now 30% | Matches |
| Net after processor fee | Uses the fee Paystack reports, so a buyer-paid fee is not deducted; estimates only if no fee is reported | Matches |
| 12-month earning period from first payment | Window runs from the user's first successful payment | Matches |
| 90-day first-click attribution | First valid partner click wins, kept 90 days, not refreshed or replaced | Matches |
| 14-day hold, NGN 10,000 minimum, monthly payout | Same; payout run and transfer sheet are manual | Matches (founder pays by hand) |
| Refund reversal, clawback of a paid commission | Automatic on a Paystack refund; founder emailed | Matches, except partial refunds below |
| **Partial refund prorated** | The code reverses the *whole* commission on any refund | **Gap.** Fairer to the Partner than the code; fix when a partial refund first happens, or now if you prefer |
| **Passes earn commission** | They do | Depends on your answer to 3.2 |
| **Rate by plan and period** | One rate per partner | Fine while Annex A is a flat 20%; needs code if rates diverge |
| **Termination, Locked Referrals, forfeiture, pilot** | No termination state; a suspended partner earns nothing new at signup and cannot be paid, but commission on an existing referral's payment still accrues | Handle by hand for now (you pay manually); build a termination action when a partner is first terminated |
| **Telling the Partner about a reversal** | The founder is emailed; the Partner is not | Manual: tell the partner when you adjust a payout |
| Flutterwave refunds | Not handled | Only matters if Flutterwave is used for partner customers (still unconfirmed) |

# 5. Next steps

1. You send items 1 to 6 in section 3.
2. I complete Annex B and the bracketed choices and produce a clean V2, plus a redline against V1 (Word tracked changes) for your lawyer.
3. The lawyer reviews; I apply the changes.
4. Before the first V2 partner goes live: confirm the Partner's link, activate in writing, and make one real test purchase through it to see a commission appear and reverse (item 5.4).
