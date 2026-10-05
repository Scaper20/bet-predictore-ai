import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getForYouFeed } from "@/lib/for-you-feed";
import { ForYouDashboard } from "@/components/for-you/for-you-dashboard";
import { isSportId } from "@/lib/sports";

export const metadata: Metadata = {
  // The root layout's template appends "· BetriX" — spelling the brand out
  // here too produced "… | BetriX · BetriX".
  title: "For You",
  description:
    "Predictions from the competitions you follow, with the settled record behind them. " +
    "Pick your leagues once and this page only shows those.",
};

/**
 * Always rendered per request: getForYouFeed reads the session (for the tier
 * and the saved preferences), so there is nothing here to cache across users.
 * Stated explicitly rather than left to a `revalidate` that the cookie read
 * would silently override anyway — the old `revalidate = 60` on this file was
 * inert and read as though the page were cached.
 */
export const dynamic = "force-dynamic";

export default async function ForYouPage({ params }: PageProps<"/[sport]/for-you">) {
  const { sport } = await params;
  if (!isSportId(sport)) notFound();

  const feed = await getForYouFeed(sport);

  return (
    <>
      {/* Named for screen readers and the document outline; the visible page
          starts straight on the feed. */}
      <h1 className="sr-only">{feed.userName ? `For You — ${feed.userName}` : "For You"}</h1>
      <ForYouDashboard feed={feed} />
    </>
  );
}
