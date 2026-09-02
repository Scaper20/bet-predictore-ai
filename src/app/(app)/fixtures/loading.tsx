import { PageHeader } from "@/components/ui/page-header";
import { MatchCardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { containerClass } from "@/components/ui/container";

export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Fixtures" title="Upcoming fixtures" description="Kickoff times shown in West Africa Time." />
      <div className={`${containerClass()} space-y-6 py-10`}>
        <div className="h-10" />
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-4 w-32" />
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <MatchCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
