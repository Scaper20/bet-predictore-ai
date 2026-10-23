import "server-only";

import { checkAdmin } from "@/lib/admin";
import { getEntitlement, type Entitlement } from "@/lib/entitlements";
import { switchOn } from "@/lib/switches";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Who may see the Code Hub pages (today's codes, the editor, community codes)
 * while it is on its waitlist. It opens for everyone from /admin/parsebot
 * (`code_hub_open`); admins see through it before that, and so does every
 * Vercel preview build, so the real pages can be checked before launch.
 */
export interface HubGate {
  entitlement: Entitlement;
  open: boolean;
  admin: boolean;
  preview: boolean;
  /** Show the real page rather than the waitlist. */
  allowed: boolean;
}

export async function hubGate(): Promise<HubGate> {
  const [entitlement, open, admin] = await Promise.all([
    getEntitlement(),
    switchOn("code_hub_open"),
    checkAdmin().then((g) => g.ok),
  ]);
  const preview = process.env.VERCEL_ENV === "preview";
  return { entitlement, open, admin, preview, allowed: open || admin || preview };
}

export async function onWaitlist(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { count } = await supabaseAdmin()
      .from("code_hub_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
