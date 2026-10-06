# Roadmap: announced, not built

Taken out of the menus in October 2026 so the site only shows what works.
Basketball is the one feature still announced (/soon/basketball). Everything
below was announced before and is parked here until it is built. When one
ships, give it a real route and add it back to `src/lib/nav.ts`.

## Slip Checker
Paste any slip or SportyBet booking code and see how likely it is to land.
- Every leg graded with our chance of landing.
- Weak legs flagged, with a stronger swap from the same game.
- Works with booking codes or games added by hand.
- Build on: `src/lib/slip.ts`, Forge pricing, SportyBet price lookups.

## Cash-out Checker
Is SportyBet's cash-out offer fair?
- The slip's real value now, from live win probability.
- A Hold / Cash out verdict against the offer, and an alert when it becomes fair.
- Build on: tracked slips, live win-probability panel (VIP).

## Tipster League
Users publish picks, build a public record, climb a monthly table.
- Picks locked at publish and graded automatically: no edits, no deletes.
- Ranked on return, not wins; prizes for the top three each month.
- Follow tipsters and copy their picks to a slip.
- Build on: `predictions_log` settlement, the For You loves/comments tables.
  Needs moderation and prize terms before launch.

## Odds converter
Decimal, fractional, American and implied chance side by side; shows the
bookmaker's margin for a full market.

## Bet calculator
Returns on singles, accumulators and system bets; each-way explained.

## Stake planner
Kelly and flat staking side by side for a bankroll, inside limits the user sets.
Note: break-even and fair odds are internal now (October 2026), so present
this as stake sizes, not edge arithmetic.

## Odds format setting
One site-wide setting to show prices as decimal, fractional or American.
