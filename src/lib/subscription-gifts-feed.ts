import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tier } from "@/lib/entitlements";

export interface GiftRow {
  id: string;
  tier: Tier;
  expiresAt: string;
  seenAt: string | null;
  note: string | null;
  grantedByEmail: string;
  createdAt: string;
}

const GIFT_COLUMNS = "id, tier, expires_at, seen_at, note, granted_by_email, created_at";

function rowFrom(r: Record<string, unknown>): GiftRow {
  return {
    id: r.id as string,
    tier: r.tier as Tier,
    expiresAt: r.expires_at as string,
    seenAt: (r.seen_at as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    grantedByEmail: r.granted_by_email as string,
    createdAt: r.created_at as string,
  };
}

/** Every currently-live (unexpired) gift for a user — almost always 0 or 1,
 * but an admin can gift twice, so entitlement resolution (src/lib/
 * entitlements.ts) takes the best of whatever comes back. */
export async function activeGiftsFor(userId: string): Promise<GiftRow[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("subscription_gifts")
    .select(GIFT_COLUMNS)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString());
  return (data ?? []).map(rowFrom);
}

/** The oldest live gift this user hasn't been shown the congratulations
 * popup for yet, or null. Oldest first so someone gifted twice sees them
 * in the order they were granted — one popup per page load. */
export async function unseenGiftFor(userId: string): Promise<GiftRow | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("subscription_gifts")
    .select(GIFT_COLUMNS)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .is("seen_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? rowFrom(data) : null;
}

/** Scoped by user_id as well as id — never trust a client-supplied gift id
 * alone, even though seen_at is low-stakes (it can't grant access), so one
 * signed-in user can't flip another's gift via a guessed uuid. */
export async function markGiftSeenForUser(giftId: string, userId: string): Promise<void> {
  const admin = supabaseAdmin();
  await admin
    .from("subscription_gifts")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", giftId)
    .eq("user_id", userId);
}

export interface GrantGiftInput {
  userId: string;
  tier: Extract<Tier, "pro" | "vip">;
  months: number;
  note: string | null;
  grantedByEmail: string;
}

export async function grantSubscriptionGift(
  input: GrantGiftInput,
): Promise<{ error: string | null; expiresAt?: string }> {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + input.months);

  const admin = supabaseAdmin();
  const { error } = await admin.from("subscription_gifts").insert({
    user_id: input.userId,
    tier: input.tier,
    granted_by_email: input.grantedByEmail,
    note: input.note,
    expires_at: expires.toISOString(),
  });
  if (error) return { error: "Couldn't save the gift. Try again." };
  return { error: null, expiresAt: expires.toISOString() };
}
