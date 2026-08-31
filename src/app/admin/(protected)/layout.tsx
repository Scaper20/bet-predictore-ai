import { requireAdmin } from "@/lib/admin";
import { AdminShell } from "@/components/admin/admin-shell";

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
 */
export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: LayoutProps<"/admin">) {
  const identity = await requireAdmin(); // redirects to /admin/login[?denied=1] on failure
  return <AdminShell identity={identity}>{children}</AdminShell>;
}
