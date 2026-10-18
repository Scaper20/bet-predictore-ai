/**
 * Selections paused as picks (the headline, the digest, Code Hub, Forge's
 * builds). Their probabilities are still computed and shown.
 *
 * Unders, paused 16 Oct 2026. Walk-forward over 12 months and 17 divisions
 * (scripts/decision-lab.ts), under 2.5 rated 50%+ landed 51.9% against a
 * stated 55.6%, and when the model leaned Under 5+ points past the closing
 * market the market was right 60.5% of the time. Live, the digest's unders
 * landed 11 of 22. With them paused the next selection in line is picked;
 * on the UEFA cups that moved the published pick from 74.6% to 76.2%.
 */
export const PAUSED_PICK_MARKETS: readonly string[] = ["ou:under:1.5", "ou:under:2.5", "ou:under:3.5"];

/**
 * Handicaps of a goal or more (+-1, +-1.5, +-2), paused 18 Oct 2026, the day
 * after sweet spots made them picks. Away +1.5 at 74%+ applies to most games
 * without a clear home favourite, so it took 26 of 68 picks on its first day,
 * and its first three settled (4-1, 4-0, 2-0) all lost: one day of home wins
 * by two sinks every one at once, which is fatal inside a code. Its 80%+
 * record is replay only. Draw no bet (0) and the half-goal +-0.5 lines stay:
 * they are double chance and the match result under another name.
 *
 * Still logged in public.shadow_picks and graded there, so the line can come
 * back on a live record rather than a replay (model/shadow.ts).
 */
export function isPausedHandicap(market: string): boolean {
  const m = market.match(/^ah:(home|away):([+-]?\d+(?:\.\d+)?)$/);
  return Boolean(m && Math.abs(Number(m[2])) >= 1);
}

export function isPausedPick(market: string): boolean {
  return PAUSED_PICK_MARKETS.includes(market) || market.startsWith("ou:under:") || isPausedHandicap(market);
}
