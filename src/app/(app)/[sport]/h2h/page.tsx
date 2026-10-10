import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { Crest } from "@/components/ui/crest";
import { TeamPicker } from "@/components/stats/team-picker";
import { FormPips } from "@/components/stats/form-pips";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { isTeamId, meetings, recentResults, teamsById, type Meeting, type TeamRef } from "@/lib/stats/queries";
import { outcome } from "@/lib/stats/compute";
import { upcomingFeed } from "@/lib/service";
import { leagueByCode } from "@/lib/leagues";
import { percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { matchPath, sportPath } from "@/lib/routes";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }): Promise<Metadata> {
  const { a, b } = await searchParams;
  const teams = isTeamId(a) && isTeamId(b) ? await teamsById([a, b]).catch(() => []) : [];
  const ta = teams.find((t) => t.id === a);
  const tb = teams.find((t) => t.id === b);
  if (ta && tb) {
    return {
      title: `${ta.name} vs ${tb.name} Head to Head`,
      description: `Every ${ta.name} v ${tb.name} meeting: wins, draws, goals and recent results.`,
      alternates: { canonical: `${sportPath("h2h")}?a=${a}&b=${b}` },
    };
  }
  return {
    title: "Head to Head",
    description: "Pick any two clubs or national teams and see every meeting: wins, draws, goals and the last results.",
    alternates: { canonical: sportPath("h2h") },
  };
}

export const revalidate = 600;

export default async function H2HPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const ids = [a, b].filter(isTeamId);
  const teams = await teamsById(ids).catch(() => [] as TeamRef[]);
  const ta = teams.find((t) => t.id === a);
  const tb = teams.find((t) => t.id === b);

  return (
    <>
      <PageHeader
        eyebrow="Head-to-head"
        title={ta && tb ? `${ta.name} v ${tb.name}` : "Head-to-head"}
        description="Any two teams, every meeting."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <div className="card p-4 sm:p-5">
          <Suspense fallback={<div className="h-14" />}>
            <TeamPicker a={ta} b={tb} />
          </Suspense>
        </div>

        {ta && tb ? <Comparison a={ta} b={tb} /> : <Suggestions />}
      </div>
    </>
  );
}

async function Comparison({ a, b }: { a: TeamRef; b: TeamRef }) {
  const [games, recent] = await Promise.all([
    meetings(a.id, b.id).catch(() => [] as Meeting[]),
    recentResults([a.id, b.id], 5).catch(() => new Map()),
  ]);

  if (games.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-ink-muted">
          No meetings between <span className="font-semibold text-ink">{a.name}</span> and{" "}
          <span className="font-semibold text-ink">{b.name}</span> in our records.
        </p>
      </div>
    );
  }

  const winsA = games.filter((g) => (g.homeId === a.id ? g.homeGoals > g.awayGoals : g.awayGoals > g.homeGoals)).length;
  const winsB = games.filter((g) => (g.homeId === b.id ? g.homeGoals > g.awayGoals : g.awayGoals > g.homeGoals)).length;
  const draws = games.length - winsA - winsB;
  const goalsA = games.reduce((n, g) => n + (g.homeId === a.id ? g.homeGoals : g.awayGoals), 0);
  const goalsB = games.reduce((n, g) => n + (g.homeId === b.id ? g.homeGoals : g.awayGoals), 0);
  const over25 = games.filter((g) => g.homeGoals + g.awayGoals > 2.5).length / games.length;
  const btts = games.filter((g) => g.homeGoals > 0 && g.awayGoals > 0).length / games.length;
  const n = games.length;

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-6 sm:px-8">
          <Side team={a} />
          <div className="text-center">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-dim">{n} meetings</p>
            <p className="mt-1 font-display text-4xl font-extrabold sm:text-5xl">
              <AnimatedNumber value={winsA} className="text-brand" />
              <span className="mx-2 text-ink-dim">–</span>
              <AnimatedNumber value={winsB} className="text-cyan" />
            </p>
            <p className="text-xs text-ink-muted">{draws} {draws === 1 ? "draw" : "draws"}</p>
          </div>
          <Side team={b} />
        </div>
        <div className="px-4 pb-6 sm:px-8">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
            <span className="seg-grow block rounded-l-full bg-brand" style={{ width: `${(winsA / n) * 100}%` }} />
            <span className="seg-grow block bg-ink-dim/35" style={{ width: `${(draws / n) * 100}%`, animationDelay: "120ms" }} />
            <span className="seg-grow block rounded-r-full bg-cyan" style={{ width: `${(winsB / n) * 100}%`, animationDelay: "240ms" }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
            <span className="tnum">{percent(winsA / n)} {a.name}</span>
            <span className="tnum">{percent(winsB / n)} {b.name}</span>
          </div>
        </div>
        <div className="stagger grid grid-cols-2 border-t border-line sm:grid-cols-4">
          <Stat i={0} label={`${a.name} goals`} value={goalsA} />
          <Stat i={1} label={`${b.name} goals`} value={goalsB} />
          <Stat i={2} label="Over 2.5" value={Math.round(over25 * 100)} suffix="%" />
          <Stat i={3} label="Both scored" value={Math.round(btts * 100)} suffix="%" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold uppercase tracking-wider text-ink-muted">Every meeting</h2>
          <ul className="stagger divide-y divide-line">
            {games.map((g, i) => (
              <li key={g.publicId} style={{ ["--i" as string]: i }}>
                <MeetingRow g={g} a={a} />
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">Current form</h2>
          <div className="space-y-4">
            {[a, b].map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Crest src={t.crest} name={t.name} size={24} />
                  <span className="min-w-0 truncate text-sm font-semibold">{t.name}</span>
                </span>
                <FormPips letters={(recent.get(t.id) ?? []).map(outcome)} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Side({ team }: { team: TeamRef }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Crest src={team.crest} name={team.name} size={56} />
      <p className="min-w-0 wrap-break-word font-display text-base font-bold leading-tight sm:text-xl">{team.name}</p>
    </div>
  );
}

function Stat({ label, value, suffix = "", i }: { label: string; value: number; suffix?: string; i: number }) {
  return (
    <div style={{ ["--i" as string]: i }} className="border-line px-4 py-4 text-center odd:border-r sm:border-r sm:last:border-r-0">
      <p className="font-display text-2xl font-bold"><AnimatedNumber value={value} suffix={suffix} /></p>
      <p className="mt-0.5 truncate text-[11px] text-ink-dim">{label}</p>
    </div>
  );
}

function MeetingRow({ g, a }: { g: Meeting; a: TeamRef }) {
  const aWon = g.homeId === a.id ? g.homeGoals > g.awayGoals : g.awayGoals > g.homeGoals;
  const draw = g.homeGoals === g.awayGoals;
  return (
    <Link href={matchPath(g.publicId)} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-surface-2/60">
      <span className="text-xs text-ink-dim">
        <span className="tnum block">{new Date(g.kickoff).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "2-digit" })}</span>
        <span className="block truncate">{leagueByCode(g.leagueCode)?.shortName ?? g.leagueCode}</span>
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className={`block truncate ${g.homeGoals > g.awayGoals ? "font-semibold text-ink" : "text-ink-muted"}`}>{g.homeName}</span>
        <span className={`block truncate ${g.awayGoals > g.homeGoals ? "font-semibold text-ink" : "text-ink-muted"}`}>{g.awayName}</span>
      </span>
      <span className="flex items-center gap-2.5">
        <span className="tnum space-y-0.5 text-right font-bold">
          <span className="block">{g.homeGoals}</span>
          <span className="block">{g.awayGoals}</span>
        </span>
        <span
          className={`h-8 w-1 rounded-full ${draw ? "bg-ink-dim/40" : aWon ? "bg-brand" : "bg-cyan"}`}
          aria-label={draw ? "Draw" : aWon ? `${a.name} won` : `${a.name} lost`}
        />
      </span>
    </Link>
  );
}

/** With nothing picked: this week's biggest games, one tap to compare. */
async function Suggestions() {
  const feed = await upcomingFeed(7).catch(() => null);
  const games = (feed?.matches ?? [])
    .filter((m) => m.league.code && isTeamId(m.home.id) && isTeamId(m.away.id) && !leagueByCode(m.league.code)?.confederation)
    .sort((x, y) => (leagueByCode(x.league.code!)?.rank ?? 99) - (leagueByCode(y.league.code!)?.rank ?? 99) || Date.parse(x.kickoff) - Date.parse(y.kickoff))
    .slice(0, 9);
  if (games.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">Coming up this week</h2>
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((m, i) => (
          <Link
            key={m.id}
            href={`${sportPath("h2h")}?a=${m.home.id}&b=${m.away.id}`}
            style={{ ["--i" as string]: i }}
            className="card card-hover flex items-center gap-3 p-4"
          >
            <span className="flex -space-x-2">
              <Crest src={m.home.crest} name={m.home.name} size={30} />
              <Crest src={m.away.crest} name={m.away.name} size={30} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{m.home.name} v {m.away.name}</span>
              <span className="block truncate text-xs text-ink-dim">{leagueByCode(m.league.code!)?.shortName} · <LocalTime iso={m.kickoff} kind="relative" /> <LocalTime iso={m.kickoff} /></span>
            </span>
            <span className="text-xs font-semibold text-brand">Compare</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
