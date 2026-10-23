import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { FirstTouch } from "@/lib/first-touch";
import { attributeSignup, creditPastPayments } from "@/lib/partner-attribution";

/**
 * Where a new account came from: the first-touch cookie (src/proxy.ts) onto
 * its profile, and the partner whose link it followed, if any.
 *
 * Written with the service role and awaited. Both used to be written through
 * the user's own client without waiting (`void ...update()`), and on Vercel
 * the function is frozen once the response is sent, so not one first-touch
 * row was ever saved. It is called from both sign-up paths and, as a catch-up,
 * from /api/entitlements on a signed-in visit: Google sign-ins came back to
 * the home page rather than /auth/callback (the redirect URL was not on
 * Supabase's allowlist), so neither ran for them at all.
 */

/** First-touch is only filled in for accounts this young: an older account on a new device would record the wrong visit. */
const FIRST_TOUCH_MAX_AGE_DAYS = 14;

function parseFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as FirstTouch;
  } catch {
    return null;
  }
}

export async function recordSignupSource(
  userId: string,
  cookies: { firstTouch?: string | null; partnerRef?: string | null },
): Promise<{ firstTouch: boolean; partner: boolean }> {
  const out = { firstTouch: false, partner: false };
  try {
    const ft = parseFirstTouch(cookies.firstTouch);
    if (ft) {
      const since = new Date(Date.now() - FIRST_TOUCH_MAX_AGE_DAYS * 86_400_000).toISOString();
      const { data } = await supabaseAdmin()
        .from("profiles")
        .update({
          signup_referrer_host: ft.referrerHost,
          signup_utm_source: ft.utmSource,
          signup_utm_medium: ft.utmMedium,
          signup_utm_campaign: ft.utmCampaign,
          signup_utm_term: ft.utmTerm,
          signup_utm_content: ft.utmContent,
          signup_landing_page: ft.landingPage,
        })
        .eq("id", userId)
        .is("signup_landing_page", null)
        .gte("created_at", since)
        .select("id");
      out.firstTouch = (data ?? []).length > 0;
    }
  } catch {
    // Attribution must never break a sign-in.
  }

  out.partner = await attributeSignup(userId, cookies.partnerRef);
  if (out.partner) await creditPastPayments(userId).catch(() => 0);
  return out;
}
