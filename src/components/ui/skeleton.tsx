/** Base shimmer block. Sizing/shape comes entirely from the className passed in. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden />;
}

/** Placeholder matching MatchCard's geometry: league row, two team rows. */
export function MatchCardSkeleton() {
  return (
    <div className="card block p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-[18px] shrink-0 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="ml-auto h-3 w-16 shrink-0" />
      </div>
      <div className="mt-4 grid gap-2.5">
        <TeamRowSkeleton />
        <TeamRowSkeleton />
      </div>
    </div>
  );
}

/** Placeholder matching PredictionCard's geometry: league row, two team rows,
 * a 3-stat row, and the top-selection footer with its probability bar. */
export function PredictionCardSkeleton() {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center gap-2">
        <Skeleton className="size-[18px] shrink-0 rounded-full" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="ml-auto h-3 w-14 shrink-0" />
      </div>
      <div className="mt-4 space-y-2.5">
        <TeamRowSkeleton withScore />
        <TeamRowSkeleton withScore />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-2.5 h-4 w-36" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

function TeamRowSkeleton({ withScore = false }: { withScore?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-[26px] shrink-0 rounded-full" />
      <Skeleton className="h-4 flex-1" />
      {withScore && <Skeleton className="h-4 w-8 shrink-0" />}
    </div>
  );
}
