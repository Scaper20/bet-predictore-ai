---
title: "KiqStat revenue statement, October 2026 (checklist 2.1)"
subtitle: "Same-period statement. Cash basis, from the payments table, 5 Nov 2026"
---

# Headline

October 2026 collected **₦77,250** from real customers (₦77,750 including the ₦500 founder test pass, which is still to be refunded). **About ₦76,700 reached us** after the Paystack fees we ourselves paid (₦574; see the reconciliation below). That is 13 paid orders from 43 people who tried to pay.

Against the fixed running costs in `docs/pricing.md` (about ₦95,000 to ₦108,000 a month once Vercel Pro, Supabase Pro and the data feed are all paid), October was **about ₦18,000 to ₦31,000 short**. The founder has chosen to treat the cost range as the real figure, so no invoices are needed to close item 2.2.

# Reconciliation against Paystack (6 November)

The Paystack export for 1 to 31 October (72 rows, 3 of them our own `@kiqstat.app` test checkouts, left out) matches the payments table exactly: **14 successful payments, ₦77,750, the same amounts and the same people**. No successful charge is missing from our records.

| Paystack, October | Count | Amount (₦) |
|---|---|---|
| Successful | 14 | 77,750 |
| Abandoned (buyer left checkout) | 53 | |
| Failed | 1 | |
| Reversed by the card issuer | 1 | 12,000 (the 24 October VIP renewal, never kept) |

- **Fees:** Paystack charged ₦2,393.60 on the 14 payments, but from 19 October the checkout adds the fee to what the customer pays (₦5,177.67 for a ₦5,000 plan), so **we paid only ₦573.75 of it** (four payments before the change) and received the full price on the ten after. My earlier estimate (₦2,359) was too high; real money in the bank is ₦77,176.25, or **₦76,676.25 from real customers** excluding the ₦500 test.
- **The 24 October renewal:** Paystack did charge the member on 24 October at 1:15 PM and then the card issuer **reversed** it ("Approved by Financial Institution", status reversed). No money was kept, so nothing was lost and no webhook failed. The earlier "missed renewal" was a reversed charge. The daily subscription check now says so.
- **Payment method:** card checkouts were 48 attempts and 2 successes (4%); bank and bank-transfer checkouts (OPay, PalmPay, others) were 21 attempts and 12 successes (57%). No card payment has succeeded since 8 October (0 of 25 attempts after 19 October). Most card failures read "The transaction was not completed": the buyer opened the card form and left.

# October by plan (cash received, successful payments only)

| Plan | Orders | Price each | Collected (₦) | Est. Paystack fee (₦) |
|---|---|---|---|---|
| Pro monthly, recurring | 2 | 5,000 | 10,000 | 350 |
| Pro monthly, one-off | 7 | 5,000 | 35,000 | 1,225 |
| VIP monthly, recurring | 1 | 8,000 (old price) | 8,000 | 220 |
| VIP monthly, one-off | 2 | 12,000 | 24,000 | 560 |
| Day pass | 1 | 250 (old price) | 250 | 4 |
| **Real customers** | **13** | | **77,250** | **2,359** |
| VIP day pass (founder test, 31 Oct) | 1 | 500 | 500 | 8 |
| **Total in the payments table** | **14** | | **77,750** | **2,366** |

Net of the fees we paid, real customers: **₦76,676** (Paystack's own settlement figures; the fee column above is the earlier estimate, and the real fee we bore was ₦574 because the customer pays it from 19 October).

Revenue split by type: one-off monthly purchases are **76%** of October cash (₦59,000); recurring subscription charges are 23% (₦18,000); passes are under 1%.

# The last four months

| Month | Sign-ups | People who tried to pay | Paid orders | Failed or abandoned | Collected (₦) |
|---|---|---|---|---|---|
| August | 2 | 1 | 1 | 1 | 700 |
| September | 24 | 10 | 3 | 16 | 13,400 |
| October | 216 | 43 | 14 | 65 | 77,750 |
| November (to 5th) | 21 | 9 | 4 | 9 (+2 pending) | 13,500 |

September and August amounts include the old ₦700 Week pass and the first ₦12,000 VIP charge. November so far is three ₦500 VIP day passes (₦1,500) and one ₦12,000 VIP one-off, with two checkouts still pending.

# Other money lines

- **Partner commissions:** none recorded, no partner has earned yet, so no commission cost in October.
- **Gifts:** 12 VIP gifts exist. They bring in nothing and are not counted as revenue.
- **Refunds:** none recorded in the payments table. The ₦500 test pass (31 Oct) is the only one planned (checklist 1.4).
- **Foreign cards:** every Flutterwave attempt (8 in October, 2 in November, in USD and GHS) failed. Nothing was collected in a foreign currency.
- **AI cost:** Ask KiqStat cost about **$0.004 in October** (10 calls) and $0.022 in November so far (58 calls), all on Haiku 5.5. At ₦1,550 to the dollar that is under ₦6 in October. The AI is not a material cost at today's volume.

# What this tells us

1. **Revenue is real but small, and mostly one-off.** Nine of the 13 real orders were one-off monthly purchases, not subscriptions that renew. Only three recurring charges happened in October, so there is almost no repeating revenue yet.
2. **Checkout loses most buyers.** In October 65 payment attempts failed or were abandoned against 14 that succeeded (18% success by attempt). Some of that is people closing the window, but a share is cards declined, and every foreign-card attempt failed. Finding the reasons (Paystack declines versus abandoned) is the cheapest revenue gain available.
3. **Break-even needs about 30 Pro-equivalent subscribers a month.** October had 13 paid orders and 3 repeating ones.

# Limits of this statement

- Cash basis. A ₦5,000 monthly charge is counted in the month it was paid, not spread over the month it covers.
- Checked against the Paystack export: nothing missing (see the reconciliation).
- Fees are Paystack's actual figures (export of 6 November).
- Costs are the estimated range in `docs/pricing.md`, accepted as the real figure by the founder.
