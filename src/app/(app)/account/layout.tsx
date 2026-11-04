import type { Metadata } from "next";

/**
 * Account, sign-in and billing pages are for the signed-in person, not for
 * search. They are marked noindex here rather than blocked in robots.txt: a
 * crawler that is told not to fetch a page never sees its noindex, and Google
 * lists such a URL anyway (the billing page was showing up in search results).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return children;
}
