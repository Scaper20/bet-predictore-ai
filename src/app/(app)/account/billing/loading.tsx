import { Skeleton } from "@/components/ui/skeleton";

/** Plans & billing as it resolves: the title, the cycle switch and the three plan cards. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-3.5 w-full max-w-lg" />
        <Skeleton className="h-3.5 w-3/4 max-w-md" />
      </div>
      <div className="mt-10 flex justify-center">
        <Skeleton className="h-10 w-72 rounded-lg" />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card flex flex-col p-5 sm:p-7">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-5 h-7 w-28" />
            <div className="mt-5 flex-1 space-y-2.5">
              {Array.from({ length: 5 }).map((_, l) => (
                <Skeleton key={l} className="h-3 w-full" />
              ))}
            </div>
            <Skeleton className="mt-6 h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
