# Pass conversion, upgrades and the cost of the free tier

Checklist items 4.3 and 2.4 · data to 6 November 2026 · our own accounts excluded (`@kiqstat.app`, `@kiqstat.com.ng`, `@betrix.com.ng`)

## The short version

- **22 of 262 accounts (8.4%) have ever paid. 61 tried to pay, so 36% of the people who reached checkout completed it.** Nobody has paid twice.
- **Paying once converts about three times better than a card subscription.** Pro paid once: 7 of 24 attempts succeeded (29%). Pro on a recurring card: 2 of 24 (8%). Keep pushing the pay-once option.
- **No one has upgraded from a cheap pass to a plan.** The three ₦700 passes (Aug to Sep) and the one ₦250 day pass have not been followed by a purchase. The ₦500 VIP day pass is too new to judge (four buyers since 31 Oct, one of them a test), so the upgrade check is set for 8 November, after the trial ends on 7 November.
- **The free tier costs almost nothing in AI.** Free and guest Ask questions cost about $0.007 (under ₦11) in five weeks. Its cost is a share of fixed bills, not of variable ones.
- **October did not cover its costs on the estimate.** Collected ₦77,250 (about ₦74,900 after fees) against estimated fixed costs of ₦95,000 to ₦108,000. These are estimates, not invoices (2.2 is still open).

## 4.3: Who pays and for what

Successful payments by plan (people, not accounts that tried):

| Plan | Paid (people) | Money | Notes |
|---|---|---|---|
| Pro, monthly, paid once | 7 | ₦35,000 | the best-selling plan |
| VIP, monthly, paid once | 3 | ₦36,000 | 2 more attempts still pending |
| Pro, monthly, card subscription | 2 | ₦10,000 | |
| VIP, monthly, card subscription | 2 | ₦20,000 | one of the two was ₦8,000 |
| ₦500 VIP day pass | 4 | ₦2,000 | since 31 Oct; includes the founder's test |
| ₦700 monthly pass (old) | 3 | ₦2,100 | Aug and Sep; no longer sold |
| ₦250 day pass (old) | 1 | ₦250 | 4 Oct |

### Checkout: how many attempts succeed

Counting every attempt (some people tried more than once):

| Plan | Attempts | Succeeded | Rate |
|---|---|---|---|
| Pro monthly, paid once | 24 | 7 | 29% |
| Pro monthly, card subscription | 24 | 2 | 8% |
| VIP monthly, paid once | 21 | 3 | 14% (2 pending) |
| VIP monthly, card subscription | 17 | 2 | 12% |
| ₦500 VIP day pass | 10 | 4 | 40% (1 pending) |
| Quarterly or yearly (Pro, VIP, pass) | 5 | 0 | 0% |

Read this as a direction, not a result: the numbers are small. Two things stand out. The cheapest product (the ₦500 pass) has the best checkout rate, and the card subscription is the weakest way to pay for Pro. Whether the card failures are the card issuer, the Paystack flow or hesitation is not visible in our data; the Paystack transaction export (founder input for 2.1) would show the decline reasons.

### Repeats and upgrades

- **Repeat purchases: none.** All 22 payers appear once. Card subscriptions renewing through Paystack may not create a payment row (see `docs/renewals.md`), so this shows that no one has bought again by hand; it cannot show that no subscription has renewed.
- **Cheap pass to plan: none yet.** The old ₦700 and ₦250 buyers have not bought a plan.
- **₦500 pass cohort:** four buyers between 31 Oct and 3 Nov, trial live until 7 Nov. After that date I will count how many of the three real buyers pay for Pro or VIP within 7 days. That is the number that decides whether the pass is a good door in or a one-off sale.

### What this suggests

1. Make pay-once the default on the Pro and VIP pages. It sells about three times as often per attempt.
2. Keep the ₦500 pass if the 8 November check shows any buyer upgrading; otherwise a pass is only a cheap sale.
3. Quarterly and yearly have 5 attempts and no sales. Do not spend effort on them yet.

## 2.4: What the free tier costs

| Item | Figure |
|---|---|
| Accounts active in the last 30 days | 240 (80 in the last 7 days) |
| Free and guest Ask questions, 1 Oct to 5 Nov | 11 questions, $0.0069 (about ₦11) |
| Paid-tier Ask questions, same period | 20 questions, $0.0214 |
| Match analyses already stored and reused | 7,960 |
| Estimated fixed cost per month (docs/pricing.md) | ₦95,000 to ₦108,000 |
| Fixed cost spread over 240 active accounts | about ₦400 to ₦450 each |

Free users cost nothing measurable to serve: match analyses are written once per match and reused, and Ask is capped at 3 questions a day on Haiku. What the free tier does is bring in visitors who are, on the plan, 8% likely to ever pay. The right test of the free tier is therefore the conversion above, not its cost.

### Operating position (estimate)

| | ₦ per month |
|---|---|
| October collected | 77,250 |
| Less Paystack fees (estimated) | about 2,360 |
| Net | about 74,900 |
| Estimated fixed costs | 95,000 to 108,000 |
| Estimated result | about 20,000 to 33,000 short |
| Pro paid-once sales needed to cover the top of the range | about 22 a month (₦5,000 each, about ₦4,800 after fees) |

October had 13 paid orders; the plan above needs roughly twice that, every month. The Vercel and Supabase upgrades take effect in November, so October's actual spend may have been lower than this; the invoices (2.2) will settle it.

## What I need from the founder

1. Paystack transaction export for October, to see why card subscriptions fail.
2. The October invoices (2.2) to turn the operating position from an estimate into a fact.
3. A decision on making pay-once the default on the pricing page.

## Method and limits

- Source: the live database (`payments`, `profiles`, `subscriptions`, `ask_questions`) on 6 November 2026.
- Attempts include failed and pending rows. A person who retried counts more than once in the rate table and once in the "people" columns.
- Revenue is cash received. Fees are estimated with the Paystack local-card rate (1.5% + ₦100 from ₦2,500, cap ₦2,000).
