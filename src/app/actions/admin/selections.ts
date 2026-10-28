"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELECTIONS, type Surface } from "@/lib/model/selections";

export type SelectionActionState = { error: string | null; message: string | null };

const COLUMN: Record<Surface, "headline" | "code_hub"> = { headline: "headline", codeHub: "code_hub" };

/**
 * Publishes or retracts one selection on one surface (public.selection_switches),
 * or hands it back to the rules in code. Owner only: it changes what goes out.
 */
export async function setSelection(_prev: SelectionActionState, formData: FormData): Promise<SelectionActionState> {
  const gate = await checkPermission("model.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const market = String(formData.get("market") ?? "");
  const surface = String(formData.get("surface") ?? "") as Surface;
  const value = String(formData.get("value") ?? "");
  const def = SELECTIONS.find((s) => s.market === market);
  if (!def || !(surface in COLUMN) || !["on", "off", "default"].includes(value)) return { error: "Unknown action.", message: null };
  if (surface === "codeHub" && def.noCodeHub && value === "on") {
    return { error: `${def.label} is settled at half time, which a code can't follow yet.`, message: null };
  }

  const stored = value === "default" ? null : value === "on";
  const { error } = await supabaseAdmin()
    .from("selection_switches")
    .upsert({ market, [COLUMN[surface]]: stored, updated_at: new Date().toISOString(), updated_by: gate.identity.id }, { onConflict: "market" });
  if (error) return { error: "Couldn't save. Try again.", message: null };

  await logAdminAction(gate.identity, `selection.${surface}.${value}`, market);
  revalidatePath("/admin/publishing");
  const where = surface === "headline" ? "the headline" : "Code Hub codes";
  return {
    error: null,
    message:
      value === "default"
        ? `${def.label} follows the rules in code again for ${where}.`
        : `${def.label} is ${value === "on" ? "published in" : "retracted from"} ${where}. Live within a few minutes${surface === "codeHub" ? "; codes take it from the next morning's build" : ""}.`,
  };
}
