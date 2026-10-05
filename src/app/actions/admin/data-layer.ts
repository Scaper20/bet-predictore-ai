"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type DataLayerActionState = { error: string | null; message: string | null };

const MODES = ["live", "db_fallback", "db"] as const;

/**
 * Chooses which layer the site reads sports data from (site_settings.data_layer).
 * Pages pick the change up within about 30 seconds; "live" is always one
 * click away if the scheduled data looks wrong.
 */
export async function setDataLayer(_prev: DataLayerActionState, formData: FormData): Promise<DataLayerActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const mode = String(formData.get("mode") ?? "");
  if (!(MODES as readonly string[]).includes(mode)) return { error: "Unknown mode.", message: null };

  const { error } = await supabaseAdmin()
    .from("site_settings")
    .upsert({ id: true, data_layer: mode, updated_at: new Date().toISOString(), updated_by: gate.identity.id });
  if (error) return { error: "Couldn't change the data layer. Has migration 0029 been run?", message: null };

  await logAdminAction(gate.identity, "data_layer.changed", undefined, { mode });
  revalidatePath("/admin/data-health");
  return {
    error: null,
    message:
      mode === "live"
        ? "Pages now call the provider APIs directly, as before."
        : mode === "db"
          ? "Pages now read only the scheduled tables. No sports API is called while a page renders."
          : "Pages now read the scheduled tables, falling back to the APIs where a table is empty.",
  };
}

/** Switches one upstream source on or off; jobs skip a disabled source without calling it. */
export async function setSourceEnabled(_prev: DataLayerActionState, formData: FormData): Promise<DataLayerActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };
  const id = String(formData.get("source") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return { error: "Unknown source.", message: null };

  const { error } = await supabaseAdmin()
    .from("ingest_sources")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Couldn't update the source.", message: null };

  await logAdminAction(gate.identity, enabled ? "ingest_source.enabled" : "ingest_source.disabled", undefined, { source: id });
  revalidatePath("/admin/data-health");
  return { error: null, message: `${id} ${enabled ? "enabled" : "disabled"}. The next job run will ${enabled ? "use" : "skip"} it.` };
}
