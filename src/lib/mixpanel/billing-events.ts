import "server-only";

import { tierForUser } from "@/lib/entitlements";
import { later, requestContext, setUserProfile, trackServer } from "./server";

/**
 * upgrade_to_pro_started (checkout opened) and upgrade_to_vip_completed (a
 * VIP payment confirmed and access granted). Both are server-side because the
 * server is the only place that knows the payment is real.
 */

/** monthly / quarterly stay as they are; yearly is reported as annual. */
export function planPeriod(cycle: string): string {
  return cycle === "yearly" ? "annual" : cycle;
}

/** Called from a checkout route, inside the user's request. Pro only: VIP is counted when it completes. */
export async function trackProStarted(input: { userId: string; tier: string; cycle: string; paymentMethod: string }) {
  if (input.tier !== "pro") return;
  const ctx = await requestContext();
  later(async () => {
    const from = await tierForUser(input.userId);
    await trackServer(
      "upgrade_to_pro_started",
      { from_tier: from, payment_method: input.paymentMethod, plan_period: planPeriod(input.cycle), country: ctx.country ?? "unknown" },
      { distinctId: input.userId, country: ctx.country },
    );
  });
}

/**
 * Called where VIP is granted. `fromTier` is what the subscription row held
 * before the grant. `reference` (the payment or subscription reference) makes
 * a redelivered webhook count once.
 */
export function trackVipCompleted(input: { userId: string; fromTier: string | null | undefined; cycle: string; paymentMethod: string; reference: string; at?: Date }) {
  const at = input.at ?? new Date();
  later(async () => {
    await trackServer(
      "upgrade_to_vip_completed",
      {
        from_tier: input.fromTier || "free",
        payment_method: input.paymentMethod,
        plan_period: planPeriod(input.cycle),
        vip_start_datetime: at.toISOString(),
      },
      { distinctId: input.userId, insertId: `vip:${input.reference}`, at },
    );
    await setUserProfile(input.userId, { current_tier: "vip", vip_start_datetime: at.toISOString() });
  });
}
