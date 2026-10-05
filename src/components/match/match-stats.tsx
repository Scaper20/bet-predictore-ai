import Link from "next/link";
import type { Match } from "@/lib/types";
import type { GoalProfile, FormSummary, TeamResult } from "@/lib/stats/compute";
import { outcome, ratingBand } from "@/lib/stats/compute";
import { FormPips } from "@/components/stats/form-pips";
import { RatingDial } from "@/components/stats/rating-dial";
import { Crest } from "@/components/ui/crest";
import { matchPath, sportPath } from "@/lib/routes";
import { percent } from "@/lib/format";

export interface SideStats {
  results: TeamResult[];
  form: FormSummary;
  goals: GoalProfile;
  rating: number | null;
}

/**
 * Both clubs side by side, the way a scores app shows a match's stats: one
 * row per measure, the home club's bar growing left from the centre and the
 * away club's growing right, the larger value lit. All from each club's
 * last ten finished games (every competition), straight from the database.
 */
export function MatchStats({ match, home, away }: { match: Match; home: SideStats | null; away: SideStats | null }) {
  if (!home && !away) {
    return (
      <section className="card p-6 text-center text-sm text-ink-dim">
        No recent results for either club in the data yet.
      </section>
    );
  }
  const h = home ?? empty();
  const a = away ?? empty();

  const rows: { label: string; h: number; a: number; fmt: (v: number) => string; lowerIsBetter?: boolean }[] = [
    { label: "Points per game", h: h.form.ppg, a: a.form.ppg, fmt: (v) => v.toFixed(2) },
    { label: "Goals scored per game", h: h.goals.scored, a: a.goals.scored, fmt: (v) => v.toFixed(1) },
    { label: "Goals conceded per game", h: h.goals.conceded, a: a.goals.conceded, fmt: (v) => v.toFixed(1), lowerIsBetter: true },
    { label: "Over 2.5 goals", h: h.goals.over25, a: a.goals.over25, fmt: (v) => percent(v) },
    { label: "Both teams scored", h: h.goals.btts, a: a.goals.btts, fmt: (v) => percent(v) },
    { label: "Clean sheets", h: h.goals.cleanSheets, a: a.goals.cleanSheets, fmt: (v) => percent(v) },
    { label: "Failed to score", h: h.goals.failedToScore, a: a.goals.failedToScore, fmt: (v) => percent(v), lowerIsBetter: true },
  ];

  return (
    <div className="space-y-5">
      {(h.rating !== null || a.rating !== null) && (
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Model rating</h2>
            <Link href={`${sportPath("ratings")}?league=${match.league.code ?? ""}`} className="text-xs font-medium text-brand hover:underline">
              All ratings →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <RatingSide team={match.home} rating={h.rating} />
            <RatingSide team={match.away} rating={a.rating} align="right" />
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <TeamTag team={match.home} />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">Last {Math.max(h.form.played, a.form.played)} games</span>
          <TeamTag team={match.away} right />
        </div>
        <div className="space-y-4 px-5 py-5">
          {rows.map((r, i) => (
            <CompareRow key={r.label} {...r} index={i} />
          ))}
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">Recent results</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <ResultsList team={match.home} side={h} />
          <ResultsList team={match.away} side={a} />
        </div>
      </section>
    </div>
  );
}

function empty(): SideStats {
  return {
    results: [],
    rating: null,
    form: { played: 0, letters: [], won: 0, drawn: 0, lost: 0, points: 0, ppg: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, failedToScore: 0, trend: 0 },
    goals: { played: 0, over15: 0, over25: 0, over35: 0, btts: 0, cleanSheets: 0, failedToScore: 0, scored: 0, conceded: 0, totalGoals: 0 },
  };
}

function TeamTag({ team, right = false }: { team: Match["home"]; right?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Crest src={team.crest} name={team.name} size={20} />
      <span className="min-w-0 truncate text-sm font-semibold">{team.shortName || team.name}</span>
    </span>
  );
}

function RatingSide({ team, rating, align = "left" }: { team: Match["home"]; rating: number | null; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {rating !== null ? <RatingDial score={rating} size={56} /> : <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-xs text-ink-dim">—</span>}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{team.name}</p>
        <p className="text-xs text-ink-dim">{rating !== null ? ratingBand(rating) : "Not rated yet"}</p>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  h,
  a,
  fmt,
  lowerIsBetter,
  index,
}: {
  label: string;
  h: number;
  a: number;
  fmt: (v: number) => string;
  lowerIsBetter?: boolean;
  index: number;
}) {
  const max = Math.max(h, a, 1e-9);
  const hBetter = lowerIsBetter ? h < a : h > a;
  const aBetter = lowerIsBetter ? a < h : a > h;
  const delay = `${index * 70}ms`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className={`tnum w-12 font-bold ${hBetter ? "text-brand" : "text-ink"}`}>{fmt(h)}</span>
        <span className="min-w-0 truncate text-center text-xs text-ink-muted">{label}</span>
        <span className={`tnum w-12 text-right font-bold ${aBetter ? "text-brand" : "text-ink"}`}>{fmt(a)}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <span className="flex h-1.5 justify-end overflow-hidden rounded-full bg-surface-3">
          <span
            className={`seg-grow block h-full rounded-full ${hBetter ? "bg-brand" : "bg-ink-dim/50"}`}
            style={{ width: `${(h / max) * 100}%`, transformOrigin: "right", animationDelay: delay }}
          />
        </span>
        <span className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
          <span
            className={`seg-grow block h-full rounded-full ${aBetter ? "bg-brand" : "bg-ink-dim/50"}`}
            style={{ width: `${(a / max) * 100}%`, animationDelay: delay }}
          />
        </span>
      </div>
    </div>
  );
}

function ResultsList({ team, side }: { team: Match["home"]; side: SideStats }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Crest src={team.crest} name={team.name} size={20} />
          <span className="min-w-0 truncate text-sm font-semibold">{team.name}</span>
        </span>
        <FormPips letters={side.form.letters.slice(0, 5)} size="sm" />
      </div>
      {side.results.length === 0 ? (
        <p className="text-xs text-ink-dim">No recent results.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {side.results.slice(0, 6).map((r) => {
            const o = outcome(r);
            return (
              <li key={r.matchId}>
                <Link href={matchPath(r.publicId)} className="flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-2/60">
                  <span className="tnum w-12 shrink-0 text-ink-dim">
                    {new Date(r.kickoff).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </span>
                  <span className="w-4 shrink-0 text-center font-semibold text-ink-dim">{r.isHome ? "H" : "A"}</span>
                  <Crest src={r.opponentCrest} name={r.opponentName} size={16} />
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{r.opponentName}</span>
                  <span
                    className={`tnum shrink-0 rounded px-1.5 py-0.5 font-bold ${
                      o === "W" ? "bg-brand/15 text-brand" : o === "L" ? "bg-rose/15 text-rose" : "bg-surface-3 text-ink-muted"
                    }`}
                  >
                    {r.goalsFor}-{r.goalsAgainst}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
