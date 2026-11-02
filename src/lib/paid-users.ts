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

/**
 * Each user's live Pro or VIP plan, paid or gifted, the better of the two
 * when they have both. Users on neither are absent. For offer audiences, which must
 * not be sent to anyone already on a plan.
 */
export async function livePlans(admin: SupabaseClient, now = new Date()): Promise<Map<string, "pro" | "vip">> {
  const [{ data: subs }, { data: gifts }] = await Promise.all([
    admin.from("subscriptions").select("user_id, tier, status, current_period_end").in("tier", ["pro", "vip"]),
    admin.from("subscription_gifts").select("user_id, tier").in("tier", ["pro", "vip"]).gt("expires_at", now.toISOString()),
  ]);
  const out = new Map<string, "pro" | "vip">();
  const add = (userId: string, tier: "pro" | "vip") => {
    if (out.get(userId) !== "vip") out.set(userId, tier);
  };
  for (const s of subs ?? []) {
    if (s.status === "none") continue;
    const live = s.current_period_end ? Date.parse(s.current_period_end) > now.getTime() : s.status === "active";
    if (live) add(s.user_id as string, s.tier as "pro" | "vip");
  }
  for (const g of gifts ?? []) add(g.user_id as string, g.tier as "pro" | "vip");
  return out;
}
