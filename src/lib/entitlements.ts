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
}

const FREE: Entitlement = { tier: "free", status: "none" };

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
  if (!supabaseConfigured) return FREE;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return FREE;

    const { data } = await supabase
      .from("subscriptions")
      .select("tier, status, current_period_end, pass_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data || data.status !== "active") return FREE;

    if (data.tier === "pass") {
      const expired = !data.pass_expires_at || new Date(data.pass_expires_at) < new Date();
      return expired ? FREE : { tier: "pass", status: "active" };
    }

    // Pro/VIP: a cancelled-but-not-yet-lapsed subscription keeps access
    // through the period already paid for.
    const expired = data.current_period_end ? new Date(data.current_period_end) < new Date() : false;
    if (expired) return FREE;

    return { tier: data.tier as Tier, status: data.status as Entitlement["status"] };
  } catch {
    return FREE;
  }
}
