# SportyBet markets: what we read, price and book

October 2026. Two problems fixed together:

1. A pasted code with a market we didn't map (big handicap lines, team
   corners, corners 1X2, bookings) showed "Can't read" and scored nothing.
2. A pick of ours on a line SportyBet doesn't list on that game left a Code
   Hub combo without a code, and Forge offered legs SportyBet can't carry.

## The catalogue (`src/lib/odds/markets.ts`)

The board fetch asks for every id below (`CATALOGUE_MARKET_IDS`); a board of
ten games grows from about 316 to 683 KB. Stat markets are listed only on
the next round of games (on 24 Oct, 5 of the 10 nearest Premier League games
had them; games a week out had 45 lines and none).

| Market | SportyBet id | Our key |
|---|---|---|
| 1X2, double chance, over/under, GG/NG | 1, 10, 18, 29 | `1x2:`, `dc:`, `ou:`, `btts:` |
| Asian handicap (any line, quarter lines too) | 16 | `ah:home\|away:L` |
| Draw no bet | 11 | `dnb:home\|away` |
| Three-way handicap ("0:2", "1:0") | 14 | `eh:home\|draw\|away:H` (H = home's goals start) |
| Team goals over/under | 19, 20 | `tg:home\|away:over\|under:L` |
| Corners: total, 1X2, handicap, team totals | 166, 162, 165, 900300/1 | `corners:over:L`, `corners:most:home\|level\|away`, `corners:hcp:home:-1.5`, `corners:home:over:L` |
| Shots: total, 1X2, team totals | 900394, 900320, 900552/3 | `shots:` (same shapes) |
| Shots on target: total, 1X2, team totals | 900393, 900318, 900546/7 | `sot:` (same shapes) |
| Bookings: total, 1X2, team totals, handicap | 139, 136, 900304/5, 900312 | `bookings:` (same shapes) |

SportyBet lists no shots or shots-on-target handicap: those keys stay ours
and are never booked.

## Pricing any leg (`src/lib/leg-pricing.ts`)

`priceLeg(market, { goals, stats })` grades the leg over the fixture's
scoreline grid, or its joint count grid for a stat (`statGridsFor`), into
win / half win / push / half lose / lose. Whole lines push and quarter lines
split the stake, as SportyBet settles them. `survive` (not a full loss) is
the number a code's chance multiplies, since a refund doesn't cut a code;
the code reader and the editor show the refunded share beside it
("74% · 9% refund"). Null means we can't price it, and the leg says why.

## Only what SportyBet lists (`src/lib/odds/bookable.ts`)

`bookableOn(market, eventMarkets)`, in order:

1. **exact**: the selection is listed.
2. **twin**: a selection that wins, pushes and loses on exactly the same
   results is listed (tested over every score up to 6-6):
   Home -0.5 = Home win; Home +0.5 = Home or Draw; Asian 0 = draw no bet;
   Home -1.5 = three-way "0:1" Home (and so on for -2.5, -3.5);
   most corners = corners -0.5; most corners or level = corners +0.5.
3. **nearest**: the same selection at the nearest listed line whose own
   chance clears the caller's floor, re-priced and relabelled.
4. **none**, with the reason (unmapped, no board, not offered).

Where it is used (`src/lib/board-candidates.ts` keeps, swaps or re-lines a
builder's candidates):

| Surface | What it does |
|---|---|
| Code Hub build (07:00) | Each game's candidates go through the listing before tiers are built; re-lines only to lines the hub allows, at 60%+. Games SportyBet isn't listing are left out. If no board can be read at all, it builds as before. |
| Code Hub booking | A leg whose line was pulled since the build goes on as its twin and the stored combo is relabelled; otherwise the combo stays codeless and `sportybet_booking_log.problems` names the match, market and reason. Never a different line: the code's chance was worked out for that pick. |
| Forge | On listed games, legs SportyBet doesn't carry become their twin or the nearest line above the build's floor (or the pick's chance minus 5 points); prices are read off the same listing. |
| Code editor | Re-picks only from what each game lists, now including corners and shots; a pick SportyBet still refuses can be removed and the rest booked. |
| Your own combo (`/api/slip/book`) | A pick listed another way goes on as its twin and the code says so ("went on as Home or Draw, SportyBet's name for the same bet"). Never a different line. |

## Checked live (24 Oct 2026)

- Premier League board with the full catalogue: every listed outcome on a
  game read (0 unread across 1X2, DC, O/U, AH, three-way handicap, team
  goals, DNB, GG/NG, combos, corners, shots, shots on target, bookings).
- Booked one code with six new-market legs (Asian -1.5, home team corners
  over 4.5, corners 1X2, bookings over 3.5, team goals, three-way handicap
  "1:0"): SportyBet accepted all six and the code read back as the same
  six markets.
