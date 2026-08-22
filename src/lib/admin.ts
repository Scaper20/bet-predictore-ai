import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface AdminIdentity {
  id: string;
  email: string;
}

type Gate =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

/**
 * Core lookup, memoized per-request via React's cache() — request-scoped
 * de-duplication, NOT the long-lived TTL cache in lib/providers/cache.ts.
 * Lets admin/(protected)/layout.tsx and the page beneath it share one DB
 * round trip instead of two. Never crosses a request boundary: a fresh
 * Server Action/Route Handler call gets its own cache() scope, so admin
 * status is always re-verified fresh — same posture as deleteAccount
 * re-verifying identity on every call.
 */
const getGate = cache(async (): Promise<Gate> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const { data } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (!data) return { ok: false, reason: "forbidden" };

  return { ok: true, identity: { id: user.id, email: user.email ?? "" } };
});

/** Only for admin/login/page.tsx, which needs the unauthenticated-vs-forbidden
 * distinction to choose the right message. Everyone else: requireAdmin (pages)
 * or checkAdmin (actions/routes) below. */
export const getAdminGate = getGate;

/**
 * For Server Components — admin/(protected)/layout.tsx and any page that
 * wants to re-assert the gate explicitly. Always returns a valid identity or
 * redirects; never returns null.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const gate = await getGate();
  if (!gate.ok) redirect(gate.reason === "unauthenticated" ? "/admin/login" : "/admin/login?denied=1");
  return gate.identity;
}

export type AdminCheckResult =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; status: 401 | 403; error: string };

/**
 * For Server Actions and Route Handlers. Never redirects — a redirect thrown
 * mid-mutation would navigate the caller's whole page away, wrong for e.g.
 * "reply to ticket," which should just refresh in place. Returns a result
 * instead, matching this codebase's existing {error} action-state
 * convention; Route Handlers use `status` for the HTTP response code.
 */
export async function checkAdmin(): Promise<AdminCheckResult> {
  const gate = await getGate();
  if (!gate.ok) {
    return gate.reason === "unauthenticated"
      ? { ok: false, status: 401, error: "Sign in as an admin to do this." }
      : { ok: false, status: 403, error: "You don't have permission to do this." };
  }
  return { ok: true, identity: gate.identity };
}

/** One-line audit logging — every write goes through supabaseAdmin() since
 * admin_audit_log carries no RLS policy for `authenticated` at all. */
export async function logAdminAction(
  admin: AdminIdentity,
  action: string,
  target?: string,
  detail?: Record<string, unknown>,
) {
  await supabaseAdmin().from("admin_audit_log").insert({
    admin_id: admin.id,
    admin_email: admin.email,
    action,
    target,
    detail,
  });
}
