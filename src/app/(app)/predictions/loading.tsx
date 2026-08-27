import { PageHeader } from "@/components/ui/page-header";
import { PredictionCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title="Today's predictions"
        description="Each fixture is modelled against its own competition's completed results. Where the history is too thin, no pick is published — that fixture is listed separately below."
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-10" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PredictionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
