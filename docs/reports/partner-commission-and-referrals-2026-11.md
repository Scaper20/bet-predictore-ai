# Partner commission schedule and referral tracking check

Checklist items 5.2 and 5.4 · 6 November 2026 · for the Partner Agreement V2, still waiting on 5.1 and 5.3

## The short version

- **Recommended schedule: 20% of the net payment for a user's first 12 months as a payer, with 25% for named partners and a hard ceiling of 30%.** 30% leaves at least 25% margin on every plan even when a customer uses Ask KiqStat to its daily cap every day; 35% does not. No 35% promise should go in the agreement.
- **The partner system works up to the point of money, but has never been used with money.** There are 3 partners and 3 referred signups, none of whom has paid, so there are 0 commissions. Everything below is tested in code and in a rolled-back run on the live database, not seen with a real payment.
- **One real gap found and fixed:** a Paystack refund marked the payment refunded but left the partner's commission standing, so a partner could be paid on money that went back. It now cancels a held commission, or leaves a clawback on the next payout if it was already paid (`src/app/api/billing/webhook/route.ts`).

## 5.2 The schedule

### How the deal works today (from the code)

| Rule | Today |
|---|---|
| Basis | Rate × the net payment (amount paid minus the processor's fee) |
| Default rate | 20% (`DEFAULT_RATE_BPS`) |
| Highest rate the admin can set | 50% (`MAX_RATE_BPS`) |
| Who earns | Payments by a user the partner brought, for the user's first 12 months as a payer |
| Attribution | The partner's link `?ref=<code>` sets a cookie; signing up within 90 days credits the partner |
| Hold | 14 days (the refund window), then payable |
| Minimum payout | ₦10,000 per currency; smaller balances roll over |
| Live partners | kingbra 20%, squid 25%, scaper 20% (suspended) |

### What each payment earns a partner at 20% (₦)

| Plan | Price | Paystack fee | Net | Partner earns |
|---|---|---|---|---|
| ₦500 VIP day pass | 500 | 8 | 492 | 98 |
| Pro monthly | 5,000 | 175 | 4,825 | 965 |
| Pro quarterly | 13,500 | 303 | 13,197 | 2,639 |
| Pro yearly | 48,000 | 820 | 47,180 | 9,436 |
| VIP monthly | 12,000 | 280 | 11,720 | 2,344 |
| VIP quarterly | 32,400 | 586 | 31,814 | 6,363 |
| VIP yearly | 115,200 | 1,828 | 113,372 | 22,674 |

So a partner who brings one Pro customer who pays once earns ₦965; one who stays on VIP monthly for the full 12 months earns about ₦28,000. To reach the ₦10,000 minimum payout, a partner needs roughly eleven Pro monthly sales.

### What the model allows (from the plan economics report, ₦1,550 to the dollar)

| Case | Largest commission that still leaves a 25% margin |
|---|---|
| Typical Ask KiqStat use | 72% to 73%, every plan |
| Ask KiqStat at the daily cap every day (worst case) | 31% (Week pass) to 37% (day and weekend passes); Pro monthly 36%, Pro quarterly 32%, VIP 35% |

Margin here is before fixed costs. Fixed costs of about ₦95,000 to ₦108,000 a month (estimate, invoices pending) need about 20 to 23 Pro customers with no partner, 25 to 29 at 20%, and 31 to 35 at 35%. A high rate therefore costs more in volume needed than in per-customer margin.

### Recommendation

| Item | Proposal | Why |
|---|---|---|
| Standard rate | 20% of net, months 1 to 12 | Safe on every plan in the worst case with room to spare (35% to 42% margin at 20% in the worst case, 75% to 77% typical) |
| Higher rate | 25% for named partners, agreed in writing | The model clears it at any plausible rate |
| Hard ceiling | 30%, set in the code and the agreement | The model's limit in the worst case is 31% to 37% at ₦1,550, so 30% is the last round figure inside it; at ₦1,700 the room is thinner, so re-run `scripts/plan-economics.ts` before raising anyone above 25% |
| Not offered | 35% | Misses 25% in the worst case on most plans (24.6% to 24.7% on VIP, lower on Pro quarterly and yearly) |
| Basis | Net of the processor's fee, as now | A partner is paid on cash that arrives |
| Window | 12 months from the user's first payment | As now |
| Hold | 14 days, with clawback of paid commission if refunded | As now, now enforced automatically for Paystack refunds |
| Minimum payout | ₦10,000, balance rolls over | As now |

Two changes needed in the code if the founder agrees: lower the ceiling from 50% to 30% (`MAX_RATE_BPS` in `src/lib/partners.ts`), and leave the 20% default. Rates above 20% for a partner remain an explicit admin decision.

Decisions left to the founder and the legal adviser (5.1, 5.3): the questionnaire answers, tax on commission, partner status (independent, not an employee), the cap on what a partner may say about returns, and termination rights.

## 5.4 Referral tracking check

### The chain, link by link

| Step | Where | Checked how | Result |
|---|---|---|---|
| Link `?ref=<code>` sets a 90-day cookie | partner-ref, proxy | code read; unit tests | Works as designed |
| Signup credits the partner (new account, created after the click, partner active, not self) | `attributeSignup` | code read; tests | Works as designed |
| Late credit (Google sign-in that skipped the callback, or admin credit) pays past payments | `creditPastPayments` | code read | Works as designed; payment reference is unique so it cannot double pay |
| A payment earns a commission | `recordCommission`, called from the Paystack webhook, pay-once, passes and offers, the daily subscription check, and Flutterwave | code read; 12-month window and fee tests | Every path that grants access also credits; the payment recovery path uses the same grant functions |
| Commission held 14 days, payable after | `partner_commissions.payable_at` | schema read | Works as designed |
| Payout | `partner_pay_out` | schema read; payout tests | Works; refuses below the minimum |
| Refund or chargeback reverses | `partner_reverse_commission` | **run on the live database inside a rolled-back transaction** | Held commission becomes cancelled; a paid one gets a negative clawback row of the same amount for the next payout; reversing twice returns "already" |
| Paystack refund triggers the reversal | webhook `refund.processed` | code read | **Was missing; fixed** (see below) |

### Live data

| Measure | Value |
|---|---|
| Partners | 3 (2 active, 1 suspended) |
| Referred signups | 3 (one per partner) |
| Referred accounts that have paid | 0 |
| Commissions or clawbacks | 0 |

The test run left no rows behind. This means nothing here proves the chain with a real payment: the first one will.

### The gap and the fix

Before: a refund from the Paystack dashboard set the payment to refunded and ended a pass, but the partner's commission stayed pending or paid unless the admin reversed it by hand on the partner page.

After: the same webhook now finds the commission for that payment and calls the same reversal function the admin button calls. A partial refund reverses the whole commission, which is the cautious side; the admin can see the reason ("refunded (Paystack)"). A refund made outside Paystack (for example a Flutterwave refund) still needs the admin reversal, because that provider's refund event is not handled.

### To do before partners are told it is live

1. Send one real test: refer a test account through a partner link, make a ₦500 payment, and watch the commission appear on the partner page. Then refund it from Paystack and confirm the commission cancels.
2. Decide the ceiling (30%) and update the agreement.
3. Handle Flutterwave refunds the same way, if Flutterwave is used for partners' customers.

## Method and limits

- Rates and margins come from `docs/reports/plan-economics-2026-11.md` and the live code; nothing here is a legal opinion.
- Partner earnings use the Paystack fee estimate (1.5% + ₦100 from ₦2,500, cap ₦2,000); the real fee on a payment can differ slightly.
- The refund fix is covered by typecheck and by the existing reversal function; there is no automated test of the webhook route itself.
