import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside the admin shell while any admin page's server queries run, so a nav click responds immediately. */
export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
