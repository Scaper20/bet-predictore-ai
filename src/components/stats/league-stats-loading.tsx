import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { ChipRowSkeleton, StatTilesSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Shared loading state for the one-competition stats pages (tables, form,
 * goals, ratings): their header, the league chips and a table of clubs.
 * The title is the page's own wording with the league left out, since the
 * league isn't known until the page resolves.
 */
export function LeagueStatsLoading({
  eyebrow,
  title,
  description,
  tiles = 0,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tiles?: number;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <ChipRowSkeleton count={4} first="w-24" />
        {tiles > 0 && <StatTilesSkeleton count={tiles} />}
        <TableSkeleton rows={12} />
      </div>
    </>
  );
}
