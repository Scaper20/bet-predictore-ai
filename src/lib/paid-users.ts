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
 * Users on a live VIP plan, paid or gifted: who belongs in the VIP WhatsApp
 * chat (lib/vip-chat.ts). Gifts count here, unlike paidUserIds, because a
 * gifted VIP is promised the chat like any other.
 */
export async function vipUserIds(admin: SupabaseClient, now = new Date()): Promise<Set<string>> {
  const [{ data: subs }, { data: gifts }] = await Promise.all([
    admin.from("subscriptions").select("user_id, status, current_period_end").eq("tier", "vip"),
    admin.from("subscription_gifts").select("user_id").eq("tier", "vip").gt("expires_at", now.toISOString()),
  ]);
  const out = new Set<string>();
  for (const s of subs ?? []) {
    if (s.status === "none") continue;
    const live = s.current_period_end ? Date.parse(s.current_period_end) > now.getTime() : s.status === "active";
    if (live) out.add(s.user_id as string);
  }
  for (const g of gifts ?? []) out.add(g.user_id as string);
  return out;
}
