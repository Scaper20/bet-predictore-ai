import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { PickRowSkeleton, Skeleton, StatTilesSkeleton } from "@/components/ui/skeleton";

/** The record as it resolves: the headline win rates, the chart and the graded list. */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Track Record" title="Every published pick, graded" description="Every pick, logged before kickoff and graded after." />
      <div className={`${containerClass()} space-y-8 py-4 sm:py-10`}>
        <StatTilesSkeleton count={4} />
        <div className="card p-5 sm:p-6" aria-hidden>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-5 h-44 w-full rounded-xl" />
        </div>
        <div className="card overflow-hidden" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <PickRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
