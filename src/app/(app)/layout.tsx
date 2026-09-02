import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { EntitlementProvider } from "@/components/entitlements/entitlement-provider";
import { ChatWidget } from "@/components/support/chat-widget";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

/**
 * Shared chrome for every public page, the landing page included.
 *
 * The (app) route group is URL-transparent, so this layout sits at "/" the
 * same as the root layout — hence LayoutProps<"/"> rather than a child route.
 *
 * The landing page used to sit outside this group and render its own copies
 * of SiteHeader/SiteFooter/ChatWidget. That made it the one public page with
 * no EntitlementProvider above it, so any <Gate> or <AccountGate> dropped on
 * it would have silently rendered the locked branch forever — which matters
 * now that the landing page carries sign-up CTAs that need to know whether
 * anyone is signed in.
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
      <ChatWidget />
      <ScrollToTop />
    </EntitlementProvider>
  );
}

