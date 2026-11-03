# Player props

Phase 2 of the player-stats work: projections and picks for ten player markets, built like the team picks but per player.

## Markets

Goals, assists, goals + assists, shots, shots on target, tackles, fouls committed, clearances, passes attempted, saves (keepers only). Counts are FotMob's (`player_match_stats`). A bookmaker settles on its own data provider, which can count tackles, clearances and passes differently; the UI says so.

| Market | SportyBet market | Notes |
|---|---|---|
| Goals | 775 | |
| Assists | 770 | |
| Goals + assists | none as over/under | "To score or assist" (800289) is yes/no; projection only |
| Shots | 776 | |
| Shots on target | 777 | |
| Tackles | 780 | |
| Fouls committed | 800291 | |
| Clearances | none | projection only |
| Passes attempted | 778 | SportyBet also has accurate passes (800292), not used |
| Saves | 800297 | |

## How a pick is made

1. **Model** (`src/lib/model/player-props.ts`): see `docs/props-backtest.md`. Fitted parameters in `src/lib/model/player-props-params.ts` (written by `scripts/props-lab.ts --ship`).
2. **Lines** (`src/lib/odds/player-lines.ts`): SportyBet's player markets on the event (`fetchEventMarkets`), read through a `PlatformAdapter`; another bookmaker is one new adapter. Names are matched within the two squads (full name, then initial + surname, then a unique surname), and SportyBet's player id is remembered in `player_aliases`. Ambiguous names stay unmatched and are counted on Data health.
3. **Pick** (`src/lib/model/prop-picks.ts`): only a line SportyBet lists, 72%–88% calibrated, price 1.25+, and SportyBet's own chance no more than 10 points below ours. The best agreed chance wins; at most one pick per player and market.
4. **Ladder**: the line nearest 50/50 and three either side, each with our chance of over, and SportyBet's price where it lists that line ("model" where it does not).

## Pipeline

`/api/cron/player-props` (pg_cron `betrix-player-props`, every 15 minutes, only when there is work; migration 0094):

- settles picks once FotMob has the game's player stats (an hourly evening `fotmob-matches` run makes that the same night). **No minutes = void**, not a loss; a postponed game is void.
- projects every starter with 5+ earlier starts for games in the next 36 hours that have a FotMob eleven (predicted until confirmed), and captures SportyBet's player lines.
- logs picks once the eleven is confirmed and kickoff is under 100 minutes away; the set can change until kickoff and is frozen after.

Picks are **shadow only** until `app_switches.player_props` is on (admin › Model performance shows the shadow record next to SportyBet's own chance, with the switch). Switch after about three weeks and 400 graded picks if they land as often as they say and at least as often as SportyBet's price says.

## Pages and access

- `/football/props`: the board (picks first, then any market, by competition).
- Match page **Player props** tab and player page **Props** tab, loaded from `/api/props` so those pages stay cached.
- Free: who, which market, and how often recent starts cleared the line. Pro: projection, the ladder's chances, the pick and its SportyBet code. Redaction is server-side (`src/lib/props-view.ts`, tested); the tables are service-role only and read on the server.
- Booking: "SportyBet code" books the single pick through `/api/slip/book` (a `raw:` selection on the event), inside the member's weekly code allowance.

## Known gaps

- **SportyBet's player-market payload has not been seen live.** SportyBet's CDN refuses the build environment, so the parser reads both plausible shapes ("Name 2+" thresholds and over/under) and counts anything else as an unreadable market on Data health. Save one `/factsCenter/event` response for a big game as `src/lib/odds/__fixtures__/sportybet-player-props.json` and add a test against it before switching picks on.
- Elite finishers may be under-projected for goals (the model shrinks toward the position average); check the shadow record by player before publishing goals.
- Opponent shrinkage sits at the edge of the search grid for several markets; a wider grid is a cheap follow-up.
