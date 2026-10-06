import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { LiveBoard } from "@/components/match/live-board";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { liveFeed } from "@/lib/service";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  alternates: { canonical: "/football/live" },
  title: "Live Football Scores",
  description:
    "Live football scores across the Premier League, NPFL, CAF competitions and more, " +
    "updated continuously from real data feeds.",
};

/** Scores move constantly; nothing here is worth caching. */
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const feed = await liveFeed().catch(() => null);

  return (
    <>
      <PageHeader
        eyebrow="Live"
        title="Live scores"
        description="Every match in play, updating live."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        {feed && <CoverageNotice coverage={feed.coverage} />}
        {feed ? (
          <LiveBoard initial={feed.matches} />
        ) : (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink-muted">
              The live feed is not responding right now. Refresh in a moment.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
