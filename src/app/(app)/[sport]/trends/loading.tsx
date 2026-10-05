import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/** Trends reads the next three days and every club's last ten games; this holds the shape meanwhile. */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Trends" title="Streaks to know before kick-off" />
      <div className={`${containerClass()} space-y-7 py-7 sm:py-10`}>
        <section className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-4 p-4">
              <Skeleton className="h-9 w-14" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </section>
        <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="flex gap-4">
                <Skeleton className="size-16 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
              <Skeleton className="mt-5 h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
