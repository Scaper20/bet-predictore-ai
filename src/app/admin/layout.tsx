import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · BetriX Admin" },
  robots: { index: false, follow: false },
};

/**
 * Ungated on purpose — this is the ancestor of both /admin/login (public)
 * and admin/(protected)/** (gated by that route group's own layout). A
 * single layout doing both "render every /admin/* page" and "redirect to
 * /admin/login when unauthenticated" would make /admin/login redirect to
 * itself.
 */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <>{children}</>;
}
