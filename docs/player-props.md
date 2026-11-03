# Player props

Phase 2 of the player-stats work: projections and picks for ten player markets, built like the team picks but per player.

## Markets

Goals, assists, goals + assists, shots, shots on target, tackles, fouls committed, clearances, passes attempted, saves (keepers only). Counts are FotMob's (`player_match_stats`). A bookmaker settles on its own data provider, which can count tackles, clearances and passes differently; the UI says so.

| Market | SportyBet market | Notes |
|---|---|---|
| Goals | 775 | one market per player |
| Assists | 770 | one market per player |
| Goals + assists | 800289 "To score or assist" | yes only: read as over 0.5 |
| Shots | 776 | one market per player |
| Shots on target | 777 | one market per player |
| Tackles | 780 | one market per player |
| Fouls committed | 800291 | one market for every player |
| Clearances | none | projection only |
| Passes attempted | 778 | one market per player, lines in steps of four |
| Saves | 800297 | one market for every player |

What SportyBet's payload looks like (a real capture, Atletico v Bayern, 3 Nov 2026, saved trimmed as `src/lib/odds/__fixtures__/sportybet-player-props.json` and tested in `player-lines.capture.test.ts`):

- Every outcome is a threshold, **over only**: "Kane, Harry (Bayern Munich) 26+" is over 25.5. There are no unders, so a bookable pick is always an over.
- Names come as "Surname, First (Club)" or "Name (Club)"; the parser puts them in order and uses the club to match within the right squad.
- The player id is in the outcome id (`pre:playerprops:<event>:<player>:...`) and is remembered in `player_aliases`.
- Each outcome carries SportyBet's own fair chance (`probability`, margin out). The prices carry a heavy margin: on that game the median price was 1.24 to 1.75 times the fair chance depending on the market (goals overs the worst), and outcomes it rated 72-80% paid 1.15 to 1.26. That is why the minimum price is the team picks' 1.18, not higher.
- On 236 lines of that game our chance was within 8.7 points of SportyBet's on average (shots, shots on target, goals and assists close; passes the widest gap: SportyBet was well above us for Atletico's players against Bayern, whose opponents make about 26% fewer passes than they usually do). The rules would have made two picks on that game.

## How a pick is made

1. **Model** (`src/lib/model/player-props.ts`): see `docs/props-backtest.md`. Fitted parameters in `src/lib/model/player-props-params.ts` (written by `scripts/props-lab.ts --ship`).
2. **Lines** (`src/lib/odds/player-lines.ts`): SportyBet's player markets on the event (`fetchEventMarkets`), read through a `PlatformAdapter`; another bookmaker is one new adapter. Names are matched within the two squads (full name, then initial + surname, then a unique surname), and SportyBet's player id is remembered in `player_aliases`. Ambiguous names stay unmatched and are counted on Data health.
3. **Pick** (`src/lib/model/prop-picks.ts`): only a line SportyBet lists, 72%–88% calibrated, price 1.18+, and SportyBet's own chance no more than 10 points below ours. The best agreed chance wins; at most one pick per player and market.
4. **Ladder**: the line nearest 50/50 and three either side, each with our chance of over, and SportyBet's price where it lists that line ("model" where it does not).

## Pipeline

Two schedules (both pg_cron, both only when there is work):

- **The live lane** (`/api/cron/fotmob-live`, every 2 minutes, migration 0096; see `docs/fotmob-match-data.md`): when FotMob confirms a game's eleven, that game's props are projected and its picks logged in the same run; when a game's final player stats land, its picks are settled in the same run. So picks appear about two minutes after the lineup, and results about two minutes after FotMob's final stats.
- **The props run** (`/api/cron/player-props`, every 15 minutes, migration 0094) keeps everything else fresh:
  - settles picks once FotMob has the game's player stats (a backstop for the live lane). **No minutes = void**, not a loss; a postponed game is void.
  - projects every starter with 5+ earlier starts for games in the next 36 hours that have a FotMob eleven (predicted until confirmed), and captures SportyBet's player lines.
  - logs picks once the eleven is confirmed and kickoff is under 100 minutes away; the set can change until kickoff and is frozen after.

Picks are **shadow only** until `app_switches.player_props` is on (admin › Model performance shows the shadow record next to SportyBet's own chance, with the switch). Switch after about three weeks and 400 graded picks if they land as often as they say and at least as often as SportyBet's price says.

## Pages and access

- `/football/props`: the board (picks first, then any market, by competition).
- Match page **Player props** tab and player page **Props** tab, loaded from `/api/props` so those pages stay cached.
- Free: who, which market, and how often recent starts cleared the line. Pro: projection, the ladder's chances, the pick and its SportyBet code. Redaction is server-side (`src/lib/props-view.ts`, tested); the tables are service-role only and read on the server.
- Booking: "SportyBet code" books the single pick through `/api/slip/book` (a `raw:` selection on the event), inside the member's weekly code allowance.

## Known gaps

- Elite finishers may be under-projected for goals (the model shrinks toward the position average); check the shadow record by player before publishing goals.
- Passes: we and SportyBet can disagree widely in lopsided games; the shadow record against SportyBet's own chance settles who is right.
- Some parameters sit at the edge of the search grid; a wider grid is a cheap follow-up.
