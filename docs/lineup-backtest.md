# Does knowing who is missing improve the goals model?

Measured on 3 November 2026 with `scripts/lineup-backtest.ts`. **Verdict: no
measurable improvement, so `app_switches.lineup_adjust` stays off.** The match
page still shows paid viewers who is missing and their share of the side's
attack (`AbsenceImpact`), as context; the model's numbers are not moved.

## Setup

- **Games:** 2,246 top-five-league games, 14 Sep 2024 to 1 Nov 2026, joined from
  the production model's walk-forward predictions (`niche-lab.ts
  --stage=predict`) to point-in-time lineup features
  (`scripts/sql/lineup-features.sql`). 74 games could not be joined by name.
  2024/25 is the Premier League only; the other leagues' 2024/25 and 2023/24
  were still backfilling (rerun when `fotmob-backfill` has finished).
- **Feature** (same definitions as `src/lib/model/availability.ts`): a side's
  regulars started at least half of its previous six games with lineups; the
  missing are regulars not in this game's starting eleven; attack loss is
  their share of the side's xG + xA over those games; defence loss counts
  missing regular defenders and the keeper.
- **Adjustment:** `adjustRates` (alpha on attack loss, beta per missing
  defender, keeper double, rates clamped to ±25%). Fitted on the earlier 60% of
  games by date (1,347, to 28 Feb 2026), scored on the later 40% (899).

## Results (held-out 899 games)

| | Baseline | With lineups |
|---|---|---|
| Exact-score log loss | 2.95967 | 2.95950 |
| 1X2 log loss | 0.99111 | 0.99147 |
| Over/under 2.5 log loss | 0.67074 | 0.67071 |

Fitted alpha 0.05, beta 0.01: the fit itself chose almost no adjustment. The
exact-score gain is 0.00017 per game, 95% bootstrap interval −0.0009 to
+0.0012: indistinguishable from zero.

Goals minus the model's expectation, by how much of a side's attack was
missing (all 2,246 games, both sides):

| Attack missing | Sides | Goals vs expected |
|---|---|---|
| 0-10% | 831 | −0.02 |
| 10-20% | 1,346 | 0.00 |
| 20-35% | 1,508 | +0.03 |
| 35%+ | 807 | +0.03 |

No downward slope: sides missing more of their recent attack did not score
fewer than the model expected.

## Why, and what might still work

- Almost every side is "missing" some regulars: across a six-game window
  that spans league and cup games, rotation alone leaves two or three regulars
  out most weeks. The feature is mostly rotation noise, and the model, fitted
  on results, already prices a club's normal rotation in.
- What is worth testing next, before turning anything on: only long absences
  (injured or suspended, from `availability_snapshots`, which exist from
  3 November 2026 onward), or only the one or two most important attackers;
  and per-player props (Phase 2), where who starts matters directly.

Rerun: `npx tsx scripts/niche-lab.ts --stage=predict`, run
`scripts/sql/lineup-features.sql` read-only and save the rows to
`.backtest-cache/lineup-features.json`, then `npx tsx scripts/lineup-backtest.ts`.
