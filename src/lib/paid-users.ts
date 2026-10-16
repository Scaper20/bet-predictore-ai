import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Users on a live paid plan, for sends that go to many devices at once and
 * must hold Pro-league picks back from everyone else (the morning push, the
 * pre-kick-off Strong pick alert). The same expiry rules as entitlements.ts,
 * read in one query instead of one per user.
 */
export async function paidUserIds(admin: SupabaseClient, now = new Date()): Promise<Set<string>> {
  const { data } = await admin.from("subscriptions").select("user_id, tier, status, current_period_end, pass_expires_at");
  const out = new Set<string>();
  for (const s of data ?? []) {
    if (s.status === "none") continue;
    if (s.tier !== "pro" && s.tier !== "vip" && s.tier !== "pass") continue;
    const until = s.tier === "pass" ? s.pass_expires_at : s.current_period_end;
    const live = until ? Date.parse(until) > now.getTime() : s.tier !== "pass" && s.status === "active";
    if (live) out.add(s.user_id as string);
  }
  return out;
}
