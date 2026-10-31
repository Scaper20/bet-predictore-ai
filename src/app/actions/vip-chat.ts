"use server";

import { revalidatePath } from "next/cache";
import { getEntitlement, meets } from "@/lib/entitlements";
import { normaliseWhatsAppNumber } from "@/lib/vip-chat";
import { saveVipChatNumber } from "@/lib/vip-chat-store";

export type VipNumberState = { status: "idle" | "saved" | "error"; message: string | null };

/**
 * Saves the WhatsApp number a VIP member will join the chat with. The admins
 * approve join requests against it, so it has to be the number the request
 * comes from.
 */
export async function saveVipNumber(_prev: VipNumberState, formData: FormData): Promise<VipNumberState> {
  const ent = await getEntitlement();
  if (!ent.userId) return { status: "error", message: "Sign in first." };
  if (!meets(ent.tier, "vip") || ent.passOnly) return { status: "error", message: "The VIP chat comes with the VIP plan." };

  const number = normaliseWhatsAppNumber(String(formData.get("number") ?? ""));
  if (!number) {
    return { status: "error", message: "Enter the number you use on WhatsApp, like 0803 123 4567 or +233 24 123 4567." };
  }
  if (!(await saveVipChatNumber(ent.userId, number))) {
    return { status: "error", message: "Couldn't save that just now. Try again in a moment." };
  }
  revalidatePath("/vip");
  return { status: "saved", message: null };
}
