# Strong picks (two-tier track record)

October 2026. Every headline pick is still published and graded. Picks whose
confidence is 60 or more are also marked **Strong**, and the track record
shows the Strong record on its own beside the full record.

## Rule
- `src/lib/model/tiers.ts`: `STRONG_CONFIDENCE = 60`, `pickTier(confidence)`.
- Confidence is `confidenceFor` in `src/lib/model/predict.ts`: probability ×
  data-quality weight × decisiveness.
- The logging cron stamps `confidence` and `pick_tier` on each
  `predictions_log` row (0040_pick_tier.sql). It only logs games that have not
  kicked off, so a tier can never be set or changed after a result.
- Rows logged before 0040 have no tier and are never counted as Strong. The
  Strong record starts on the day 0040 shipped.

## Evidence
Walk-forward backtest (scripts/backtest.ts), goals-v2, held-out seasons
2025-26 + 2026-27, 3,314 picks, eight leagues:

| Confidence | Share | Hit rate | Avg fair price |
|---|---|---|---|
| 40–50 | 9% | 70.6% | 1.45 |
| 50–60 | 76% | 75.8% | 1.28 |
| 60+ (Strong) | 15% | 80.1% | 1.18 |

Strong picks lose about 1 in 5 instead of 1 in 4, at shorter prices; return
at closing prices did not improve. Expect the live Strong rate to sit within
a few points of 80% once it has a few hundred graded picks; below about 100
it can swing widely.

## Threshold raised to 63 (17 Oct 2026)
Sweet spots (src/lib/model/sweet-spots.ts) became the pick in 17 divisions,
and their picks sit at higher chances, so 60+ grew from 15% to 57% of picks.
Replayed through the live code over the last 365 days (scripts/decision-lab.ts,
5,634 picks in 17 divisions):

| Confidence | Share | Hit rate |
|---|---|---|
| 60+ | 57% | 83.9% |
| 63+ (Strong) | 20% | 86.3% |
| 64+ | 11% | 85.7% |
| below 63 | 80% | 80.7% |

## Where it shows
- Track record: Strong and All headline cards; All / Strong filter on the log.
- ★ Strong badge on prediction cards, the best bet, the match page and For You.
- Predictions page: All picks / Strong picks toggle (`?tier=strong`).
- WhatsApp digest: Strong singles prefixed "⭐ STRONG PICK".
