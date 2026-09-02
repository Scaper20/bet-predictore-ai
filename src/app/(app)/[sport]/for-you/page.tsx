import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getForYouFeed } from "@/lib/for-you-feed";
import { ForYouDashboard } from "@/components/for-you/for-you-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/primitives";
import { isSportId } from "@/lib/sports";
import { sportPath } from "@/lib/routes";

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

  const greeting = feed.userName ? `Welcome back, ${feed.userName}` : "Your feed";

  return (
    <>
      <PageHeader
        eyebrow="For You"
        title={greeting}
        description={
          feed.signedIn
            ? "Picks from the competitions you follow, plus the strongest reads across the whole slate — each section labelled so you always know which is which."
            : "A preview of the personalised feed. Create a free account to choose your own competitions."
        }
        actions={
          <ButtonLink
            href={sportPath("predictions", sport)}
            variant="secondary"
            className="px-4 py-2 text-sm"
          >
            All predictions
          </ButtonLink>
        }
      />
      <ForYouDashboard feed={feed} />
    </>
  );
}
