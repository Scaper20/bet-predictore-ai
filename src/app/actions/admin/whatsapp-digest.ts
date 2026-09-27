"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildDailyDigest } from "@/lib/whatsapp-digest-feed";
import { APP_TIMEZONE } from "@/lib/format";

export type WhatsappDigestActionState = { error: string | null };

/**
 * Manual trigger for /admin/whatsapp-digest — same computation the daily
 * cron runs (api/cron/whatsapp-digest), for "the cron hasn't fired yet" or
 * "the slate changed since this morning, regenerate it" cases. Upserts on
 * digest_date exactly like the cron, so this always replaces today's row
 * rather than duplicating it.
 */
export async function regenerateWhatsappDigest(
  _prev: WhatsappDigestActionState,
): Promise<WhatsappDigestActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error };

  const now = new Date();
  const digest = await buildDailyDigest(now);
  const digestDate = now.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });

  const admin = supabaseAdmin();
  const { error } = await admin.from("whatsapp_digests").upsert(
    {
      digest_date: digestDate,
      has_picks: digest.hasPicks,
      picks_message: digest.picksMessage,
      acca_messages: digest.accaMessages,
    },
    { onConflict: "digest_date" },
  );
  if (error) return { error: "Couldn't regenerate the digest. Try again." };

  await logAdminAction(gate.identity, "whatsapp_digest.regenerated", digestDate);

  revalidatePath("/admin/whatsapp-digest");
  return { error: null };
}
