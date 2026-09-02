import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { MatchCardSkeleton } from "@/components/ui/skeleton";

/**
 * Live is force-dynamic and hits the providers on every request — ~0.5s of
 * real work on a cold cache, and more on a matchday when there are fixtures to
 * merge across three feeds.
 *
 * Four placeholders rather than a page-worth: this is the one route where the
 * real count is genuinely unknown and often small, and a screen of shimmer
 * that resolves to two matches oversells what is coming.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        eyebrow="Live"
        title="Live scores"
        description="Every match currently in play across the competitions we track. Scores and the clock come straight from the feed and refresh automatically."
      />
      <div className={`${containerClass()} space-y-6 py-10`}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
