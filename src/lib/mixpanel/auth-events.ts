import "server-only";

import { tierForUser } from "@/lib/entitlements";
import { acquisitionChannel } from "./channel";
import { later, requestContext, setUserProfile, trackServer } from "./server";

/**
 * user_signed_up and login_started, called from the sign-up/sign-in actions
 * and the OAuth callback. Everything that needs the request (country, device,
 * cookies) is read first; the tier lookup and delivery happen after the
 * response, so signing in is never slower for being measured.
 */

export async function trackSignedUp(userId: string, method: string, cookies: { firstTouch?: string | null; partnerRef?: string | null }) {
  const ctx = await requestContext();
  const channel = acquisitionChannel(cookies.firstTouch, cookies.partnerRef);
  later(async () => {
    await trackServer(
      "user_signed_up",
      { signup_method: method, acquisition_channel: channel, country: ctx.country ?? "unknown", initial_tier: "free" },
      // One sign-up per account, even if this runs twice.
      { distinctId: userId, country: ctx.country, insertId: `signup:${userId}` },
    );
    await setUserProfile(userId, { signup_method: method, acquisition_channel: channel, country: ctx.country, current_tier: "free" }, ctx.country);
  });
}

export async function trackLoggedIn(userId: string, method: string) {
  const ctx = await requestContext();
  later(async () => {
    const tier = await tierForUser(userId);
    await trackServer(
      "login_started",
      { login_method: method, country: ctx.country ?? "unknown", current_tier: tier, device_type: ctx.deviceType },
      { distinctId: userId, country: ctx.country },
    );
  });
}
