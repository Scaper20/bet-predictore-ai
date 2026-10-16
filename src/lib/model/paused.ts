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

export function isPausedPick(market: string): boolean {
  return PAUSED_PICK_MARKETS.includes(market) || market.startsWith("ou:under:");
}
