import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Live is force-dynamic and hits the providers on every request — ~0.5s of
 * real work on a cold cache, and more on a matchday when there are fixtures to
 * merge across three feeds.
 *
 * Shaped like the board it resolves to — a toolbar and two competition groups
 * of a few rows — rather than a page-worth: the real count is genuinely
 * unknown and often small, and a screen of shimmer oversells what is coming.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        eyebrow="Live"
        title="Live scores"
        description="Every match in play across the competitions we track, grouped by league. Scores and the clock come straight from the feed and refresh automatically."
      />
      <div className={`${containerClass()} space-y-5 py-7 sm:py-10`}>
        <div className="card space-y-4 p-4 sm:p-5">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="gap-5 lg:columns-2 [&>*]:mb-5">
          {[3, 2].map((rows, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-0">
                  <Skeleton className="h-4 w-9" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <Skeleton className="h-9 w-4" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
