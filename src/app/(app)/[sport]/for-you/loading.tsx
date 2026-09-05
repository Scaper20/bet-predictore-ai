import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Skeleton, PickRowSkeleton, AccaCardSkeleton, RecordCardSkeleton } from "@/components/ui/skeleton";

/**
 * The one page in the app that genuinely needs this.
 *
 * For You is force-dynamic and fans out one provider call per followed
 * competition, then fits a model per competition on top — measured at ~3.7s
 * on a cold cache, against under 100ms for every other route. Without a
 * loading state that is four seconds of empty page immediately after sign-up,
 * on the page sign-up now lands on.
 *
 * The header is rendered for real rather than skeletonised: it is static copy,
 * so showing it straight away gives the page an anchor while the feed arrives.
 * The greeting is the generic one — the name is not known until the payload is.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        eyebrow="For You"
        title="Your feed"
        description="Picks from the competitions you follow, plus the strongest reads across the whole slate — each section labelled so you always know which is which."
      />

      <Container width="shell" className="space-y-10 pb-14 pt-7 sm:space-y-14 sm:pb-20 sm:pt-10">
        <section>
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="mt-4 h-4 w-full max-w-xl" />

          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <PickRowSkeleton key={i} />
              ))}
            </div>
            <AccaCardSkeleton />
          </div>
        </section>

        <section>
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="mt-4 h-4 w-full max-w-lg" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <RecordCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </Container>
    </>
  );
}
