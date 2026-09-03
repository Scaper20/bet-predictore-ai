import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { supabasePublic } from "@/lib/supabase/public";
import { containerClass } from "@/components/ui/container";
import { TrackRecordInteractive } from "@/components/track-record/track-record-interactive";
import {
  ScalableModelPerformance,
  type ModelPerformanceRow,
} from "@/components/track-record/scalable-model-performance";
import type { TrackRecordMatch } from "@/components/track-record/record-detail-modal";
import { settledRecords } from "@/lib/performance-store";
import { EMPTY_RECORD, isPublishable } from "@/lib/performance";
import { allModels } from "@/lib/model/registry";
import { isSportId, type SportId } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Track Record",
  description:
    "Every headline pick BetriX has published, graded against the final score once the match " +
    "finishes. No cherry-picking — settled automatically, win or lose.",
};

/**
 * Public and cookie-free — every read goes through supabasePublic(), which
 * exists precisely so a trust page does not have to opt out of caching. Five
 * minutes is well inside the settlement cron's cadence.
 */
export const revalidate = 300;

async function loadTrackRecord(sport: SportId) {
  const supabase = supabasePublic();
  if (!supabase) return null;

  const [{ data: rows }, breakdown] = await Promise.all([
    supabase
      .from("predictions_log")
      .select("*")
      .eq("sport", sport)
      .not("settled_at", "is", null)
      .order("kickoff", { ascending: false })
      .limit(50),
    settledRecords({ sport }),
  ]);

  return { rows: (rows ?? []) as TrackRecordMatch[], breakdown };
}

/** Real per-model performance, with the roadmap entries carrying no numbers. */
function modelRows(breakdown: Awaited<ReturnType<typeof settledRecords>>): ModelPerformanceRow[] {
  return allModels().map((model) => {
    const record = breakdown.byModel.get(model.id) ?? EMPTY_RECORD;

    // Market and league breakdowns are only meaningful for a model that has
    // actually published. Attributing the shared aggregates to a model with no
    // rows would recreate exactly the fiction this replaced.
    if (model.status !== "live" || !isPublishable(record)) {
      return { model, record, topLeague: null, markets: [] };
    }

    const markets = [...breakdown.byMarket.entries()]
      .filter(([family, r]) => model.pickTypes.includes(family) && isPublishable(r))
      .map(([family, r]) => ({ family, record: r }))
      .sort((a, b) => b.record.sample - a.record.sample);

    const best = [...breakdown.byLeague.entries()]
      .filter(([, r]) => isPublishable(r))
      .sort((a, b) => (b[1].winRate ?? 0) - (a[1].winRate ?? 0))[0];

    return {
      model,
      record,
      topLeague: best
        ? { name: best[0], winRate: best[1].winRate ?? 0, sample: best[1].sample }
        : null,
      markets,
    };
  });
}

export default async function TrackRecordPage({ params }: PageProps<"/[sport]/track-record">) {
  const { sport } = await params;
  if (!isSportId(sport)) notFound();

  const record = await loadTrackRecord(sport);

  if (!record) {
    return (
      <>
        <PageHeader eyebrow="Track Record" title="Every published pick, graded" />
        <div className={`${containerClass()} py-10`}>
          <EmptyState
            icon="○"
            title="Not available yet"
            description="The Track Record page needs Supabase configured to store settlement history. Check back soon."
          />
        </div>
      </>
    );
  }

  const { rows, breakdown } = record;

  if (rows.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Track Record" title="Every published pick, graded" />
        <div className={`${containerClass()} space-y-10 py-10`}>
          <EmptyState
            icon="○"
            title="No settled picks yet"
            description="Every headline pick shown across the site is logged automatically and graded once its match finishes. The first results will land here within a day or two."
          />
          <ScalableModelPerformance rows={modelRows(breakdown)} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Track Record"
        title="Every published pick, graded"
        description="The single headline pick shown for each fixture, logged before kickoff and graded automatically against the final score. Nothing here is curated after the fact."
      />

      <div className={`${containerClass()} space-y-10 py-10`}>
        {/*
         * No separate overall-stats strip here. It used to duplicate the
         * live model's own card in ScalableModelPerformance below — the same
         * win rate, record and graded count, rendered twice on one page.
         * With one model that is pure repetition; once a second model is
         * live, "overall" stops being a single meaningful number anyway.
         */}
        <ScalableModelPerformance rows={modelRows(breakdown)} />

        <TrackRecordInteractive rows={rows} />
      </div>
    </>
  );
}
