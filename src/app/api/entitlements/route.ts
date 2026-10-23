import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getEntitlement } from "@/lib/entitlements";
import { FIRST_TOUCH_COOKIE } from "@/lib/first-touch";
import { PARTNER_REF_COOKIE, PARTNER_REF_DAYS } from "@/lib/partner-ref";
import { recordSignupSource } from "@/lib/signup-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Marks that this browser's signup source was checked for the signed-in user (their id). */
const SOURCE_CHECKED_COOKIE = "kq_src";

/**
 * Client-side entitlement read, for the rare gated widget mounted without a
 * server-rendered parent already holding the tier (see EntitlementProvider).
 * Never cached — this is a per-user authorization check.
 *
 * It is also the catch-up for signup attribution (lib/signup-source.ts):
 * every page fetches this, so the first signed-in visit from a browser that
 * holds a first-touch or partner cookie records them, once per user per
 * browser. That is how sign-ups that never reached /auth/callback, and the
 * partner referrals lost with them, are picked up when those users return.
 */
export async function GET() {
  const entitlement = await getEntitlement();
  const response = NextResponse.json(entitlement, { headers: { "Cache-Control": "no-store, max-age=0" } });

  if (entitlement.userId) {
    const jar = await cookies();
    const firstTouch = jar.get(FIRST_TOUCH_COOKIE)?.value;
    const partnerRef = jar.get(PARTNER_REF_COOKIE)?.value;
    if ((firstTouch || partnerRef) && jar.get(SOURCE_CHECKED_COOKIE)?.value !== entitlement.userId) {
      await recordSignupSource(entitlement.userId, { firstTouch, partnerRef });
      response.cookies.set(SOURCE_CHECKED_COOKIE, entitlement.userId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * PARTNER_REF_DAYS,
      });
    }
  }
  return response;
}
