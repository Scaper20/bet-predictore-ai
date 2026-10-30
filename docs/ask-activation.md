# Ask KiqStat: safeguards and activation

Ask KiqStat stays switched off (`ASK_PAUSED` in `src/lib/ask/status.ts`) until
it has funded Anthropic credit. Every safeguard below is built and tested
without a single Anthropic call. This page is the order to switch it back on,
and how to back out.

## What protects the money

| Layer | What it does | Where |
| --- | --- | --- |
| Pause flag | While `ASK_PAUSED` is true, the API refuses questions without counting them, and the panel and plans say "back soon" | `src/lib/ask/status.ts` |
| Guard, enforcing by default | Any `ASK_GUARD` value but `observe` or `off` enforces. If the books can't be reached, questions are refused | `src/lib/ask/config.ts` |
| Per-question ceiling | One question can't cost more than $0.02, or less near the end of a cap. The engine checks before each model call | `ASK_REQUEST_CEILING_USD`, `src/lib/ask/engine.ts` |
| Account day caps, by billing cycle | Pro $0.04 a day (yearly $0.035), VIP $0.10 (3 months $0.09, yearly $0.08), Free $0.01, guests $0.005 | `ASK_DAILY_CAP_USD_*`, `src/lib/ask/bucket.ts` |
| Pass ceiling over the whole pass | One bucket per pass (`pass:<id>`), booked to the Lagos date it started, so a 24-hour pass gets one cap, not two. Day pass $0.14, weekend $0.255, trial $0.075 | `offers.ask_cap_usd` (0089), `src/lib/ask/bucket.ts` |
| Pass question limit | 30 questions per 24 hours of the pass, counted over the whole pass | `ASK_PASS_DAILY` |
| Daily budget for all of Ask | $5 a day across everyone. Questions stop at 100% until midnight, Lagos time | `ASK_DAILY_BUDGET_USD` |
| Locked holds | Each question reserves its ceiling in one locked statement, then settles to the real cost. Parallel requests can't pass a cap | `ask_spend_reserve`, `ask_spend_reserve_on`, `ask_spend_settle` |
| Alerts | Email on a credit or key refusal (hourly at most), 5 failures in 15 minutes, and at 50%, 80% and 100% of the budget (once a day each) | `src/lib/ask/ledger.ts` |
| Workspace limit | A separate Anthropic workspace with its own monthly limit is the last stop if everything above failed | Anthropic console |

## How it was tested (no Anthropic calls)

- **Simulation** (`src/lib/ask/ledger.sim.test.ts`, runs with `npm test`):
  - 300 parallel questions across 30 accounts and passes never pass a cap or the budget, and every hold is released.
  - A pass stays inside one cap across midnight.
  - Books down: enforcing refuses, observing lets questions through.
  - 0089 missing: pass questions are refused, and the budget isn't touched.
  - A 20% random failure rate on the books never lets spending past a cap. A settle that fails costs room, never adds it.
  - An Anthropic credit refusal books nothing and alerts once.
  - Budget alerts fire once each.
- **Real Postgres** (`bash scripts/ask-staging.sh`, needs Docker):
  - Every migration applies to a fresh local Supabase stack, 0015 included.
  - 11 checks through PostgREST:
    - Browsers are refused the tables and functions.
    - Spending is booked to the Lagos day.
    - A Pro account stops at its cap.
    - 40 parallel requests stay within the cap.
    - Near the cap, what's left is still granted.
    - Observe mode lets questions through.
    - A cancelled question is booked at what it streamed.
    - The budget closes Ask, with alerts.
    - A pass is booked to one bucket over its window.
    - The fail-closed path holds.
- **Rollback**: `supabase/rollback/0089_down.sql`, then `0088_down.sql`, ran clean on the local stack, and both migrations re-applied on top.

## Migrations

| Migration | Production | Rollback |
| --- | --- | --- |
| 0088 Ask books | Applied 30 Oct 2026. Checked: RLS on, no policies, anon and authenticated have no access, functions callable by the service role only | `supabase/rollback/0088_down.sql` (deletes the logs; back up first) |
| 0089 pass ceilings | Applied 30 Oct 2026. Checked: caps 0.14 / 0.255 / 0.075 on the three offers; the function callable by the service role only | `supabase/rollback/0089_down.sql` |

**Back up before a rollback.** The Free plan has no point-in-time restore, so copy the books out first:

```
# DATABASE_URL: Supabase dashboard → Connect → session pooler connection string
pg_dump "$DATABASE_URL" --data-only \
  -t public.ask_questions -t public.ask_calls -t public.ask_bench_results \
  -t public.ask_spend -t public.ask_alerts -f ask-books-$(date +%F).sql
```

Or run `select * from ask_questions` and the other four tables in the SQL editor and download them as CSV.

**Re-applying 0089** (only after a rollback):
1. Paste `supabase/migrations/0089_ask_pass_ceiling.sql` into the SQL editor and run it.
2. Check it landed: `select slug, ask_cap_usd from offers;` shows 0.14, 0.255 and 0.075, and `select to_regprocedure('public.ask_spend_reserve_on(text,date,bigint,bigint,bigint,boolean)');` is not null.

## Activation, in order

Each step is safe alone. Ask stays off until step 6.

1. **Anthropic console:** create a workspace "Ask KiqStat" with a monthly spend limit ($150 = 30 days of the $5 budget), add credit, and create one key in it.
2. **Vercel, Production:**
   - Add the key as `ANTHROPIC_ASK_API_KEY`.
   - Check `ASK_GUARD` is unset or `enforce`.
   - Check `SUPPORT_INBOX_EMAIL` or `ASK_ALERT_EMAIL` is set, and `RESEND_API_KEY`.
3. **Database:** 0088 and 0089 are both applied (30 Oct). Nothing to do unless one was rolled back.
4. **Deploy:** merge dev into Main/Production.
5. **Preflight:** open `/admin/ask-lab`. Every row of "Before Ask answers again" reads Ready except "Ask switched on". Anything Blocked stops here.
6. **Switch on:**
   - Set `ASK_PAUSED = false` in `src/lib/ask/status.ts`, commit and deploy. The plans drop "back soon" in the same change.
   - Ask one question as a Free test account. Check one row each in `ask_questions` and `ask_spend` for today.
7. **First 48 hours:**
   - Watch the 50% budget alert and `/admin/ask-lab` "Live questions by plan".
   - Compare the Anthropic console's spend with `select sum(cost_micros)/1e6 from ask_questions where created_at > now() - interval '1 day';`. They should agree within a few percent.

## Backing out

| Problem | Do this | Effect |
| --- | --- | --- |
| Spend looks wrong | Set `ASK_PAUSED = true` and deploy, or set the Anthropic workspace limit to $0 (immediate) | No further calls |
| Costs drift from the console | Update the prices in `src/lib/ask/cost.ts` | Caps track real cost again |
| Pass ceilings misbehave | Run `0089_down.sql` | Pass questions are refused (fail closed) until it is back |
| Books broken | Keep Ask paused, then roll back 0088 after a backup | Ask can't run with the guard enforcing |

## Known limits

- A settle that fails leaves its hold in place until the day ends, or for a pass, for good. Room is lost, never gained.
- The pass question count reads the question log. A burst of parallel questions on one pass can go a few past 30, but never past the pass's money cap.
- Card renewals don't carry the cycle in the subscription row. The cycle cap is read from the member's latest successful payment, and falls back to the monthly cap.
