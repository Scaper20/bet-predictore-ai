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
