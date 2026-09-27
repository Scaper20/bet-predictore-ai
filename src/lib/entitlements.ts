import "server-only";

import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { activeGiftsFor } from "@/lib/subscription-gifts-feed";
import { bestGiftTier, effectiveEntitlement } from "@/lib/subscription-gifts";

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
   * already per-user and no-store, so it is the natural place for it.
   */
  email: string | null;
  /**
   * profiles.display_name, alongside email for the same reason — the account
   * menu prefers this over email whenever it's set (src/components/layout/
   * account-menu.tsx). Bundled in with email rather than kept a strictly
   * "entitlement-only" field: both are the same "who's signed in" round trip,
   * and splitting them would mean the header either shows a second, unrelated
   * network request or goes back to showing email only.
   */
  displayName: string | null;
}

/** Signed in, but with no paid relationship — a different thing from ANON. */
function signedInFree(email: string | null, displayName: string | null): Entitlement {
  return { tier: "free", status: "none", signedIn: true, email, displayName };
}

/** Nobody is signed in. */
const ANON: Entitlement = { tier: "free", status: "none", signedIn: false, email: null, displayName: null };

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
type TierStatus = Pick<Entitlement, "tier" | "status">;
const FREE_TIER: TierStatus = { tier: "free", status: "none" };

/** The tier/status a real `subscriptions` row resolves to, with no
 * knowledge of gifts — exactly the branching getEntitlement() used to do
 * inline, pulled out so a live gift can be folded in afterward. */
function resolveSubscriptionTier(
  data: { tier: string; status: string; current_period_end: string | null; pass_expires_at: string | null } | null,
): TierStatus {
  // "none" is the only status meaning "never had a paid relationship" —
  // active/past_due/cancelled all fall through to the expiry check below,
  // which is what actually decides access.
  if (!data || data.status === "none") return FREE_TIER;

  if (data.tier === "pass") {
    const expired = !data.pass_expires_at || new Date(data.pass_expires_at) < new Date();
    return expired ? FREE_TIER : { tier: "pass", status: "active" };
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
      ? { tier: data.tier as Tier, status: data.status as Entitlement["status"] }
      : FREE_TIER;
  }
  const expired = new Date(data.current_period_end) < new Date();
  if (expired) return FREE_TIER;

  return { tier: data.tier as Tier, status: data.status as Entitlement["status"] };
}

export async function getEntitlement(): Promise<Entitlement> {
  if (!supabaseConfigured) return ANON;

  // Hoisted out of the try so a failure *after* the session resolved still
  // reports the session honestly. Losing paid access to a transient database
  // error is the safe direction to fail; telling a signed-in user they have no
  // account is not — it would put "Create free account" in their header.
  let signedIn = false;
  let email: string | null = null;
  let displayName: string | null = null;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return ANON;
    signedIn = true;
    email = user.email ?? null;

    const [{ data }, { data: profile }, gifts] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("tier, status, current_period_end, pass_expires_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      activeGiftsFor(user.id),
    ]);
    displayName = profile?.display_name ?? null;

    const resolved = effectiveEntitlement(resolveSubscriptionTier(data), bestGiftTier(gifts));
    return { ...resolved, signedIn: true, email, displayName };
  } catch {
    return signedIn ? signedInFree(email, displayName) : ANON;
  }
}
