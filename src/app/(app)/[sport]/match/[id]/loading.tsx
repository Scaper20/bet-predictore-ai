import { Skeleton } from "@/components/ui/skeleton";
import { containerClass } from "@/components/ui/container";

/**
 * The match page as it resolves: the scoreboard header (league line, two
 * crests either side of the score or kick-off, the model's read bar), the
 * tab bar and the Overview tab's columns, in the page's own sizes.
 */
export default function Loading() {
  return (
    <>
      <header className="border-b border-line bg-shell" aria-hidden>
        <div className={`${containerClass()} py-5 sm:py-8`}>
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-[18px] rounded-full" />
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="ml-auto h-6 w-20 rounded-full" />
            </div>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:mt-7 sm:gap-8">
              <TeamBlock />
              <div className="flex flex-col items-center gap-2 pt-2.5 sm:pt-0">
                <Skeleton className="h-8 w-20 sm:h-11 sm:w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <TeamBlock />
            </div>
            <div className="mx-auto mt-6 max-w-xl sm:mt-8">
              <div className="mb-2 flex justify-between">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-28" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="mt-2 flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className={`${containerClass()} pb-10 sm:pb-14`} aria-hidden>
        <div className="mx-auto max-w-5xl">
          <div className="flex gap-6 border-b border-line py-3.5">
            {["w-16", "w-20", "w-12", "w-12", "w-24"].map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w} ${i === 4 ? "hidden sm:block" : ""}`} />
            ))}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              <div className="card p-5 sm:p-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-56 max-w-full" />
                <div className="mt-4 flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface px-3 py-3">
                    <Skeleton className="mx-auto h-2.5 w-10" />
                    <Skeleton className="mx-auto mt-2 h-5 w-14" />
                  </div>
                ))}
              </div>
              {[3, 2].map((rows, i) => (
                <div key={i} className="card p-5 sm:p-6">
                  <Skeleton className="h-3 w-28" />
                  <div className="mt-4 space-y-3">
                    {Array.from({ length: rows }).map((_, r) => (
                      <Skeleton key={r} className="h-4 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <aside className="space-y-5">
              <div className="card p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-11 w-full rounded-xl" />
              </div>
              <div className="card p-5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

function TeamBlock() {
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3">
      <Skeleton className="size-14 rounded-full" />
      <Skeleton className="h-4 w-24 sm:h-6 sm:w-36" />
    </div>
  );
}
