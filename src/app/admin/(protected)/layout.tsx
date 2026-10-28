import { requireAdmin } from "@/lib/admin";
import { can } from "@/lib/admin-access";
import { isMailAdmin } from "@/lib/admin-mail";
import { AdminShell, type AdminEnv } from "@/components/admin/admin-shell";
import { getSiteSettings } from "@/lib/site-settings";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Unlike (app)/layout.tsx, this layout SHOULD resolve identity server-side
 * and pass it down — the ISR-protection rule that governs the public app
 * (never call cookies()/supabaseServer() in a shared layout) exists to
 * protect revalidate-based caching on rate-limited pages. Nothing under
 * /admin is ever static; every page here is inherently a per-request
 * authenticated read, so that concern doesn't apply.
 *
 * Stated explicitly, not just implied by requireAdmin() calling cookies():
 * when Supabase isn't configured, getGate() short-circuits before touching
 * any dynamic API (see lib/admin.ts), which otherwise left pages under this
 * group that call supabaseAdmin() directly (tickets, users, ...) exposed to
 * static prerendering at build time — the same class of crash this layout's
 * own comment says can't happen here.
 *
 * This layout only proves the visitor is staff. What they may open is
 * checked by each page (requirePermission), so a page is never protected by
 * the nav alone.
 */
export const dynamic = "force-dynamic";

const ENV: AdminEnv =
  process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "development";

export default async function ProtectedAdminLayout({ children }: LayoutProps<"/admin">) {
  const identity = await requireAdmin(); // redirects to /admin/login[?denied=1] on failure
  const [{ maintenanceEnabled }, openTickets] = await Promise.all([
    getSiteSettings(),
    can(identity.roles, "support.view")
      ? supabaseAdmin()
          .from("support_tickets")
          .select("*", { count: "exact", head: true })
          .eq("status", "open")
          .then((r) => r.count ?? 0, () => 0)
      : Promise.resolve(0),
  ]);
  // Mail is limited to one named account on top of its permission, and is
  // invisible to everyone else rather than shown and refused: see
  // admin-mail.ts on why. ADMIN_MAIL_ALLOWED_EMAIL is server-only, so this is
  // decided here.
  const hiddenNav = isMailAdmin(identity.email) ? [] : ["/admin/mail"];
  return (
    <AdminShell
      identity={identity}
      hiddenNav={hiddenNav}
      counts={{ "/admin/tickets": openTickets }}
      maintenanceOn={maintenanceEnabled}
      env={ENV}
    >
      {children}
    </AdminShell>
  );
}
