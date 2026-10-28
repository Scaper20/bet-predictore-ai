# Which corners and shots lines SportyBet lists

Measured on 28 October 2026 from SportyBet's board as stored in `odds_boards`
(356 upcoming games across the tracked competitions). SportyBet's own
probabilities on each outcome are margin-free, so "favourite" below is the
likelier side of each listed line.

| Market (SportyBet id) | Games listing it | Lines a game | Favourite side, median | 90th percentile | Most lopsided |
|---|---|---|---|---|---|
| Corners total (166) | 138 | 1.5 (mostly 9.5, 10.5) | 54% | 68% | 78% |
| Home / away corners (900300/1) | 153 | about 5 | 68-69% | 80-83% | 89-90% |
| Corner handicap (165) | 39 | about 2 (±0.5, ±1.5) | 57% | 64% | 65% |
| Corners 1X2 (162) | 110 | 1 | | | |
| Shots on target total (900393) | 64 | about 3 | 62% | 83% | 90% |
| Home / away shots on target (900546/7) | 76 | about 3 | 63% | 75-76% | 87% |
| Shots total (900394) | 80 | about 4 | 58% | 72% | 78% |
| Home / away shots (900552/3) | 80 | about 3 | 58% | 66-67% | 73-77% |
| Shots and shots on target 1X2 (900320, 900318) | 65-66 | 1 | | | |
| Goals over/under (18), for scale | 345 | about 9 | 79% | 94% | 98% |

What follows from it:

- **SportyBet lists corners and shots lines near the middle of each game.**
  The corners total sits at 9.5 or 10.5 on most games; 12.5 was on 3 of 138.
  A pick at 80%+ on a corners total almost never exists on SportyBet.
- **Team totals go furthest out**: home or away corners and shots on target
  reach 75-90% on the likelier side, so that is where a strong corners or
  shots pick can still be loaded.
- **There is no shots or shots-on-target handicap market, and no "level or
  more" market**, on any game. Market 900312 is the bookings handicap.
- Corners and shots markets are on 40-45% and about 20% of upcoming games
  respectively; the rest of the board carries only the goals markets.

The headline, the match page's corners pick and Forge choose among these
listed lines (`src/lib/board-pick.ts`); `scripts/listed-lines-lab.ts`
replays that choice. Re-measure with the query below after a few weeks, or
when SportyBet changes its catalogue.

```sql
with ev as (select jsonb_array_elements(payload) e from odds_boards
            where key like 'sportybet:direct:%' and jsonb_typeof(payload) = 'array'),
m as (select e->>'eventId' ev, mk->>'market_id' mid,
             greatest((mk->'outcomes'->0->>'probability')::numeric, (mk->'outcomes'->1->>'probability')::numeric) fav
      from ev, jsonb_array_elements(e->'markets') mk)
select mid, count(distinct ev) games, count(*) lines,
       percentile_cont(0.5) within group (order by fav) p50,
       percentile_cont(0.9) within group (order by fav) p90, max(fav)
from m group by mid order by mid;
```

## What the replay says (28 October 2026)

`npx tsx scripts/listed-lines-lab.ts` on the walk-forward cache
(`scripts/niche-lab.ts --stage=predict`): 13,231 games in the 17 tested
divisions, July 2024 on. SportyBet's ladder is modelled from the table above
(the k lines nearest 50/50 per family) with its ~7% margin, so a line has to
pay 1.18 or more on SportyBet to count.

| | Picks | Landed | Stated |
|---|---|---|---|
| Goals/result pick (today's headline) | 13,059 | 77.4% | 75.6% |
| Old fixed corners/shots rules, as they fired | 7,217 | 84.8% | 82.8% |
| ...of which SportyBet would list the line | 250 (2% of games) | 84.4% | 82.3% |
| Best listed corners/shots line, 72% floor | 13,193 | 76.9% | 77.3% |
| Best listed line, 78% floor | 5,359 | 78.1% | 78.6% |

On the 7,217 games where an old rule fired, which is where the site now moves the pick:

| Floor | Landed | Stated | Corners/shots share |
|---|---|---|---|
| 0.72 | 77.2% | 77.3% | 100% |
| 0.75 | 77.3% | 77.4% | 90% |
| **0.78 (shipped)** | **77.9%** | **76.5%** | **41%** |
| Goals/result pick on the same games | 77.5% | 75.4% | — |

So: the listed lines are honestly priced at every floor; at 78% the moved
picks land a little more often than the goals/result pick would have, and
every one of them can be loaded. The old 84.8% was on lines nobody could
load.

Not shipped: making the best listed line the headline on every game where
it is the stronger read lands 78.9% overall (against 77.4%), but puts a
corners or shots line on about 60% of headlines. That changes what KiqStat
publishes, so it is the owner's call.
