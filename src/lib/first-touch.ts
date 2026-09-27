/**
 * Shared between src/proxy.ts (which captures it) and
 * src/app/actions/auth.ts (which reads it back at signup) — kept out of
 * proxy.ts itself so importing it elsewhere never pulls in anything
 * Edge-runtime-specific.
 *
 * See 0017_signup_attribution.sql for why this is first-touch, not
 * last-touch, and nullable throughout.
 */
export const FIRST_TOUCH_COOKIE = "bx_first_touch";

export interface FirstTouch {
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  landingPage: string | null;
}

export function trimFirstTouchValue(v: string | null, max: number): string | null {
  if (!v) return null;
  // Strip control/newline characters a hand-crafted URL could smuggle in —
  // this only ever lands in a cookie and later a DB column read back as
  // plain text in the admin dashboard, never HTML, but there's no reason to
  // carry them regardless.
  const cleaned = v.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
