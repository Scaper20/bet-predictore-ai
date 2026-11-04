# Renewals: how they work and how to check them

CTO review item 1.5 (4 Nov 2026). A VIP card subscription paid ₦12,000 on 24 Sep. Paystack charged
it again on 24 Oct and we recorded nothing, so the member lost access with no warning. This is how renewals
are now handled and watched.

## Three kinds of paid plan

| Kind | How it is paid | Renews itself? | How access ends |
| --- | --- | --- | --- |
| Card plan | Paystack subscription (has a `paystack_subscription_code`) | Yes, Paystack charges each period | We move `current_period_end` on every renewal |
| Pay-once | One payment (Paystack `:once`, Flutterwave) | No | Ends on its date; one reminder email 3 days before |
| Manual | Gift or admin grant | No | Ends on its date |

## How a card renewal reaches us

1. **Webhook (immediate).** Paystack sends `charge.success`. `src/app/api/billing/webhook/route.ts` decides it is a
   renewal when the reference is not one of our own checkouts (`src/lib/paystack/charge-kind.ts`), whatever
   metadata it carries. It finds the member by the id on the charge, then the Paystack customer code, then email.
   It works out the cycle from the charge's plan interval, then our plan code, then the member's last payment
   (never a guess), records the payment, moves the paid-through date and emails a receipt.
2. **Daily check (backstop).** Every morning the `expire-pending-payments` cron
   (`src/lib/paystack/subscription-check.ts`) asks Paystack about every card subscription. A renewal Paystack
   charged and we missed is recorded and the plan extended; a subscription Paystack has ended is marked
   cancelled; anything else is emailed to the support inbox. It also asks Paystack about every unconfirmed
   checkout before writing it off (`recover-payments.ts`).
3. **Alerts.** The webhook emails the support inbox (once per case) when a renewal is paid but its cycle cannot
   be worked out, when a charge matches no member, and when a renewal fails. A failed renewal also emails the
   member, with the date their access runs to.

`PAYSTACK_SUB_CHECK=report` makes the daily check report only, changing nothing.

## Where to look: /admin/renewals

- **Needs attention:** card plans whose paid period ended without a recorded renewal, plans Paystack is
  retrying (`past_due`), plans with no paid-through date, and renewals recorded without a cycle.
  The same count shows as a red alert on the main dashboard.
- **Card renewals due:** the next 14 days, with what should be charged.
- **Pay-once plans ending:** will not renew; the member is reminded 3 days before.
- **Renewals recorded:** card charges after a member's first, last 30 days.
- **Check with Paystack now:** runs the daily check on demand.

## When something is on "Needs attention"

1. Press **Check with Paystack now**. If Paystack charged and we missed it, the plan is extended and the row clears.
2. Still listed: open the member's subscription in the Paystack dashboard.
   - Charge failed: the member has been emailed; Paystack retries for a few days.
   - Subscription cancelled or non-renewing: mark the plan cancelled, or extend it by hand if they should keep access.
   - Charged, but nothing recorded: open the transaction's webhook log in Paystack. A non-2xx response there is the cause (check the Live Webhook URL is exactly `https://www.kiqstat.app/api/billing/webhook`).
3. To restore a member by hand, set their plan and paid-through date from /admin/users.
