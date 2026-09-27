/**
 * The account wall on prediction depth.
 *
 * This is the highest-risk change in the conversion work: match pages are the
 * indexed acquisition surface, and putting a wall on them trades search
 * traffic for registrations. The trade is deliberate, but it is a bet, and a
 * bet needs a way out that isn't reverting a merged branch under pressure.
 *
 * So it reads an env var. Flip NEXT_PUBLIC_REQUIRE_ACCOUNT_FOR_DEPTH to
 * "false" and redeploy to restore the previous behaviour without touching
 * code. NEXT_PUBLIC_ because the gate itself renders client-side, next to the
 * entitlement it checks.
 *
 * Default ON: an unset variable means the wall is up, so a fresh deploy gets
 * the intended behaviour rather than silently shipping the old one.
 *
 * What stays free either way, and must: the score, the kickoff, the headline
 * pick, the 1X2 probabilities, form and head-to-head. Every match page keeps
 * substantial unique content for crawlers and a real reason to click through
 * from search. The wall is on depth, not on the page.
 */
export const REQUIRE_ACCOUNT_FOR_DEPTH =
  process.env.NEXT_PUBLIC_REQUIRE_ACCOUNT_FOR_DEPTH !== "false";
