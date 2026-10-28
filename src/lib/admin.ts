import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can, cleanRoles, PERMISSIONS, type Permission, type Role } from "@/lib/admin-access";

export interface AdminIdentity {
  id: string;
  email: string;
  /** The staff roles this account holds (admin_users.roles); access is their union (lib/admin-access.ts). */
  roles: Role[];
}

type Gate =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "not_configured" };

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
  // Same degrade-gracefully posture as (app)/account/page.tsx: an
  // unconfigured deployment shouldn't throw during prerendering, and a
  // visitor hitting /admin should see why, not an unauthenticated prompt
  // that can never succeed.
  if (!supabaseConfigured) return { ok: false, reason: "not_configured" };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const { data } = await supabase.from("admin_users").select("id, roles").eq("id", user.id).maybeSingle();
  if (!data) return { ok: false, reason: "forbidden" };
  // A row whose roles are all unknown (or empty) is staff with no access, not
  // an owner: cleanRoles never guesses upward.
  const roles = cleanRoles(data.roles as unknown[] | null);
  if (roles.length === 0) return { ok: false, reason: "forbidden" };

  return { ok: true, identity: { id: user.id, email: user.email ?? "", roles } };
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
  if (!gate.ok) redirect(gate.reason === "forbidden" ? "/admin/login?denied=1" : "/admin/login");
  return gate.identity;
}

/**
 * The gate for a page that needs one permission. Signed-out and non-staff
 * visitors go to the login page; staff without the permission land on
 * /admin/denied, which names what is missing and who can grant it, rather
 * than a page that renders half its data.
 */
export async function requirePermission(permission: Permission): Promise<AdminIdentity> {
  const identity = await requireAdmin();
  if (!can(identity.roles, permission)) redirect(`/admin/denied?need=${encodeURIComponent(permission)}`);
  return identity;
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
    if (gate.reason === "forbidden") {
      return { ok: false, status: 403, error: "You don't have permission to do this." };
    }
    return {
      ok: false,
      status: 401,
      error:
        gate.reason === "not_configured"
          ? "Admin access isn't configured for this deployment."
          : "Sign in as an admin to do this.",
    };
  }
  return { ok: true, identity: gate.identity };
}

/**
 * checkAdmin plus one permission, for Server Actions and Route Handlers. Every
 * admin mutation goes through this: the nav hiding a page is a courtesy, this
 * is the boundary.
 */
export async function checkPermission(permission: Permission): Promise<AdminCheckResult> {
  const gate = await checkAdmin();
  if (!gate.ok) return gate;
  if (!can(gate.identity.roles, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Your role doesn't include "${PERMISSIONS[permission].label}". Ask the owner if you need it.`,
    };
  }
  return gate;
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
    admin_roles: admin.roles,
    action,
    target,
    detail,
  });
}
