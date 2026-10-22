import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { vipUserIds } from "@/lib/paid-users";
import { rosterStatus, type RosterStatus } from "@/lib/vip-chat";

/**
 * Reads and writes for the VIP WhatsApp chat (migration 0064). Service role
 * throughout: the invite link must never travel to a browser, and the
 * numbers are only for the member and the admins.
 */

export interface VipChatSettings {
  inviteUrl: string | null;
  updatedAt: string | null;
}

export async function vipChatSettings(): Promise<VipChatSettings> {
  const { data } = await supabaseAdmin().from("vip_chat_settings").select("invite_url, updated_at").maybeSingle();
  return { inviteUrl: data?.invite_url ?? null, updatedAt: data?.updated_at ?? null };
}

export interface VipChatMember {
  whatsappNumber: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  removedAt: string | null;
}

export async function vipChatMember(userId: string): Promise<VipChatMember | null> {
  const { data } = await supabaseAdmin()
    .from("vip_chat_members")
    .select("whatsapp_number, first_opened_at, last_opened_at, removed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    whatsappNumber: data.whatsapp_number,
    firstOpenedAt: data.first_opened_at,
    lastOpenedAt: data.last_opened_at,
    removedAt: data.removed_at,
  };
}

export async function saveVipChatNumber(userId: string, whatsappNumber: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from("vip_chat_members")
    .upsert({ user_id: userId, whatsapp_number: whatsappNumber, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

/**
 * Stamps a member opening the invite link. Opening it on a live plan also
 * clears an earlier removal: a member who lapsed and came back is asking to
 * be let in again.
 */
export async function markVipChatOpened(userId: string, member: VipChatMember): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin()
    .from("vip_chat_members")
    .update({ first_opened_at: member.firstOpenedAt ?? now, last_opened_at: now, removed_at: null, updated_at: now })
    .eq("user_id", userId);
}

export interface RosterRow {
  userId: string;
  email: string | null;
  name: string | null;
  whatsappNumber: string | null;
  status: RosterStatus;
  lastOpenedAt: string | null;
  removedAt: string | null;
}

export interface VipRoster {
  rows: RosterRow[];
  /** VIP members who haven't given a number yet. */
  noNumber: RosterRow[];
}

/** Everyone the admin page needs: each member with a number, and each VIP without one. */
export async function vipRoster(now = new Date()): Promise<VipRoster> {
  const admin = supabaseAdmin();
  const [vip, { data: members }] = await Promise.all([
    vipUserIds(admin, now),
    admin.from("vip_chat_members").select("user_id, whatsapp_number, last_opened_at, removed_at"),
  ]);
  const ids = [...new Set([...vip, ...(members ?? []).map((m) => m.user_id as string)])];
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, email, display_name").in("id", ids)
    : { data: [] as { id: string; email: string | null; display_name: string | null }[] };
  const who = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const withNumber = new Set<string>();
  const rows: RosterRow[] = (members ?? []).map((m) => {
    const userId = m.user_id as string;
    withNumber.add(userId);
    return {
      userId,
      email: who.get(userId)?.email ?? null,
      name: who.get(userId)?.display_name ?? null,
      whatsappNumber: m.whatsapp_number,
      status: rosterStatus({ vip: vip.has(userId), openedAt: m.last_opened_at, removedAt: m.removed_at }),
      lastOpenedAt: m.last_opened_at,
      removedAt: m.removed_at,
    };
  });
  const noNumber: RosterRow[] = [...vip]
    .filter((id) => !withNumber.has(id))
    .map((userId) => ({
      userId,
      email: who.get(userId)?.email ?? null,
      name: who.get(userId)?.display_name ?? null,
      whatsappNumber: null,
      status: "not-joined" as const,
      lastOpenedAt: null,
      removedAt: null,
    }));

  const order: Record<RosterStatus, number> = { remove: 0, "not-joined": 1, in: 2, out: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""));
  return { rows, noNumber };
}
