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

/**
 * Placeholder matching the For You pick row: meta line, fixture title, the
 * four-stat strip, and the two actions.
 *
 * That page is the slowest in the app — it fans out one provider call per
 * followed competition and then fits a model per competition, measured at
 * ~3.7s cold — so this is the difference between a blank screen and a page
 * that is visibly arriving.
 */
export function PickRowSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 shrink-0 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mt-3 h-5 w-3/4 max-w-[16rem]" />
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
      {!compact && <Skeleton className="mt-4 h-3 w-56 max-w-full" />}
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
    </div>
  );
}

/** Placeholder matching the For You accumulator card. */
export function AccaCardSkeleton() {
  return (
    <div className="card p-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-52 max-w-full" />
      <div className="my-4 space-y-4 border-y border-line py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-12 shrink-0 rounded" />
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-7 w-20" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-full rounded-lg" />
    </div>
  );
}

/** Placeholder matching a settled-record card in the For You league strip. */
export function RecordCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40 max-w-[60%]" />
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-7 w-16" />
        </div>
        <Skeleton className="h-3 w-16" />
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
