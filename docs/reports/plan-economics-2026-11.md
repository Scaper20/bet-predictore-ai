---
title: "KiqStat plan economics (checklist 2.3)"
subtitle: "Per-plan margin at three exchange rates and 0 / 20 / 35% partner commission, against the 25% target. 5 Nov 2026"
---

# Headline

- **Every plan clears the 25% target comfortably in normal use.** At typical Ask KiqStat use the margin is 95% to 97% with no partner, 75% to 77% with a 20% partner and 61% to 63% with a 35% partner, at any of the three exchange rates.
- **The worst case is where the target is at risk.** If a customer uses Ask KiqStat up to the daily spending cap every single day, a 35% partner commission pushes most options under 25% when the naira weakens to ₦1,700 to the dollar. At ₦1,550 the quarterly and yearly Pro, the three VIP cycles (by a hair, 24.6% to 24.7%) and the withdrawn Week pass fall short; Pro monthly and the day and weekend passes hold.
- **So a 35% partner rate is affordable on today's usage but has little room in the worst case, and 20% is safe everywhere.** Both are before fixed costs (below).
- **The margin per customer is not the problem; the number of customers is.** Fixed costs of about ₦95,000 to ₦108,000 a month need about 20 to 23 monthly Pro customers with no partner, 25 to 29 at a 20% partner and 31 to 35 at a 35% partner. October had 13 paid orders.

The script is `scripts/plan-economics.ts` (`npx tsx scripts/plan-economics.ts --md`). It reads the live prices, the Paystack fee estimate, the partner commission rule and the Ask spending caps from the code, so it cannot drift from what is sold. The assumptions it adds are at the end.

# What each option costs us (₦, at ₦1,550 to the dollar)

| Option | Price | Per day | Paystack fee | Ask, typical | Ask, at the cap |
|---|---|---|---|---|---|
| Pro monthly | 5,000 | 167 | 175 | 87 | 1,860 |
| Pro quarterly | 13,500 | 148 | 303 | 265 | 5,642 |
| Pro yearly | 48,000 | 132 | 820 | 1,064 | 19,801 |
| VIP monthly | 12,000 | 400 | 280 | 219 | 4,650 |
| VIP quarterly | 32,400 | 356 | 586 | 663 | 12,695 |
| VIP yearly | 115,200 | 316 | 1,828 | 2,659 | 45,260 |
| VIP day pass (live offer) | 500 | 500 | 8 | 7 | 186 |
| Weekend pass (withdrawn) | 1,000 | 500 | 15 | 15 | 372 |
| Week pass (withdrawn) | 2,000 | 286 | 30 | 51 | 868 |

# Margin if Ask is used to its daily cap every day (worst case)

Margin after the processor fee, the partner's commission and the Ask spend. ✗ is under the 25% target.

| Option | ₦1,400 / 0% | ₦1,400 / 20% | ₦1,400 / 35% | ₦1,550 / 0% | ₦1,550 / 20% | ₦1,550 / 35% | ₦1,700 / 0% | ₦1,700 / 20% | ₦1,700 / 35% |
|---|---|---|---|---|---|---|---|---|---|
| Pro monthly | 63% | 44% | 29% | 59% | 40% | 26% | 56% | 36% | 22% ✗ |
| Pro quarterly | 60% | 40% | 26% | 56% | 36% | 22% ✗ | 52% | 32% | 18% ✗ |
| Pro yearly | 61% | 41% | 27% | 57% | 37% | 23% ✗ | 53% | 33% | 19% ✗ |
| VIP monthly | 63% | 43% | 28% | 59% | 39% | 25% ✗ | 55% | 36% | 21% ✗ |
| VIP quarterly | 63% | 43% | 28% | 59% | 39% | 25% ✗ | 55% | 36% | 21% ✗ |
| VIP yearly | 63% | 43% | 28% | 59% | 39% | 25% ✗ | 55% | 36% | 21% ✗ |
| VIP day pass | 65% | 45% | 30% | 61% | 42% | 27% | 58% | 38% | 23% ✗ |
| Weekend pass | 65% | 45% | 30% | 61% | 42% | 27% | 58% | 38% | 23% ✗ |
| Week pass | 59% | 40% | 25% ✗ | 55% | 35% | 21% ✗ | 51% | 31% | 16% ✗ |

The VIP rows at ₦1,550 and 35% show 25% ✗ because they land just under 25.0% (24.6% to 24.7%).

# Largest partner commission that still leaves 25% (₦1,550)

| Option | Typical use | Worst case |
|---|---|---|
| Pro monthly | 72% | 36% |
| Pro quarterly | 72% | 32% |
| Pro yearly | 72% | 33% |
| VIP monthly | 73% | 35% |
| VIP quarterly | 72% | 35% |
| VIP yearly | 72% | 35% |
| VIP day pass | 73% | 37% |
| Weekend pass | 73% | 37% |
| Week pass | 72% | 31% |

# What this means

1. **The Ask spending caps are doing the protective work.** The daily caps were set (in `src/lib/ask/config.ts`) at about 40% of daily revenue, so a customer who maxes them every day still leaves a margin. That is why the worst case is a thinner pass, not a loss. Item 2.5 (allowance versus cap) is the decision about whether to leave them as they are.
2. **The quarterly and yearly cycles earn less per day** (₦148 and ₦132 a day for Pro against ₦167 monthly) while carrying the same per-day Ask risk, so they are first to fall under the target. The cycle caps were already lowered for this reason.
3. **The withdrawn Week pass is the weakest option** (₦286 a day). It is no longer sold, so this only matters for passes already held.
4. **The commission rate is a choice, not a constraint.** With a typical customer, even a 35% partner leaves 61%. The real cost of a partner is not the commission on one customer but whether the partner brings customers at all.

# Assumptions (change them in the script and re-run)

- **Exchange rates:** ₦1,400, ₦1,550 and ₦1,700 to the dollar; the code caps use ₦1,600.
- **Paystack fee:** 1.5% plus ₦100 from ₦2,500, capped at ₦2,000 (the estimate in `src/lib/partners.ts`). Replace with the real fee from the Paystack export when you send it.
- **Partner commission:** a percentage of the amount after the fee, as the commission code pays it.
- **Ask cost per question:** $0.00094, measured on 28 real questions on Haiku 5.5 (dearest $0.0023). Typical use is 2 questions a day on Pro, 5 on VIP and on passes. Worst case is the daily cap every day.
- **Passes:** the VIP day pass is ₦500 for 24 hours (the live offer). Weekend (₦1,000, 2 days) and Week (₦2,000, 7 days) are withdrawn and shown for comparison.
- **Margin here is before fixed costs.** Fixed costs and the free-tier cost are item 2.4.
- **Not modelled:** VAT (7.5% once registered, undecided), refunds and chargebacks, failed renewals, customers who never use their plan, or the 1,550 vs real settlement rate.
