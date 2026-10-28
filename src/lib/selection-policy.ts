import "server-only";

import { cached } from "@/lib/providers/cache";
import { setSelectionPolicy, type SelectionPolicy } from "@/lib/model/selections";

/** How soon a flip from /admin reaches every instance, as with app_switches. */
export const SELECTION_TTL_MS = 15_000;

async function read(): Promise<SelectionPolicy> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin().from("selection_switches").select("market, headline, code_hub");
    if (error || !data) return {};
    const out: Record<string, { headline?: boolean; codeHub?: boolean }> = {};
    for (const r of data) {
      out[r.market as string] = {
        ...(typeof r.headline === "boolean" ? { headline: r.headline } : {}),
        ...(typeof r.code_hub === "boolean" ? { codeHub: r.code_hub } : {}),
      };
    }
    return out;
  } catch {
    // No table yet, or no database: the rules in code decide.
    return {};
  }
}

/**
 * The owner's selection switches (public.selection_switches, 0084), loaded
 * into model/selections.ts before anything is modelled. Briefly cached, so a
 * page costs one read per instance, not one per render.
 */
export async function applySelectionPolicy(): Promise<SelectionPolicy> {
  const p = await cached("selection-policy", SELECTION_TTL_MS, read).catch(() => ({}));
  setSelectionPolicy(p);
  return p;
}

/** Read fresh, for the admin page, which must show what is stored now. */
export function selectionPolicyFresh(): Promise<SelectionPolicy> {
  return read();
}
