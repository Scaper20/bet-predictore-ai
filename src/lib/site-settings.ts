import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface SiteSettings {
  maintenanceEnabled: boolean;
  maintenanceMessage: string | null;
  updatedAt: string | null;
}

const OFF: SiteSettings = { maintenanceEnabled: false, maintenanceMessage: null, updatedAt: null };

/** For the admin pages, which have already passed requireAdmin(). Reads
 * through the service-role client like the rest of /admin; the proxy reads
 * the same row with the visitor's own session instead (see proxy.ts). */
export async function getSiteSettings(): Promise<SiteSettings> {
  let result;
  try {
    result = await supabaseAdmin()
      .from("site_settings")
      .select("maintenance_enabled, maintenance_message, updated_at")
      .maybeSingle();
  } catch {
    return OFF; // service-role key not configured — the admin layout calls this on every page
  }
  const { data, error } = result;
  if (error || !data) return OFF;
  return {
    maintenanceEnabled: data.maintenance_enabled === true,
    maintenanceMessage: data.maintenance_message ?? null,
    updatedAt: data.updated_at ?? null,
  };
}
