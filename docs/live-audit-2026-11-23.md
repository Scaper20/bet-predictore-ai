# Live audit, 23 Nov 2026

What the published picks have done since the November changes went live
(production deploy of 9 Nov: goals-v3 from 14 Nov, sweet-spot bands from
20 Nov; the headline engine has published every pick since 31 Oct). Read from
`predictions_log`, `anchor_shadow`, `engine_picks` and `code_hub_shadow`.

## 1. The public track record undercounted by half (fixed)

`settledRecords` read `predictions_log` in one request. The Data API stops at
1,000 rows without saying so, and the read had no order, so the page sat on
the oldest 999 picks.

| | Page showed | Log holds |
| --- | --- | --- |
| All picks | 999 graded, 70.4% | 2,024 graded, 73.1% |
| KiqStat Strike 2 | 566 graded, 76% | 1,591 graded, 75.9% |
| Strong picks | 74 graded, 77.0% | 147 graded, 79.5% |

The "More predictions" groups (`engine_picks`, 3,263 settled) had the same cap.
Both reads now page with `allPages` and a stable order
(`src/lib/performance-store.ts`); `src/lib/supabase/pages.test.ts` guards it.
The admin pages sort newest first, so their caps trim old history only.

## 2. Published picks land as often as the bookmaker expects, no more

Since 1 Nov (engine on), 663 graded:

| | Landed | Stated | SportyBet's fair chance at publish | Return at SportyBet's price |
| --- | --- | --- | --- | --- |
| All | 75.7% | 75.1% | 75.9% | -6.3% |
| Team goals (227) | 74.4% | 74.8% | 75.1% | -6.3% |
| Goals over/under (168) | 73.8% | 75.4% | 76.4% | -8.7% |
| Double chance (116) | 75.9% | 74.8% | 76.7% | -9.0% |
| Corners (115) | 80.0% | 75.9% | 76.0% | -1.3% |

Stated chances are honest (calibrated within a point), but the picks carry no
edge over SportyBet's own price: the return is minus its margin. The engine
ranks on the lower of its chance and SportyBet's, so it publishes where the two
agree, and that is where there is least to gain. Only corners beat the
price (+4 points, 115 picks, not yet significant).

## 3. Outside the 17 lab divisions the model is well behind the market

`anchor_shadow`, 431 finished games since 6 Nov, 1X2 log loss (lower is better):

| | Games | Model | Anchored halfway | SportyBet price | Model behind price |
| --- | --- | --- | --- | --- | --- |
| Lab divisions, before goals-v3 | 87 | 0.998 | 0.977 | 0.962 | 0.036 (se 0.012) |
| Lab divisions, goals-v3 | 151 | 0.940 | 0.935 | 0.933 | 0.007 (se 0.008) |
| Everything else, before 14 Nov | 84 | 0.915 | 0.859 | 0.843 | 0.072 (se 0.041) |
| Everything else, from 14 Nov | 109 | 0.974 | 0.916 | 0.887 | 0.087 (se 0.028) |

goals-v3 did what the lab said in its own divisions: the gap to the price is
now inside noise. Everywhere else it does not apply (no market goals in the
training rows) and the gap is large: international friendlies 0.120, AFCON
qualifiers 0.104, Nations League 0.076, FA Cup 0.063, Liga MX 0.058,
Brasileirão 0.038. Published picks there: Nations League 68.2% against 75.2%
implied (44), Liga MX 69.6% against 76.8% (23), Brasileirão 70.8% against
75.3% (24). Anchoring halfway to the price would recover about two thirds of
the gap in these competitions at no cost in the lab divisions.

## 4. The sweet-spot layer no longer reaches published picks

The engine (`app_switches.headline_engine`, on since 31 Oct, three days into
a shadow that was planned for 14 days and 300 games) replaces the top pick on
every game it covers, and it covered all 210 games published since 20 Nov. So
the sweet-spot rules, including the graded bands of 9 Nov, decide no published
pick. Their replay gains (docs/sweet-spot-bands-2026-11.md) are not reaching
users. Since the switch nothing logs what the model's own pick would have been,
so engine against sweet spots cannot be measured live.

## 5. Smaller items

- **Strong tier is starved.** 22 Strong picks in three weeks under the engine
  (81.8%) against 124 in the four weeks before: under a 1.20 price floor few
  picks reach the Strong threshold.
- **Postponed games stay open.** Ten picks (six League One games of 14 Nov,
  two Scottish of 31 Oct, Estoril v Marítimo) are ungraded because the game was
  postponed; they are never voided. Hibernian v Dundee keeps its 31 Oct pick for
  its new date (24 Nov), and the new pick is never logged (`ignoreDuplicates`).
- **The training archive lags.** football-data.co.uk rows for most divisions end
  on 8 Nov; the weekend of 21-22 Nov is not in yet.
- **Code Hub shadow**: 10 days, too early (shadow 9 landed against real 7,
  interval ±26 per 100 days). Real hub: 7 of 36 codes landed against 8.2
  expected, return -44%.

## Recommended next steps, in order

1. Anchor the model halfway to SportyBet's price outside the lab divisions (and
   for national-team games), gated on kickoff. The shadow already measures it.
2. Decide engine against sweet spots on evidence: log the model's own top pick
   beside the engine's (as `engine_picks` did before the switch) for a few
   weeks, then compare.
3. Void picks whose game is postponed, and re-log a rescheduled game.
