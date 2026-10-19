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

/* ------------------------------------------------- shared page placeholders */

/** A row of filter chips: the league filter and the like. */
export function ChipRowSkeleton({ count = 5, first = "w-28" }: { count?: number; first?: string }) {
  return (
    <div className="flex items-center gap-2 overflow-hidden" aria-hidden>
      <Skeleton className={`h-[42px] shrink-0 rounded-full ${first}`} />
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-[42px] w-24 shrink-0 rounded-full ${i >= 1 ? (i >= 3 ? "hidden lg:block" : "hidden sm:block") : ""}`}
        />
      ))}
      <Skeleton className="h-[42px] w-28 shrink-0 rounded-full" />
    </div>
  );
}

/**
 * One Picks-page row, laid out by the same .pr grid as the real row
 * (globals.css), so the list does not shift when the picks arrive.
 */
export function PickRowSkeleton() {
  return (
    <div className="pr" aria-hidden>
      <Skeleton className="[grid-area:time] h-4 w-10 md:h-3.5" />
      <div className="[grid-area:teams] flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
        <span className="flex items-center gap-2">
          <Skeleton className="size-[18px] shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-28" />
        </span>
        <span className="flex items-center gap-2">
          <Skeleton className="size-[18px] shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </span>
      </div>
      <div className="[grid-area:pick] flex items-center gap-2 pt-1 md:pt-0">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-5 w-12 rounded-full md:hidden" />
      </div>
      <div className="[grid-area:chance] flex items-center justify-end gap-2.5 md:justify-start">
        <Skeleton className="hidden h-1.5 flex-1 rounded-full md:block" />
        <Skeleton className="h-5 w-10" />
      </div>
      <Skeleton className="hidden h-5 w-16 rounded-full [grid-area:risk] md:block" />
      <div className="[grid-area:act] flex items-end justify-end md:items-center">
        <Skeleton className="h-7 w-[4.5rem] rounded-full" />
      </div>
    </div>
  );
}

/** A day heading and a card of pick rows. */
export function PickSectionSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <section aria-hidden>
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-8 rounded-full" />
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <PickRowSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

/** A standings-style table: a header strip and rows of crest, name and numbers. */
export function TableSkeleton({ rows = 10, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <Skeleton className="size-7 rounded-[22%]" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 sm:px-5">
          <Skeleton className="h-3.5 w-4" />
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3.5 w-32 sm:w-44" />
          <span className="ml-auto flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3.5 w-6 ${c >= 2 ? "hidden sm:block" : ""}`} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tiles of a headline number and a caption. */
export function StatTilesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid gap-3 ${count === 4 ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 sm:p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
