# Pick integrity: what is frozen, when, and what is not

Checked 5 Nov 2026 against the code and the production database.

## The headline pick (the one in the track record)

- **Logged once, first write wins.** `settle-predictions` (`logUpcomingPicks`) upserts into `predictions_log`
  with `onConflict: "match_id", ignoreDuplicates: true`, and only for games still `scheduled` with a kickoff
  in the future. A second run cannot replace a logged pick.
- **Nothing edits it afterwards.** The only update to a logged row is settlement, which writes the result,
  goals, settled time and closing price. No code path rewrites market, label or probability.
- **Every page serves it.** `holdPublished` (`src/lib/published-hold.ts`) puts the logged pick at the head
  of every read, before, during and after the game, however the live read has moved.
- **Production data, last 30 days:** 1,111 picks, 1,111 logged before kickoff, 0 after; the earliest was
  logged 7.5 hours ahead, on average 37.8 hours ahead.

## Gaps found

1. **Before first log.** A game is frozen when the cron first logs it (up to two days ahead). A page read
   before that shows a live build that could differ from what is then logged. Small window, real.
2. **The other top picks were not frozen.** Only the headline was held; the other cards were rebuilt on
   every read from inputs that move (SportyBet's board, selection switches, deploys), so they could change
   before, during or after the game. The "Landed / Missed" label on a finished game was computed from the
   rebuilt pick.
3. **Pre-match chances on played games** used to be fitted on results that included the game itself.
   Fixed by `trainingAsOf` (merged 4 Nov): a played game is predicted from what was known at kickoff.

## Fix for gap 2 (games kicking off from 00:00 Lagos on 6 Nov 2026)

`predictions_log.top_picks` (migration 0099) stores the three or four top picks, with their chance, when the
game is first logged. `holdPublished` attaches them and `buildTopPicks` serves exactly those. Games before the
cutover keep the old behaviour, so nothing already published changes.

Not fixed: gap 1, and the legacy secondary picks for games before the cutover.

## When picks settle

Measured 5 Nov 2026 on production, last 7 days: 241 of 246 headline picks settled about two hours after
kickoff, and 5 at the 03:00 UTC sweep, up to 62 hours late. The fast ones were settled by a visitor's
live-board poll (`/api/live`), so settlement depended on someone watching. Three picks sit unsettled: two
games postponed to later dates, and Kortrijk v Mechelen, played 4 Nov but logged under its original
23 Oct kickoff, which the six-hour window of the quick pass could not see.

Fix (migration 0100, `/api/cron/settle-finished`):

- **pg_cron calls the route every minute, only while something is waiting:** a pick or engine pick whose game
  started 95 minutes to 8 hours ago, a pick whose final score is stored but not graded, or a game that finished
  in the last ten minutes. A quiet night makes no call.
- **Stores the final score** of every game that finished today or yesterday (only what changed), which is what
  the Code Hub, tracked slips and the track record read.
- **Settles every logged pick** whose game is over, whatever its logged kickoff, and engine picks too, corners
  and shots included once ESPN has the counts.

What it cannot speed up: the score source. Final scores come from the `matches` table, refreshed every minute
from the live-score feed; a provider that is slow to mark a game finished delays settlement by the same time.
Postponed games stay pending until they are played, by design.

## Which markets settle at full time

Checked 5 Nov 2026. `gradePick` (`src/lib/pick-grade.ts`) is the one grader for every pick we publish; the
headline log, engine picks, shadow picks and the top-picks cards all use it.

| Market | Needs | Settles |
| --- | --- | --- |
| 1X2, double chance, draw no bet, both teams to score, over/under, handicaps, team goals, correct score | Final score | At full time |
| Goal bounds 0-3 and 1-4 | Final score | At full time |
| 1st half over 0.5, 2nd half over 0.5, both halves over 0.5 | Half-time score | At full time, once the half-time score is stored |
| Corners, shots, shots on target | ESPN's counts | Minutes after full time, once ESPN has them |

Before this change the headline and engine settlement did not grade the raw (SportyBet-style) markets at all,
so a halves or goal-bounds pick would have stayed open for ever. None is logged today: the owner's selection
switches keep them off for the headline. The new top-picks rule can use them once they are switched on, so
they had to be covered first.

**Half-time score.** Taken, in order, from the score stored at the break (`match_results.ht_home/ht_away`,
migration 0101: the settlement route stores the score of any game at half-time, and football-data's own
half-time score when it has one), then the nightly ESPN archive. With a halves pick waiting, the settlement job
keeps running through the game so the break is not missed. A halves pick with no half-time score is left
open and retried, never guessed.
