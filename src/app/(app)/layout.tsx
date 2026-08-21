import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { EntitlementProvider } from "@/components/entitlements/entitlement-provider";

/**
 * Shared chrome for every page other than the landing page.
 *
 * The (app) route group is URL-transparent, so this layout sits at "/" the
 * same as the root layout — hence LayoutProps<"/"> rather than a child route.
 *
 * Deliberately NOT resolving the tier here (that would mean calling
 * cookies()/supabaseServer() in a layout every page shares, which forces the
 * whole route to skip static rendering — throwing away the revalidate=60/180/300
 * ISR caching that /fixtures, /predictions, /trends and /match/[id] depend on
 * to avoid re-hammering rate-limited football-data feeds on every request).
 * EntitlementProvider mounts with no `initial` here, so it does its own
 * client-side fetch to /api/entitlements — one extra round trip per page load
 * is the accepted cost of keeping these routes cacheable.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <EntitlementProvider>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </EntitlementProvider>
  );
}
