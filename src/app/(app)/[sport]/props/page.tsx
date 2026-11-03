import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { LocalTime } from "@/components/ui/local-time";
import { PropCard, PropsEmpty, PropsUpsell, PROPS_NOTE } from "@/components/props/prop-card";
import { getEntitlement } from "@/lib/entitlements";
import { isPaidTier } from "@/lib/access";
import { LEAGUES, leagueByCode } from "@/lib/leagues";
import { PROP_MARKETS, PROP_SPECS, type PropMarketKey } from "@/lib/model/player-props";
import { propRecord, propsBoardRows, propsLive } from "@/lib/props-board";
import { viewProps, type PropRow } from "@/lib/props-view";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Player props: shots, goals, tackles and more",
  description:
    "Player prop projections for the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 and Europe: how often each starter clears each line, and our pick on SportyBet's lines.",
  alternates: { canonical: sportPath("props") },
};

const PER_PAGE = 60;
const FOTMOB = new Set(LEAGUES.filter((l) => l.ids.fotMob).map((l) => l.code));

type View = PropMarketKey | "picks";

function href(view: View, league: string | null): string {
  const p = new URLSearchParams();
  if (view !== "picks") p.set("market", view);
  if (league) p.set("league", league);
  const qs = p.toString();
  return qs ? `${sportPath("props")}?${qs}` : sportPath("props");
}

function Chip({ on, to, children }: { on: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
        on ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

/** Games still to kick off (the board's rows include the last two hours, for the match pages). */
function notStarted(rows: PropRow[]): PropRow[] {
  const now = Date.now();
  return rows.filter((r) => Date.parse(r.kickoff) > now);
}

/** Rows grouped by game, games in kickoff order. */
function byGame(rows: PropRow[]): { key: string; rows: PropRow[] }[] {
  const map = new Map<string, PropRow[]>();
  for (const r of rows) {
    const list = map.get(r.matchId);
    if (list) list.push(r); else map.set(r.matchId, [r]);
  }
  return [...map.entries()].map(([key, rs]) => ({ key, rows: rs })).sort((a, b) => a.rows[0].kickoff.localeCompare(b.rows[0].kickoff));
}

/**
 * The player-props board. Projections for every likely starter in the next
 * 36 hours, the published picks first; facts for everyone, projections,
 * chances and picks for Pro (redacted on the server).
 */
export default async function PropsPage({ searchParams }: { searchParams: Promise<{ market?: string; league?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.market && (PROP_MARKETS as string[]).includes(sp.market) ? (sp.market as PropMarketKey) : "picks";
  const league = sp.league && FOTMOB.has(sp.league) ? sp.league : null;

  const [entitlement, all, live, record] = await Promise.all([
    getEntitlement(),
    propsBoardRows().catch(() => [] as PropRow[]),
    propsLive(),
    propRecord().catch(() => []),
  ]);
  const paid = isPaidTier(entitlement.tier);
  const upcoming = notStarted(all).filter((r) => !league || r.leagueCode === league);
  const leagues = [...new Set(all.map((r) => r.leagueCode))].filter((c) => FOTMOB.has(c));

  const picks = upcoming.filter((r) => r.hasPick);
  const chosen = view === "picks" ? picks : upcoming.filter((r) => r.market === view);
  const sorted = chosen
    .slice()
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || (b.pick?.probability ?? 0) - (a.pick?.probability ?? 0) || (b.mean ?? 0) - (a.mean ?? 0))
    .slice(0, PER_PAGE);
  const rows = viewProps(sorted, paid);
  const graded = record.reduce((s, r) => s + r.picks, 0);
  const won = record.reduce((s, r) => s + r.won, 0);

  return (
    <>
      <PageHeader
        eyebrow="New · Player props"
        title="Player props"
        description="Shots, goals, tackles and more for every likely starter, with our pick on the lines SportyBet lists."
      />
      <Container className="space-y-5 py-5 sm:py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">Starters projected</p>
            <p className="mt-1 font-mono text-2xl font-bold tnum">{new Set(upcoming.map((r) => r.playerId)).size}</p>
            <p className="text-xs text-ink-dim">next 36 hours, {new Set(upcoming.map((r) => r.matchId)).size} games</p>
          </div>
          <div className="card p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">Picks</p>
            <p className="mt-1 font-mono text-2xl font-bold tnum">{live ? picks.length : "Trial run"}</p>
            <p className="text-xs text-ink-dim">{live ? "logged once lineups are confirmed" : "graded privately until the record proves out"}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">Record</p>
            <p className="mt-1 font-mono text-2xl font-bold tnum">{graded >= 30 ? `${Math.round((won / graded) * 100)}%` : "–"}</p>
            <p className="text-xs text-ink-dim">{graded >= 30 ? `${won} of ${graded} published picks landed` : "shows once 30 picks are graded"}</p>
          </div>
        </div>

        {!paid && <PropsUpsell />}

        <div className="space-y-2">
          <nav aria-label="Prop markets" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Chip on={view === "picks"} to={href("picks", league)}>Picks</Chip>
            {PROP_MARKETS.map((m) => (
              <Chip key={m} on={view === m} to={href(m, league)}>{PROP_SPECS[m].label}</Chip>
            ))}
          </nav>
          {leagues.length > 1 && (
            <nav aria-label="Competitions" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip on={!league} to={href(view, null)}>All</Chip>
              {leagues.map((c) => (
                <Chip key={c} on={league === c} to={href(view, c)}>{leagueByCode(c)?.shortName ?? c}</Chip>
              ))}
            </nav>
          )}
        </div>

        {rows.length === 0 ? (
          <PropsEmpty
            text={
              view === "picks"
                ? live
                  ? "No picks yet. They are logged about an hour before kickoff, once the lineups are confirmed. Pick a market above for the projections."
                  : "Picks are in their trial run. Pick a market above to see every starter's projection and recent hit rate."
                : "No projections in the next 36 hours yet. They appear once FotMob has a likely eleven."
            }
          />
        ) : (
          byGame(rows).map((g) => {
            const first = g.rows[0];
            return (
              <section key={g.key} className="space-y-3">
                <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                  <span>{first.homeName} v {first.awayName}</span>
                  <span className="text-xs font-normal text-ink-dim">
                    {first.leagueName} · <LocalTime iso={first.kickoff} kind="dayTime" />
                  </span>
                </h2>
                <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.rows.map((r, i) => (
                    <div key={`${r.playerId}|${r.market}`} style={{ ["--i" as string]: i }}>
                      <PropCard row={r} showMatch={false} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
        <p className="text-[11px] text-ink-dim">
          {PROPS_NOTE} Projections are KiqStat&apos;s, from FotMob counts; how they were tested is in{" "}
          <Link href="/how-it-works" className="underline">how our picks work</Link>.
        </p>
      </Container>
    </>
  );
}
