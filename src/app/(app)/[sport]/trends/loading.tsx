import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { Skeleton, PredictionCardSkeleton } from "@/components/ui/skeleton";

/**
 * Trends fits a model across the upcoming slate before it can say anything —
 * ~0.9s on a cold cache, well past the point where a blank page reads as a
 * broken one.
 *
 * The header description is omitted rather than invented: it quotes real
 * fixture counts, and there is no honest placeholder for a number.
 */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Trends" title="What the slate looks like" />

      <div className={`${containerClass()} space-y-8 py-7 sm:py-10`}>
        <section className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-3 h-9 w-24" />
              <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
              <Skeleton className="mt-3 h-3 w-full max-w-[14rem]" />
            </div>
          ))}
        </section>

        <section>
          <Skeleton className="h-6 w-56 max-w-full" />
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <PredictionCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
