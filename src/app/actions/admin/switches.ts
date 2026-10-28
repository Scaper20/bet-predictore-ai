"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SwitchKey } from "@/lib/switches";
import type { Permission } from "@/lib/admin-access";

export type SwitchActionState = { error: string | null; message: string | null };

const KEYS: SwitchKey[] = ["parsebot_live", "code_hub_open", "sportybet_direct", "headline_engine"];

const DONE: Record<SwitchKey, [string, string]> = {
  parsebot_live: [
    "parse.bot is on. Calls start within about 15 seconds, inside the credit caps.",
    "parse.bot is off. No more credits will be spent.",
  ],
  code_hub_open: ["The Code Hub is open to everyone.", "The Code Hub is back behind its waitlist."],
  sportybet_direct: [
    "SportyBet direct is on. Boards and booking codes come straight from SportyBet within about 15 seconds.",
    "SportyBet direct is off. Prices come from stored boards, or parse.bot if it is on.",
  ],
  headline_engine: [
    "The headline engine now publishes the headline, on every page within about 15 seconds of a fresh slate.",
    "The model's own headline is back. The engine is still logged beside it.",
  ],
};

/** Changing what is published is the owner's call; the operational switches are product's. */
const PERMISSION: Record<SwitchKey, Permission> = {
  parsebot_live: "codehub.manage",
  code_hub_open: "codehub.manage",
  sportybet_direct: "codehub.manage",
  headline_engine: "model.manage",
};

/** Flips one operator switch (public.app_switches). Instances pick it up within SWITCH_TTL_MS. */
export async function setSwitch(_prev: SwitchActionState, formData: FormData): Promise<SwitchActionState> {
  const key = String(formData.get("key") ?? "") as SwitchKey;
  const intent = String(formData.get("intent") ?? "");
  if (!KEYS.includes(key) || (intent !== "on" && intent !== "off")) {
    return { error: "Unknown action.", message: null };
  }
  const gate = await checkPermission(PERMISSION[key]);
  if (!gate.ok) return { error: gate.error, message: null };
  const enabled = intent === "on";

  const { error } = await supabaseAdmin()
    .from("app_switches")
    .upsert({ key, enabled, updated_at: new Date().toISOString(), updated_by: gate.identity.id });
  if (error) return { error: "Couldn't save the switch. Try again.", message: null };

  await logAdminAction(gate.identity, `switch.${key}.${intent}`);
  revalidatePath("/admin/parsebot");
  revalidatePath("/admin/sportybet");
  revalidatePath("/admin/model-performance");
  return { error: null, message: DONE[key][enabled ? 0 : 1] };
}
