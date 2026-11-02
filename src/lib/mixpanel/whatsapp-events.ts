import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { later, requestContext, trackServer } from "./server";

/**
 * whatsapp_vip_message_engaged. WhatsApp itself is outside the app, so the one
 * engagement KiqStat can see is a member opening the VIP chat invite through
 * /api/vip-chat/join: that is reported as a "clicked" on the "vip_chat_invite".
 * Views and replies inside WhatsApp are not visible to us.
 */

/** When the member's VIP began: their first confirmed VIP payment, else their first visit to the chat. */
async function vipStart(userId: string, firstOpenedAt: string | null): Promise<Date> {
  try {
    const { data } = await supabaseAdmin()
      .from("payments")
      .select("created_at")
      .eq("user_id", userId)
      .eq("status", "success")
      .like("plan", "vip:%")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.created_at) return new Date(data.created_at);
  } catch {
    // Fall through to the chat's own record.
  }
  return firstOpenedAt ? new Date(firstOpenedAt) : new Date();
}

export async function trackVipChatOpened(input: { userId: string; tier: string; firstOpenedAt: string | null }) {
  const ctx = await requestContext();
  later(async () => {
    const start = await vipStart(input.userId, input.firstOpenedAt);
    const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
    await trackServer(
      "whatsapp_vip_message_engaged",
      { message_type: "vip_chat_invite", engagement_type: "clicked", days_since_vip_start: days, current_tier: input.tier },
      { distinctId: input.userId, country: ctx.country },
    );
  });
}
