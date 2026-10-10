import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { LeagueFilter } from "@/components/match/league-filter";
import { FixtureRow } from "@/components/match/fixture-row";
import { LeagueGroupCard } from "@/components/match/league-group";
import { UrlTabs } from "@/components/motion/url-tabs";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { APP_TIMEZONE, appDayBounds } from "@/lib/format";
import { groupLiveMatches } from "@/lib/live-board";
import { leagueByCode } from "@/lib/leagues";
import { picksBetween, picksFor, playedBetween, type DayPick, type LoggedPick } from "@/lib/stats/queries";
import { sportPath } from "@/lib/routes";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  const { league } = await searchParams;
  const def = league ? leagueByCode(league) : undefined;
  const base = sportPath("results");
  return {
    title: def ? `${def.name} Results` : "Football Results",
    description: def
      ? `${def.name} results day by day, with how each KiqStat pick did.`
      : "Final scores from every competition KiqStat covers, day by day, with how each of our picks did.",
    alternates: { canonical: def ? `${base}?league=${def.code}` : base },
  };
}

export const revalidate = 120;

const DAYS_BACK = 7;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ league?: string; day?: string }> }) {
  const { league, day } = await searchParams;
  const def = league ? leagueByCode(league) : undefined;
  const now = new Date();
  const offset = clampOffset(day);
  const { start, end } = appDayBounds(now, -offset);

  const matches = await playedBetween(start, end, def?.code).catch(() => []);
  const [picks, dayPicks] = await Promise.all([
    picksFor(matches).catch(() => new Map<string, LoggedPick>()),
    picksBetween(start, end, def?.code),
  ]);
  // Picks on games this page does not list (competitions outside the stored
  // fixtures). They still count toward the day, and get their own card.
  const shownIds = new Set([...picks.values()].map((p) => p.matchId));
  const unlisted = dayPicks.filter((p) => !shownIds.has(p.matchId));
  const groups = groupLiveMatches(matches).map((g) => ({
    ...g,
    matches: [...g.matches].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
  }));

  const finished = matches.filter((m) => m.status === "finished");
  const goals = finished.reduce((n, m) => n + (m.score.home ?? 0) + (m.score.away ?? 0), 0);
  const graded = [...[...picks.values()], ...unlisted].filter((p) => p.result === "win" || p.result === "lose");
  const won = graded.filter((p) => p.result === "win").length;

  const qs = (o: number) => {
    const p = new URLSearchParams();
    if (def) p.set("league", def.code);
    if (o > 0) p.set("day", String(o));
    const s = p.toString();
    return s ? `${sportPath("results")}?${s}` : sportPath("results");
  };

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title={def ? `${def.name} results` : "Results"}
        description="Final scores and how our picks did."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter />
        </Suspense>

        <div className="card space-y-4 p-4 sm:p-5">
          <UrlTabs
            ariaLabel="Day"
            value={String(offset)}
            tabs={Array.from({ length: DAYS_BACK }, (_, o) => {
              const d = appDayBounds(now, -o).start;
              return {
                key: String(o),
                href: qs(o),
                label: (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-[13px] font-semibold">{o === 0 ? "Today" : o === 1 ? "Yesterday" : d.toLocaleDateString("en-NG", { weekday: "short", timeZone: APP_TIMEZONE })}</span>
                    <span className="text-[10px] font-normal text-ink-dim">{d.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: APP_TIMEZONE })}</span>
                  </span>
                ),
              };
            })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Games" value={finished.length} />
            <Tile label="Goals" value={goals} />
            <Tile label="Our picks" value={won} suffix={graded.length ? ` / ${graded.length}` : ""} hint={graded.length ? "landed" : "none graded"} />
          </div>
        </div>

        {groups.length === 0 && unlisted.length === 0 ? (
          <EmptyState
            icon="🏁"
            title="No results on this day"
            description={def ? `No ${def.shortName} games finished on this day.` : "No game in the competitions we cover finished on this day."}
            action={<ButtonLink href={sportPath("fixtures")} variant="secondary">See upcoming fixtures</ButtonLink>}
          />
        ) : groups.length === 0 ? null : (
          <div className="stagger gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
            {groups.map((g, gi) => (
              <div key={g.key} style={{ ["--i" as string]: gi }}>
                <LeagueGroupCard group={g}>
                  <ul className="divide-y divide-line">
                    {g.matches.map((m) => {
                      const pick = picks.get(m.id);
                      return (
                        <li key={m.id}>
                          <FixtureRow match={m} footer={pick ? <PickLine pick={pick} /> : undefined} />
                        </li>
                      );
                    })}
                  </ul>
                </LeagueGroupCard>
              </div>
            ))}
          </div>
        )}

        {unlisted.length > 0 && <OtherPicks picks={unlisted} />}
      </div>
    </>
  );
}

/** Our picks on games outside the competitions listed above. */
function OtherPicks({ picks }: { picks: DayPick[] }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold sm:px-5">More of our picks</h2>
      <ul className="divide-y divide-line">
        {picks.map((p) => (
          <li key={p.matchId} className="px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-ink">{p.home}</span>
                <span className="text-ink-dim"> v </span>
                <span className="font-semibold text-ink">{p.away}</span>
              </span>
              {p.score.home !== null && p.score.away !== null && (
                <span className="tnum shrink-0 font-bold">
                  {p.score.home}–{p.score.away}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-ink-dim">{p.league}</p>
            <PickLine pick={{ matchId: p.matchId, label: p.label, result: p.result }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function clampOffset(day: string | undefined): number {
  const n = Number(day ?? 0);
  return Number.isFinite(n) ? Math.min(DAYS_BACK - 1, Math.max(0, Math.round(n))) : 0;
}

function Tile({ label, value, suffix = "", hint }: { label: string; value: number; suffix?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">
        <AnimatedNumber value={value} />
        <span className="text-base text-ink-dim">{suffix}</span>
      </p>
      {hint && <p className="text-[10px] text-ink-dim">{hint}</p>}
    </div>
  );
}

function PickLine({ pick }: { pick: LoggedPick }) {
  const tone =
    pick.result === "win" ? "text-brand" : pick.result === "lose" ? "text-rose" : "text-ink-dim";
  const mark = pick.result === "win" ? "✓" : pick.result === "lose" ? "✗" : "…";
  return (
    <p className={`flex items-center gap-1.5 pt-0.5 text-[11px] ${tone}`}>
      <span className="font-bold">{mark}</span>
      <span className="truncate">Our pick: {pick.label}</span>
    </p>
  );
}
