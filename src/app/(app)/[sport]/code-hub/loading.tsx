import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/** Today's code cards as they resolve: odds header, the legs, the code box. */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Code Hub" title="Today's codes" />
      <Container className="py-4 sm:py-10">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[4, 5, 6].map((legs, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3.5 w-40" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
              <div className="space-y-3 px-5 py-4">
                {Array.from({ length: legs }).map((_, l) => (
                  <div key={l} className="flex items-center gap-3">
                    <Skeleton className="size-2 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                    <Skeleton className="h-3.5 w-9" />
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5">
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}
