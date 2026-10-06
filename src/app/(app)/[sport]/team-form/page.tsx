import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { Crest } from "@/components/ui/crest";
import { LeagueTabs } from "@/components/stats/league-tabs";
import { FormPips } from "@/components/stats/form-pips";
import { UrlTabs } from "@/components/motion/url-tabs";
import { leagueByCode } from "@/lib/leagues";
import { leagueTeams, recentResults, type TeamRef } from "@/lib/stats/queries";
import { summariseForm, outcome, type FormSummary, type TeamResult } from "@/lib/stats/compute";
import { STAT_LEAGUES, pickLeague } from "@/lib/stats/leagues";
import { matchPath, sportPath } from "@/lib/routes";

type Venue = "all" | "home" | "away";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  const { league } = await searchParams;
  const def = leagueByCode(pickLeague(league));
  return {
    title: `${def?.name ?? "League"} Form Table`,
    description: `Every ${def?.name ?? ""} club's last ten games, home and away: results, points and who is improving.`,
    alternates: { canonical: `${sportPath("teamForm")}?league=${def?.code ?? ""}` },
  };
}

export const revalidate = 600;

export default async function TeamFormPage({ searchParams }: { searchParams: Promise<{ league?: string; venue?: string }> }) {
  const { league, venue: v } = await searchParams;
  const code = pickLeague(league);
  const def = leagueByCode(code)!;
  const venue: Venue = v === "home" || v === "away" ? v : "all";

  const teams = await leagueTeams(code).catch(() => [] as TeamRef[]);
  // Twenty games back, so ten home or ten away games are in range.
  const recent = await recentResults(teams.map((t) => t.id), 20, code).catch(() => new Map<string, TeamResult[]>());

  const rows = teams
    .map((t) => {
      const all = recent.get(t.id) ?? [];
      const games = (venue === "all" ? all : all.filter((r) => (venue === "home" ? r.isHome : !r.isHome))).slice(0, 10);
      return { team: t, games, form: summariseForm(games) };
    })
    .filter((r) => r.form.played > 0)
    .sort((a, b) => b.form.points - a.form.points || b.form.goalsFor - b.form.goalsAgainst - (a.form.goalsFor - a.form.goalsAgainst));

  const href = (vv: Venue) => `${sportPath("teamForm")}?league=${code}${vv === "all" ? "" : `&venue=${vv}`}`;
  // Call-outs only for clubs with enough games to mean it.
  const settled = rows.filter((r) => r.form.played >= 5);
  const byPpg = [...settled].sort((a, b) => b.form.ppg - a.form.ppg);
  const hottest = byPpg[0];
  const coldest = byPpg[byPpg.length - 1];
  const riser = [...settled].sort((a, b) => b.form.trend - a.form.trend)[0];

  return (
    <>
      <PageHeader
        eyebrow="Team form"
        title={`${def.name} form`}
        description="Last ten league games, newest first."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-11" />}>
          <LeagueTabs leagues={STAT_LEAGUES} active={code} />
        </Suspense>

        <div className="max-w-sm">
          <UrlTabs
            ariaLabel="Venue"
            value={venue}
            tabs={[
              { key: "all", label: "All games", href: href("all") },
              { key: "home", label: "Home", href: href("home") },
              { key: "away", label: "Away", href: href("away") },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-muted">No finished {def.shortName} games in our data yet.</div>
        ) : (
          <>
            <div className="stagger grid gap-3 sm:grid-cols-3">
              {hottest && <Spot i={0} tone="brand" title="In form" row={hottest} note={`${hottest.form.points} of ${hottest.form.played * 3} points`} />}
              {riser && riser.form.trend > 0 && <Spot i={1} tone="cyan" title="Improving" row={riser} note={`+${riser.form.trend.toFixed(1)} points a game lately`} />}
              {coldest && coldest !== hottest && <Spot i={2} tone="rose" title="Struggling" row={coldest} note={`${coldest.form.points} of ${coldest.form.played * 3} points`} />}
            </div>

            <section className="card overflow-hidden">
              <ul className="divide-y divide-line">
                {rows.map((r, i) => (
                  <li key={r.team.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_auto_auto] sm:px-5">
                    <span className="tnum text-xs font-semibold text-ink-dim">{i + 1}</span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Crest src={r.team.crest} name={r.team.name} size={24} />
                      <span className="min-w-0 truncate text-sm font-semibold">{r.team.name}</span>
                      <Trend value={r.form.trend} />
                    </span>
                    <span className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto">
                      <FormPips letters={r.form.letters} index={i} titles={r.games.map(tip)} />
                    </span>
                    <span className="tnum hidden text-xs text-ink-muted sm:block">
                      {r.form.won}-{r.form.drawn}-{r.form.lost} · {r.form.goalsFor}:{r.form.goalsAgainst}
                    </span>
                    <span className="text-right">
                      <span className="tnum block font-display text-lg font-bold leading-none">{r.form.points}</span>
                      <span className="text-[10px] text-ink-dim">pts</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function tip(r: TeamResult): string {
  return `${outcome(r)} ${r.goalsFor}-${r.goalsAgainst} ${r.isHome ? "v" : "at"} ${r.opponentName}`;
}

function Trend({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return null;
  const up = value > 0;
  return (
    <span className={`shrink-0 text-[11px] font-bold ${up ? "text-brand" : "text-rose"}`} title={up ? "Better lately" : "Worse lately"}>
      {up ? "↗" : "↘"}
    </span>
  );
}

function Spot({
  title,
  row,
  note,
  tone,
  i,
}: {
  title: string;
  row: { team: TeamRef; form: FormSummary; games: TeamResult[] };
  note: string;
  tone: "brand" | "cyan" | "rose";
  i: number;
}) {
  const ring = tone === "brand" ? "border-brand/30 bg-brand/[0.05]" : tone === "cyan" ? "border-cyan/30 bg-cyan/[0.05]" : "border-rose/30 bg-rose/[0.05]";
  const text = tone === "brand" ? "text-brand" : tone === "cyan" ? "text-cyan" : "text-rose";
  const last = row.games[0];
  return (
    <div style={{ ["--i" as string]: i }} className={`card border p-4 ${ring}`}>
      <p className={`text-[10.5px] font-semibold uppercase tracking-[0.14em] ${text}`}>{title}</p>
      <div className="mt-2 flex items-center gap-2.5">
        <Crest src={row.team.crest} name={row.team.name} size={28} />
        <span className="min-w-0 truncate font-display text-lg font-bold">{row.team.name}</span>
      </div>
      <div className="mt-3"><FormPips letters={row.form.letters.slice(0, 5)} size="sm" index={i} /></div>
      <p className="mt-2 text-xs text-ink-muted">{note}</p>
      {last && (
        <Link href={matchPath(last.publicId)} className="mt-1 block truncate text-[11px] text-ink-dim hover:text-ink">
          Last: {last.goalsFor}-{last.goalsAgainst} {last.isHome ? "v" : "at"} {last.opponentName}
        </Link>
      )}
    </div>
  );
}
