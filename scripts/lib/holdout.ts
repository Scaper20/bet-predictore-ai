/**
 * The frozen holdout (docs/model-audit-teams-2026-11.md, section F).
 *
 * Games from this date on are NOT used to choose or tune anything. A finished
 * change is scored on them once, with --final, and the number reported as is.
 * Until then every audit script stops at the day before, so a setting cannot be
 * fitted to them by accident. Moving this date forward is allowed (it widens
 * the holdout as time passes); moving it back is not.
 */
export const HOLDOUT_FROM = "2026-11-01";

/** The last day a tuning run may include, as YYYY-MM-DD. */
export const TUNING_END = "2026-10-31";

/** The end date to use: the requested one, never past TUNING_END unless --final. */
export function clampEnd(requested: string | undefined, final: boolean): string {
  if (final) return requested ?? "2099-12-31";
  if (!requested || requested > TUNING_END) return TUNING_END;
  return requested;
}
