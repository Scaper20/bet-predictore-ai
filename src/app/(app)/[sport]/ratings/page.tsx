import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { Crest } from "@/components/ui/crest";
import { LeagueTabs } from "@/components/stats/league-tabs";
import { RatingBar, RatingDial } from "@/components/stats/rating-dial";
import { leagueByCode } from "@/lib/leagues";
import { latestRatings, leagueTeams, type RatingPoint, type TeamRef } from "@/lib/stats/queries";
import { ratingBand, ratingColor, ratingScore } from "@/lib/stats/compute";
import { STAT_LEAGUES, pickLeague, ratingScope } from "@/lib/stats/leagues";
import { sportPath } from "@/lib/routes";

const NATIONAL = "national-teams";
const TABS = [...STAT_LEAGUES, { code: NATIONAL, label: "National teams", flag: "🌍" }];

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  const { league } = await searchParams;
  const code = pickLeague(league, TABS.map((t) => t.code));
  const name = code === NATIONAL ? "National team" : (leagueByCode(code)?.name ?? "");
  return {
    title: `${name} Ratings: Every Team Rated 1-10`,
    description: `How strong KiqStat rates every ${name} side, on a 1 to 10 scale built from results, with who is rising and falling.`,
    alternates: { canonical: `${sportPath("ratings")}?league=${code}` },
  };
}

export const revalidate = 1800;

interface Rated {
  key: string;
  name: string;
  crest?: string;
  score: number;
  change: number | null;
}

export default async function RatingsPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const { league } = await searchParams;
  const code = pickLeague(league, TABS.map((t) => t.code));
  const national = code === NATIONAL;
  const def = national ? undefined : leagueByCode(code);

  let rated: Rated[] = [];
  if (national) {
    const points = await latestRatings("international", 730).catch(() => [] as RatingPoint[]);
    rated = points.map(toRated).sort((a, b) => b.score - a.score).slice(0, 60);
  } else if (def) {
    const [teams, points] = await Promise.all([
      leagueTeams(def.code).catch(() => [] as TeamRef[]),
      latestRatings(ratingScope(def)).catch(() => [] as RatingPoint[]),
    ]);
    const byId = new Map(points.filter((p) => p.teamId).map((p) => [p.teamId!, p]));
    rated = teams
      .flatMap((t) => {
        const p = byId.get(t.id);
        return p ? [{ ...toRated(p), name: t.name, crest: t.crest ?? p.crest }] : [];
      })
      .sort((a, b) => b.score - a.score);
  }

  const movers = rated.filter((r) => r.change !== null && Math.abs(r.change) >= 0.2).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  const riser = movers[0];
  const faller = movers[movers.length - 1];

  return (
    <>
      <PageHeader
        eyebrow="Model ratings"
        title={national ? "National team ratings" : `${def?.name} ratings`}
        description="Every side rated 1 to 10."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-11" />}>
          <LeagueTabs leagues={TABS} active={code} />
        </Suspense>

        <Scale />

        {rated.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-muted">No ratings for this competition yet.</div>
        ) : (
          <>
            <div className="stagger grid gap-3 sm:grid-cols-3">
              {rated.slice(0, 3).map((r, i) => (
                <div
                  key={r.key}
                  style={{ ["--i" as string]: i }}
                  className={`card relative flex items-center gap-4 overflow-hidden p-5 ${i === 0 ? "orbit-border" : ""}`}
                >
                  <span className="absolute right-4 top-3 font-display text-5xl font-extrabold text-ink/[0.06]" aria-hidden>
                    {i + 1}
                  </span>
                  <RatingDial score={r.score} size={68} index={i} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Crest src={r.crest} name={r.name} size={22} />
                      <p className="min-w-0 truncate font-display text-lg font-bold">{r.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: ratingColor(r.score, 0.8) }}>{ratingBand(r.score)}</p>
                    <Change value={r.change} />
                  </div>
                </div>
              ))}
            </div>

            {(riser || faller) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {riser && (riser.change ?? 0) > 0 && <Mover label="Biggest climber" r={riser} />}
                {faller && faller !== riser && (faller.change ?? 0) < 0 && <Mover label="Biggest faller" r={faller} />}
              </div>
            )}

            <section className="card overflow-hidden">
              <ol className="stagger divide-y divide-line">
                {rated.map((r, i) => (
                  <li
                    key={r.key}
                    style={{ ["--i" as string]: i }}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,16rem)_minmax(0,1fr)_7rem_3.5rem] sm:px-5"
                  >
                    <span className="tnum text-xs font-semibold text-ink-dim">{i + 1}</span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Crest src={r.crest} name={r.name} size={24} />
                      <span className="min-w-0 truncate text-sm font-semibold">{r.name}</span>
                    </span>
                    <span className="hidden sm:block">
                      <RatingBar score={r.score} index={i} />
                    </span>
                    <span className="hidden text-right sm:block">
                      <span className="block text-xs" style={{ color: ratingColor(r.score, 0.8) }}>{ratingBand(r.score)}</span>
                      <Change value={r.change} />
                    </span>
                    <span className="flex justify-end">
                      <RatingDial score={r.score} size={40} index={i} />
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <p className="text-xs leading-relaxed text-ink-dim">
              {national
                ? "Every national team rated on the same scale, from internationals since 1990, friendlies included. Top 60 shown."
                : "Each league is rated against itself: a 7 here is strong for this league. Ratings move after every result; the arrows compare with a month ago."}
            </p>
          </>
        )}
      </div>
    </>
  );
}

function toRated(p: RatingPoint): Rated {
  const score = ratingScore(p.rating);
  return {
    key: p.teamId ?? p.teamName,
    name: p.teamName,
    crest: p.crest,
    score,
    change: p.previous !== null ? Math.round((score - ratingScore(p.previous)) * 10) / 10 : null,
  };
}

function Change({ value }: { value: number | null }) {
  if (value === null || Math.abs(value) < 0.1) return <span className="block text-[11px] text-ink-dim">steady</span>;
  const up = value > 0;
  return (
    <span className={`tnum block text-[11px] font-semibold ${up ? "text-brand" : "text-rose"}`}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)} this month
    </span>
  );
}

function Mover({ label, r }: { label: string; r: Rated }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <Crest src={r.crest} name={r.name} size={30} />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-dim">{label}</p>
        <p className="truncate font-semibold">{r.name}</p>
      </div>
      <Change value={r.change} />
    </div>
  );
}

/** The 1-10 scale itself: one gradient, the colours every dial uses. */
function Scale() {
  const stops = Array.from({ length: 10 }, (_, i) => ratingColor(i + 1)).join(", ");
  return (
    <div className="card p-4 sm:p-5">
      <div className="h-2.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <div className="mt-2 grid grid-cols-5 text-[11px] text-ink-dim">
        <span>1 · Struggling</span>
        <span className="text-center">Weak</span>
        <span className="text-center">Average</span>
        <span className="text-center">Strong</span>
        <span className="text-right">Elite · 10</span>
      </div>
    </div>
  );
}
