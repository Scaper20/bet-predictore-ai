import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Shared chrome for every page other than the landing page.
 *
 * The (app) route group is URL-transparent, so this layout sits at "/" the
 * same as the root layout — hence LayoutProps<"/"> rather than a child route.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
