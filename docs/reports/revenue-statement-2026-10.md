---
title: "KiqStat revenue statement, October 2026 (checklist 2.1)"
subtitle: "Same-period statement. Cash basis, from the payments table, 5 Nov 2026"
---

# Headline

October 2026 collected **₦77,250** from real customers (₦77,750 including the ₦500 founder test pass, which is still to be refunded). After an estimated Paystack fee of about ₦2,360, **about ₦74,900 reached us**. That is 13 paid orders from 43 people who tried to pay.

Against the fixed running costs in `docs/pricing.md` (about ₦95,000 to ₦108,000 a month once Vercel Pro, Supabase Pro and the data feed are all paid), October was **about ₦20,000 to ₦33,000 short before the invoices are in**. That cost range is the earlier estimate, not an invoice: item 2.2 (October cost invoices) is what turns it into a fact.

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

Net of fees, real customers: about **₦74,891**. Paystack fee used: 1.5% plus ₦100 on amounts of ₦2,500 and above, as in `docs/pricing.md`; the real fee per charge is on the Paystack settlement report and should replace this estimate.

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
- Only payments in the database. If a customer paid and the payment was never recorded (the 24 Oct renewal case, checklist 1.5), it is missing here. Compare against the Paystack transaction export for October to close that.
- The fee is an estimate, not Paystack's settlement figure.
- Costs are not invoiced yet (checklist 2.2).

# What I need from you

1. The Paystack **transactions export for October** (Dashboard, Transactions, Export, 1 to 31 Oct) so I can reconcile it to this table and use the real fees.
2. The **October invoices** for Vercel, Supabase, TheSportsDB, Sendbyte and the domain (item 2.2), so the cost line stops being an estimate.
3. Confirm whether any of the 13 paid orders were friends, staff or tests apart from the ₦500 pass.
