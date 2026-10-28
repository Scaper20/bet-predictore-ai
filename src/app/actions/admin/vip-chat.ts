"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normaliseInviteUrl } from "@/lib/vip-chat";

export type VipInviteState = { error: string | null; message: string | null };

/**
 * Saves the VIP chat's invite link. After resetting the link in WhatsApp
 * (Group info → Invite via link → Reset link), paste the new one here: the
 * old one stops working for anyone it leaked to.
 */
export async function setVipInvite(_prev: VipInviteState, formData: FormData): Promise<VipInviteState> {
  const gate = await checkPermission("vip.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const raw = String(formData.get("invite") ?? "").trim();
  const inviteUrl = raw ? normaliseInviteUrl(raw) : null;
  if (raw && !inviteUrl) return { error: "That isn't a WhatsApp group link (https://chat.whatsapp.com/…).", message: null };

  const { error } = await supabaseAdmin()
    .from("vip_chat_settings")
    .upsert({ id: true, invite_url: inviteUrl, updated_at: new Date().toISOString(), updated_by: gate.identity.id });
  if (error) return { error: "Couldn't save the link. Try again.", message: null };

  await logAdminAction(gate.identity, inviteUrl ? "vip_chat.invite_set" : "vip_chat.invite_cleared");
  revalidatePath("/admin/vip-chat");
  return { error: null, message: inviteUrl ? "Saved. VIP members now join through this link." : "Link cleared. The join button is hidden." };
}

/** Records that a lapsed member's number is out of the group, or undoes it. */
export async function setVipRemoved(formData: FormData): Promise<void> {
  const gate = await checkPermission("vip.manage");
  if (!gate.ok) return;
  const userId = String(formData.get("userId") ?? "");
  const removed = formData.get("removed") === "1";
  if (!userId) return;

  await supabaseAdmin()
    .from("vip_chat_members")
    .update({ removed_at: removed ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await logAdminAction(gate.identity, removed ? "vip_chat.member_removed" : "vip_chat.member_restored", userId);
  revalidatePath("/admin/vip-chat");
}
