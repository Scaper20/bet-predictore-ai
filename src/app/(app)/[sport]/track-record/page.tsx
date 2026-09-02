import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ProbabilityBar } from "@/components/ui/primitives";
import { supabasePublic } from "@/lib/supabase/public";
import { percent } from "@/lib/format";
import { containerClass } from "@/components/ui/container";
import { TrackRecordInteractive } from "@/components/track-record/track-record-interactive";
import type { TrackRecordMatch } from "@/components/track-record/record-detail-modal";

export const metadata: Metadata = {
  title: "Track Record",
  description:
    "Every headline pick BetriX has published, graded against the final score once the match " +
    "finishes. No cherry-picking — settled automatically, win or lose.",
};

export const dynamic = "force-dynamic";

async function loadTrackRecord() {
  const supabase = supabasePublic();
  if (!supabase) return null;

  const [{ data: rows }, wins, losses, pushes] = await Promise.all([
    supabase
      .from("predictions_log")
      .select("*")
      .not("settled_at", "is", null)
      .order("kickoff", { ascending: false })
      .limit(50),
    supabase.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "win"),
    supabase.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "lose"),
    supabase.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "push"),
  ]);

  const winCount = wins.count ?? 0;
  const loseCount = losses.count ?? 0;
  const pushCount = pushes.count ?? 0;
  const graded = winCount + loseCount;

  return {
    rows: (rows ?? []) as TrackRecordMatch[],
    winCount,
    loseCount,
    pushCount,
    winRate: graded > 0 ? winCount / graded : null,
  };
}

export default async function TrackRecordPage() {
  const record = await loadTrackRecord();

  if (!record) {
    return (
      <>
        <PageHeader eyebrow="Track Record" title="Every published pick, graded" />
        <div className={`${containerClass()} py-10`}>
          <EmptyState
            icon="📊"
            title="Not available yet"
            description="The Track Record page needs Supabase configured to store settlement history. Check back soon."
          />
        </div>
      </>
    );
  }

  if (record.rows.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Track Record" title="Every published pick, graded" />
        <div className={`${containerClass()} py-10`}>
          <EmptyState
            icon="📊"
            title="No settled picks yet"
            description="Every headline pick shown across the site is logged automatically and graded once its match finishes. The first results will land here within a day or two."
          />
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
        {/* KPI Stats Overview */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Win rate</p>
            <p className="tnum mt-2 font-display text-3xl font-extrabold">
              {record.winRate !== null ? percent(record.winRate) : "—"}
            </p>
            <div className="mt-4">
              <ProbabilityBar value={record.winRate ?? 0} tone="brand" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Pushes excluded from the rate, standard convention for settling void results.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Record</p>
            <p className="tnum mt-2 font-display text-3xl font-extrabold">
              {record.winCount}–{record.loseCount}
              {record.pushCount > 0 && <span className="text-ink-muted">–{record.pushCount}</span>}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Win–Lose{record.pushCount > 0 ? "–Push" : ""}, across every settled fixture.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Settled picks</p>
            <p className="tnum mt-2 font-display text-3xl font-extrabold">
              {record.winCount + record.loseCount + record.pushCount}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Logged automatically before kickoff.
            </p>
          </div>
        </section>

        {/* Interactive Track Record Container */}
        <TrackRecordInteractive rows={record.rows} />
      </div>
    </>
  );
}
