import "server-only";

import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export type Tier = "free" | "pass" | "pro" | "vip";

const RANK: Record<Tier, number> = { free: 0, pass: 1, pro: 2, vip: 3 };

/** Does `actual` unlock content that requires `required`? */
export function meets(actual: Tier, required: Tier): boolean {
  return RANK[actual] >= RANK[required];
}

export interface Entitlement {
  tier: Tier;
  status: "active" | "past_due" | "cancelled" | "none";
  /**
   * Whether anyone is signed in at all.
   *
   * Tier alone cannot answer this: a logged-out visitor and a registered user
   * who has never paid are both `free`. That distinction is the whole basis of
   * the account wall on prediction depth, and of whether the header offers
   * "Create free account" or an account menu — so it has to travel with the
   * tier rather than be a second round trip.
   */
  signedIn: boolean;
  /**
   * The signed-in user's own email, so the header can show who is signed in
   * without a second round trip. Null when logged out. This endpoint is
   * already per-user and no-store, so it is the natural place for it — but it
   * is the ONLY identity field that belongs here; anything more and this stops
   * being an entitlement check.
   */
  email: string | null;
}

/** Signed in, but with no paid relationship — a different thing from ANON. */
function signedInFree(email: string | null): Entitlement {
  return { tier: "free", status: "none", signedIn: true, email };
}

/** Nobody is signed in. */
const ANON: Entitlement = { tier: "free", status: "none", signedIn: false, email: null };

/**
 * Resolves the signed-in user's tier from `subscriptions`.
 *
 * Deliberately not routed through src/lib/providers/cache.ts — that cache is
 * tuned for shared, not-user-specific football data with TTLs up to an hour.
 * Reusing it here with a long TTL is exactly how a cancelled subscription
 * would keep paid access for however long the entry lives. Supabase reads
 * are single-digit milliseconds; this doesn't need caching to be cheap.
 *
 * Returns `free` for logged-out visitors, missing config, or any lookup
 * failure — entitlement checks fail closed, never open.
 */
export async function getEntitlement(): Promise<Entitlement> {
  if (!supabaseConfigured) return ANON;

  // Hoisted out of the try so a failure *after* the session resolved still
  // reports the session honestly. Losing paid access to a transient database
  // error is the safe direction to fail; telling a signed-in user they have no
  // account is not — it would put "Create free account" in their header.
  let signedIn = false;
  let email: string | null = null;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return ANON;
    signedIn = true;
    email = user.email ?? null;

    const { data } = await supabase
      .from("subscriptions")
      .select("tier, status, current_period_end, pass_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // "none" is the only status meaning "never had a paid relationship" —
    // active/past_due/cancelled all fall through to the expiry check below,
    // which is what actually decides access.
    if (!data || data.status === "none") return signedInFree(email);

    if (data.tier === "pass") {
      const expired = !data.pass_expires_at || new Date(data.pass_expires_at) < new Date();
      return expired
        ? signedInFree(email)
        : { tier: "pass", status: "active", signedIn: true, email };
    }

    // Pro/VIP: a cancelled-but-not-yet-lapsed, or past_due-but-in-grace-period,
    // subscription keeps access through the period already paid for.
    if (!data.current_period_end) {
      // No period-end on record yet. Only safe to assume "still within the
      // paid period" for a freshly active subscription — charge.success sets
      // status:"active" without current_period_end; the paired
      // subscription.create webhook (which sets it) can land slightly later.
      // For past_due/cancelled with no period-end ever recorded, there's no
      // paid-through date to honour.
      return data.status === "active"
        ? { tier: data.tier as Tier, status: data.status, signedIn: true, email }
        : signedInFree(email);
    }
    const expired = new Date(data.current_period_end) < new Date();
    if (expired) return signedInFree(email);

    return {
      tier: data.tier as Tier,
      status: data.status as Entitlement["status"],
      signedIn: true,
      email,
    };
  } catch {
    return signedIn ? signedInFree(email) : ANON;
  }
}
