import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { EntitlementProvider } from "@/components/entitlements/entitlement-provider";
import { ChatWidget } from "@/components/support/chat-widget";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { MobileNav } from "@/components/layout/mobile-nav";

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

      {/*
        Reserves the bottom bar's height at the very end of the document.
        Padding on <main> would not do it — the footer sits after main, so the
        fixed bar would still cover the last of the footer's links once you
        scroll to the bottom. Mirrors --bottom-nav-h; lg:hidden because the bar
        does not exist above that breakpoint.
      */}
      <div
        aria-hidden
        className="shrink-0 lg:hidden"
        style={{
          // +1px for the bar's own hairline top border, which sits outside
          // --bottom-nav-h. Without it the footer's last pixel is under the
          // bar, which is invisible but wrong and drifts if the border grows.
          height: "calc(var(--bottom-nav-h) + 1px)",
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      />

      <ChatWidget />
      <ScrollToTop />
      <MobileNav />
    </EntitlementProvider>
  );
}

