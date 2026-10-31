/**
 * Ask KiqStat is paused (October 2026) until its Anthropic credit and the
 * spending controls in lib/ask/ledger.ts are in place. While paused, the API
 * refuses questions without counting them, the panel says so, and the plans
 * say "back soon" beside the allowance instead of selling it. Set to false to
 * bring it back everywhere at once.
 */
export const ASK_PAUSED = false;

/** The line the panel and the API show while Ask is paused. */
export const ASK_PAUSED_MESSAGE =
  "Ask KiqStat is taking a short break while we upgrade it, and will be back soon. Nothing is counted against your questions. Every pick and breakdown is still on the match pages.";

/** A plan's Ask allowance as the plans show it: the allowance, marked while Ask is paused. */
export function askAllowance(text: string): string {
  return ASK_PAUSED ? `${text} (back soon)` : text;
}
