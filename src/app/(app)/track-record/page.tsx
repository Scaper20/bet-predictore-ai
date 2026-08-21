import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, EmptyState, ProbabilityBar } from "@/components/ui/primitives";
import { supabasePublic } from "@/lib/supabase/public";
import { kickoffDay, percent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Track Record",
  description:
    "Every headline pick BetriX has published, graded against the final score once the match " +
    "finishes. No cherry-picking — settled automatically, win or lose.",
};

// Settlement runs once a day (see vercel.json); this can sit well behind
// that without ever showing stale-looking data.
export const revalidate = 900;

interface PredictionLogRow {
  id: string;
  match_id: string;
  league: string;
  home_name: string;
  away_name: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  fair_odds: number;
  result: "win" | "lose" | "push" | null;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  settled_at: string | null;
}

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
  const graded = winCount + loseCount; // pushes are excluded from win rate, same convention as bookmakers.

  return {
    rows: (rows ?? []) as PredictionLogRow[],
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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">Win rate</p>
            <p className="tnum mt-2 font-display text-3xl font-extrabold">
              {record.winRate !== null ? percent(record.winRate) : "—"}
            </p>
            <div className="mt-4">
              <ProbabilityBar value={record.winRate ?? 0} tone="brand" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
              Pushes excluded from the rate, same convention as a bookmaker settling a void bet.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">Record</p>
            <p className="tnum mt-2 font-display text-3xl font-extrabold">
              {record.winCount}–{record.loseCount}
              {record.pushCount > 0 && <span className="text-ink-muted">–{record.pushCount}</span>}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
              Win–Lose{record.pushCount > 0 ? "–Push" : ""}, across every settled fixture.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">Settled picks</p>
            <p className="tnum mt-2 font-display text-3xl font-extrabold">
              {record.winCount + record.loseCount + record.pushCount}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
              Showing the {record.rows.length} most recent below.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          {record.rows.map((row) => (
            <TrackRecordRow key={row.id} row={row} />
          ))}
        </section>
      </div>
    </>
  );
}

function TrackRecordRow({ row }: { row: PredictionLogRow }) {
  const tone = row.result === "win" ? "brand" : row.result === "lose" ? "rose" : "neutral";
  return (
    <div className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
          <span className="font-medium text-ink-muted">{row.league}</span>
          <span>·</span>
          <span>{kickoffDay(row.kickoff)}</span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-ink">
          {row.home_name} <span className="text-ink-dim">vs</span> {row.away_name}
          {row.actual_home_goals !== null && row.actual_away_goals !== null && (
            <span className="tnum ml-2 text-ink-muted">
              ({row.actual_home_goals}-{row.actual_away_goals})
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Pick: <span className="font-medium text-ink">{row.label}</span>{" "}
          <span className="tnum">({percent(row.probability, 1)})</span>
        </p>
      </div>
      <Badge tone={tone}>{row.result?.toUpperCase() ?? "PENDING"}</Badge>
    </div>
  );
}
