import { PageHeader } from "@/components/ui/page-header";
import { PredictionCardSkeleton } from "@/components/ui/skeleton";
import { containerClass } from "@/components/ui/container";

export default function Loading() {
  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title="Today's predictions"
        description="Every game we can rate in the next few days."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <div className="h-10" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PredictionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
