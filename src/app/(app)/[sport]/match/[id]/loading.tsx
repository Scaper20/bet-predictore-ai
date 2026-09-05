import { Skeleton } from "@/components/ui/skeleton";
import { containerClass } from "@/components/ui/container";

export default function Loading() {
  return (
    <>
      {/* ------------------------------------------------------ Match header */}
      <div className="border-b border-line bg-shell">
        <div className={`${containerClass()} py-7 sm:py-10`}>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Skeleton className="size-[22px] shrink-0 rounded-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="ml-auto h-5 w-24 shrink-0 rounded-full" />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-10 w-20" />
            <div className="flex flex-col items-start gap-2">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- Body */}
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            <PanelSkeleton lines={4} />
            <PanelSkeleton lines={3} />
            <PanelSkeleton lines={3} />
          </div>
          <aside className="space-y-5">
            <PanelSkeleton lines={4} />
            <PanelSkeleton lines={2} />
          </aside>
        </div>
      </div>
    </>
  );
}

function PanelSkeleton({ lines }: { lines: number }) {
  return (
    <div className="card p-5 sm:p-7">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
