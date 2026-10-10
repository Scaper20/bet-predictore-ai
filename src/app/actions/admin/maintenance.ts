"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MAINTENANCE_MESSAGE_MAX } from "@/lib/maintenance";

export type MaintenanceActionState = { error: string | null; message: string | null };

/**
 * Switches the public site's maintenance blocker on or off (and saves the
 * message shown on it). The proxy picks the change up within a few seconds
 * — see readMaintenance() in src/proxy.ts.
 */
export async function setMaintenance(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const intent = String(formData.get("intent") ?? "");
  if (intent !== "enable" && intent !== "disable" && intent !== "save") {
    return { error: "Unknown action.", message: null };
  }
  const message = String(formData.get("message") ?? "").trim();
  if (message.length > MAINTENANCE_MESSAGE_MAX) {
    return { error: `Keep the message under ${MAINTENANCE_MESSAGE_MAX} characters.`, message: null };
  }

  const update: Record<string, unknown> = {
    maintenance_message: message || null,
    updated_at: new Date().toISOString(),
    updated_by: gate.identity.id,
  };
  if (intent !== "save") update.maintenance_enabled = intent === "enable";

  const { error } = await supabaseAdmin().from("site_settings").upsert({ id: true, ...update });
  if (error) return { error: "Couldn't update maintenance mode. Try again.", message: null };

  await logAdminAction(
    gate.identity,
    intent === "enable" ? "maintenance.enabled" : intent === "disable" ? "maintenance.disabled" : "maintenance.message_updated",
    undefined,
    { message: message || null },
  );

  revalidatePath("/admin", "layout");
  return {
    error: null,
    message:
      intent === "enable"
        ? "Maintenance mode is on. Visitors will see the maintenance page within a few seconds."
        : intent === "disable"
          ? "Maintenance mode is off. KiqStat is live again."
          : "Message saved.",
  };
}
