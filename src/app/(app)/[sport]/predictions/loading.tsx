import { PageHeader } from "@/components/ui/page-header";
import { ChipRowSkeleton, PickSectionSkeleton, Skeleton } from "@/components/ui/skeleton";
import { containerClass } from "@/components/ui/container";

/**
 * The Picks page as it resolves: league row, filters, the top pick and the
 * list in rows (components/match/pick-row.tsx), so nothing jumps when it
 * lands. The first visit after the five-minute cache expires models the
 * whole fortnight, which is when this shows.
 */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Predictions" title="Picks" description="Data insights from analysed football matches." />
      <div className={`${containerClass()} space-y-7 py-7 sm:py-10`}>
        <ChipRowSkeleton />
        <div className="flex flex-wrap items-center justify-between gap-3" aria-hidden>
          <div className="flex gap-2">
            {["w-20", "w-20", "w-24", "w-20", "w-14"].map((w, i) => (
              <Skeleton key={i} className={`h-8 rounded-full ${w} ${i >= 3 ? "hidden sm:block" : ""}`} />
            ))}
          </div>
          <Skeleton className="h-8 w-44 rounded-lg" />
        </div>
        <div className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7" aria-hidden>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-2 w-full max-w-md rounded-full" />
          </div>
          <Skeleton className="h-32 w-full rounded-xl sm:w-56" />
        </div>
        <PickSectionSkeleton rows={6} />
        <PickSectionSkeleton rows={4} />
      </div>
    </>
  );
}
