import Link from "next/link";
import { Crest } from "@/components/ui/crest";
import { LocalTime } from "@/components/ui/local-time";
import { RatingChip } from "@/components/match/lineup-pitch";
import { ShotMap } from "@/components/match/shot-map";
import { matchPath } from "@/lib/routes";
import { ratingBand } from "@/lib/match-details-core";
import { per90, PROP_MARKETS, shotSplits, type HitRate, type PlayerHeader, type SeasonLine } from "@/lib/player-page-core";
import type { PlayerFixture, PlayerPage } from "@/lib/player-page";
import type { ShotPoint } from "@/lib/match-details-core";
import { leagueByCode } from "@/lib/leagues";

const H2 = "font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted";
type Game = PlayerPage["games"][number];

export function money(v: number | null): string | null {
  if (!v || v <= 0) return null;
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}m`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}k`;
  return `€${v}`;
}

/* --------------------------------------------------------------- overview */

export function NextMatchCard({ next, teamName }: { next: PlayerFixture; teamName: string | null }) {
  return (
    <Link href={matchPath(next.publicId)} className="card group block p-5 transition-colors hover:border-brand/40">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">Next match · {next.leagueName}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-display text-base font-bold sm:text-lg">
            {next.isHome ? `${teamName ?? "Home"} v ${next.opponentName}` : `${next.opponentName} v ${teamName ?? "Away"}`}
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            <LocalTime iso={next.kickoff} kind="dayTime" />
          </span>
        </span>
        <Crest src={next.opponentCrest ?? undefined} name={next.opponentName} size={40} />
      </div>
      <p className="mt-3 text-xs font-medium text-brand">Lineups and prediction →</p>
    </Link>
  );
}

export function SeasonTiles({ line, keeper }: { line: SeasonLine | undefined; keeper: boolean }) {
  if (!line) return null;
  const tiles: [string, string][] = keeper
    ? [
        ["Apps", `${line.apps}`],
        ["Minutes", line.minutes.toLocaleString("en-GB")],
        ["Saves", `${line.saves}`],
        ["Saves / 90", per90(line.saves, line.minutes)?.toFixed(2) ?? "–"],
      ]
    : [
        ["Apps", `${line.apps}${line.starts !== line.apps ? ` (${line.starts})` : ""}`],
        ["Goals", `${line.goals}`],
        ["Assists", `${line.assists}`],
        ["xG + xA", (line.xg + line.xa).toFixed(1)],
      ];
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={H2}>This season</h2>
        {line.rating !== null && (
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            Avg rating <RatingChip rating={line.rating} />
          </span>
        )}
      </div>
      <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map(([label, value], i) => (
          <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5" style={{ ["--i" as string]: i }}>
            <p className="text-[10.5px] uppercase tracking-wider text-ink-dim">{label}</p>
            <p className="tnum mt-1 font-mono text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Last eight ratings as bars, oldest left; a rating band colours each bar. */
export function RatingStrip({ games }: { games: Game[] }) {
  const rated = games.filter((g) => g.rating !== null && g.minutes > 0).slice(0, 8).reverse();
  if (rated.length < 3) return null;
  const tone = (r: number) => {
    const b = ratingBand(r);
    return b === "elite" ? "bg-brand" : b === "good" ? "bg-cyan" : b === "ok" ? "bg-amber" : "bg-rose";
  };
  return (
    <section className="card p-5">
      <h2 className={`mb-4 ${H2}`}>Form · last {rated.length} ratings</h2>
      <div className="flex h-28 items-end gap-1.5 sm:gap-2.5" role="list" aria-label="Recent match ratings">
        {rated.map((g, i) => {
          const r = g.rating ?? 0;
          const h = Math.max(8, Math.min(100, ((r - 5) / 4.5) * 100));
          return (
            <Link
              key={g.matchId}
              href={matchPath(g.publicId)}
              role="listitem"
              aria-label={`${r.toFixed(1)} against ${g.opponentName}`}
              title={`${r.toFixed(1)} v ${g.opponentName}`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="tnum font-mono text-[10.5px] text-ink-muted group-hover:text-ink">{r.toFixed(1)}</span>
              <span className={`seg-grow block w-full max-w-10 rounded-t-md ${tone(r)}`} style={{ height: `${h}%`, transformOrigin: "bottom", animationDelay: `${i * 50}ms` }} />
              <Crest src={g.opponentCrest ?? undefined} name={g.opponentName} size={16} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const MARKET_LABEL = Object.fromEntries(PROP_MARKETS.map((m) => [m.key, m.label])) as Record<string, string>;

/** Facts open to everyone: how often each line was cleared in recent starts. */
export function HitRatesPanel({ rates, compact = false }: { rates: HitRate[]; compact?: boolean }) {
  if (rates.length === 0) {
    return compact ? null : <EmptyCard text="Hit rates appear after three starts." />;
  }
  // One line per market on the overview: the one nearest a coin flip.
  const shown = compact
    ? Object.values(
        rates.reduce<Record<string, HitRate>>((acc, r) => {
          const cur = acc[r.market];
          const d = Math.abs(r.hits / r.games - 0.5);
          if (!cur || d < Math.abs(cur.hits / cur.games - 0.5)) acc[r.market] = r;
          return acc;
        }, {}),
      ).slice(0, 5)
    : rates;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className={H2}>Lines cleared</h2>
        <span className="text-[11px] text-ink-dim">Last {shown[0]?.games ?? 0} starts</span>
      </div>
      <ul className="stagger divide-y divide-line">
        {shown.map((r, i) => {
          const share = r.hits / r.games;
          return (
            <li key={`${r.market}-${r.line}`} className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5" style={{ ["--i" as string]: i }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  Over {r.line} {MARKET_LABEL[r.market]?.toLowerCase()}
                </span>
                <span className="mt-1 flex gap-1" aria-hidden>
                  {r.values.map((v, j) => (
                    <span key={j} className={`h-1.5 w-3 rounded-full ${v > r.line ? "bg-brand" : "bg-surface-3"}`} />
                  ))}
                </span>
              </span>
              <span className={`tnum shrink-0 font-mono text-sm font-semibold ${share >= 0.7 ? "text-brand" : share <= 0.3 ? "text-ink-dim" : ""}`}>
                {r.hits}/{r.games}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-dim sm:px-5">Counts from FotMob. A bookmaker&apos;s own count can differ slightly.</p>
    </section>
  );
}

/* --------------------------------------------------------------- game log */

export function GameLog({ games, keeper }: { games: Game[]; keeper: boolean }) {
  if (games.length === 0) return <EmptyCard text="No games recorded yet." />;
  const cols = keeper
    ? ([["Sv", (g: Game) => g.saves], ["Pass", (g: Game) => g.passes]] as const)
    : ([
        ["G", (g: Game) => g.goals], ["A", (g: Game) => g.assists], ["Sh", (g: Game) => g.shots],
        ["SoT", (g: Game) => g.shotsOnTarget], ["Tkl", (g: Game) => g.tackles], ["Fls", (g: Game) => g.fouls],
        ["Clr", (g: Game) => g.clearances], ["Pass", (g: Game) => g.passes],
      ] as const);
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-dim">
              <th className="sticky left-0 z-10 bg-surface py-2.5 pl-4 pr-2 font-medium sm:pl-5">Match</th>
              <th className="px-2 py-2.5 text-right font-medium">Min</th>
              <th className="px-2 py-2.5 text-right font-medium">Rtg</th>
              {cols.map(([h]) => (
                <th key={h} className="px-2 py-2.5 text-right font-medium">{h}</th>
              ))}
              <th className="py-2.5 pl-2 pr-4 font-medium sm:pr-5" aria-label="Cards" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {games.map((g) => {
              const res = g.goalsFor !== null && g.goalsAgainst !== null ? (g.goalsFor > g.goalsAgainst ? "W" : g.goalsFor < g.goalsAgainst ? "L" : "D") : null;
              return (
                <tr key={g.matchId} className="group/row transition-colors hover:bg-surface-2">
                  <td className="sticky left-0 z-10 max-w-[13rem] bg-surface py-2 pl-4 pr-2 transition-colors group-hover/row:bg-surface-2 sm:max-w-none sm:pl-5">
                    <Link href={matchPath(g.publicId)} className="flex min-w-0 items-center gap-2.5 hover:text-brand">
                      <span className="w-11 shrink-0 text-[11px] leading-tight text-ink-dim">
                        <LocalTime iso={g.kickoff} kind="day" />
                      </span>
                      <Crest src={g.opponentCrest ?? undefined} name={g.opponentName} size={18} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {g.isHome ? "v" : "@"} {g.opponentName}
                        </span>
                        <span className="block truncate text-[11px] text-ink-dim">{g.leagueName}</span>
                      </span>
                      {res && (
                        <span className={`tnum ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${res === "W" ? "bg-brand text-brand-ink" : res === "L" ? "bg-rose text-white" : "bg-surface-3"}`}>
                          {g.goalsFor}-{g.goalsAgainst}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="tnum px-2 py-2 text-right font-mono text-xs">
                    {g.minutes}
                    {!g.started && g.minutes > 0 && <span className="ml-0.5 text-brand" title="Came off the bench">↑</span>}
                  </td>
                  <td className="px-2 py-2 text-right">{g.rating !== null ? <RatingChip rating={g.rating} small /> : <span className="text-ink-dim">–</span>}</td>
                  {cols.map(([h, f]) => {
                    const v = f(g);
                    return (
                      <td key={h} className={`tnum px-2 py-2 text-right font-mono text-xs ${v ? "text-ink" : "text-ink-dim"}`}>
                        {v}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 pr-4 sm:pr-5">
                    <span className="flex gap-0.5">
                      {Array.from({ length: g.yellow }).map((_, i) => <span key={`y${i}`} className="inline-block h-3 w-2 rounded-[2px] bg-amber" title="Yellow card" />)}
                      {Array.from({ length: g.red }).map((_, i) => <span key={`r${i}`} className="inline-block h-3 w-2 rounded-[2px] bg-rose" title="Red card" />)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ stats */

export function StatsPanel({ page }: { page: PlayerPage }) {
  const keeper = page.player.group === "keeper";
  const all = page.season.find((l) => l.leagueCode === "all");
  const perGame: [string, number | null][] = all
    ? keeper
      ? [["Saves", per90(all.saves, all.minutes)], ["Passes", per90(all.passes, all.minutes)]]
      : [
          ["Goals", per90(all.goals, all.minutes)], ["xG", per90(all.xg, all.minutes)], ["Shots", per90(all.shots, all.minutes)],
          ["On target", per90(all.shotsOnTarget, all.minutes)], ["Assists", per90(all.assists, all.minutes)], ["xA", per90(all.xa, all.minutes)],
          ["Tackles", per90(all.tackles, all.minutes)], ["Clearances", per90(all.clearances, all.minutes)], ["Fouls", per90(all.fouls, all.minutes)],
          ["Passes", per90(all.passes, all.minutes)],
        ]
    : [];
  return (
    <div className="space-y-4">
      {perGame.length > 0 && (
        <section className="card p-5">
          <h2 className={`mb-3 ${H2}`}>Per 90 minutes · this season</h2>
          <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {perGame.map(([label, v], i) => (
              <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5" style={{ ["--i" as string]: i }}>
                <p className="text-[10.5px] uppercase tracking-wider text-ink-dim">{label}</p>
                <p className="tnum mt-1 font-mono text-lg font-semibold">{v === null ? "–" : v.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {page.percentiles && (
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={H2}>Compared with players in the same position</h2>
            <span className="text-[11px] text-ink-dim">{page.peersLabel}</span>
          </div>
          <ul className="space-y-2.5">
            {page.percentiles.map((p, i) => (
              <li key={p.key}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink-muted">{p.label}</span>
                  <span className="tnum font-mono font-semibold">{p.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className={`seg-grow block h-full rounded-full ${p.value >= 80 ? "bg-brand" : p.value >= 50 ? "bg-cyan" : p.value >= 25 ? "bg-amber" : "bg-rose"}`}
                    style={{ width: `${Math.max(3, p.value)}%`, animationDelay: `${i * 60}ms` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-ink-dim">Percentile per 90 minutes: 90 means better than 90% of them.</p>
        </section>
      )}
      {page.season.length > 1 && <SeasonTable lines={page.season} keeper={keeper} />}
    </div>
  );
}

function SeasonTable({ lines, keeper }: { lines: SeasonLine[]; keeper: boolean }) {
  return (
    <section className="card overflow-hidden">
      <h2 className={`border-b border-line px-4 py-3 sm:px-5 ${H2}`}>By competition</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-dim">
              <th className="py-2 pl-4 pr-2 font-medium sm:pl-5">Competition</th>
              <th className="px-2 py-2 text-right font-medium">Apps</th>
              <th className="px-2 py-2 text-right font-medium">Min</th>
              {keeper ? <th className="px-2 py-2 text-right font-medium">Saves</th> : (
                <>
                  <th className="px-2 py-2 text-right font-medium">G</th>
                  <th className="px-2 py-2 text-right font-medium">A</th>
                  <th className="px-2 py-2 text-right font-medium">xG</th>
                  <th className="px-2 py-2 text-right font-medium">Sh</th>
                </>
              )}
              <th className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">Rtg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.leagueCode} className={l.leagueCode === "all" ? "font-semibold" : ""}>
                <td className="py-2 pl-4 pr-2 sm:pl-5">{l.leagueCode === "all" ? "All competitions" : (leagueByCode(l.leagueCode)?.name ?? l.leagueCode)}</td>
                <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.apps}</td>
                <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.minutes}</td>
                {keeper ? <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.saves}</td> : (
                  <>
                    <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.goals}</td>
                    <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.assists}</td>
                    <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.xg.toFixed(1)}</td>
                    <td className="tnum px-2 py-2 text-right font-mono text-xs">{l.shots}</td>
                  </>
                )}
                <td className="py-2 pl-2 pr-4 text-right sm:pr-5">{l.rating !== null ? <RatingChip rating={l.rating} small /> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ shots */

export function ShotsPanel({ shots, name }: { shots: ShotPoint[]; name: string }) {
  if (shots.length === 0) return <EmptyCard text="No shots recorded this season." />;
  const xg = shots.reduce((a, s) => a + (s.xg ?? 0), 0);
  return (
    <div className="space-y-4">
      <ShotMap shots={shots} homeName={name} awayName="" xg={{ home: xg, away: null }} single title="Shots this season" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SplitCard title="By body part" rows={shotSplits(shots, "type")} />
        <SplitCard title="By situation" rows={shotSplits(shots, "situation")} />
      </div>
    </div>
  );
}

function SplitCard({ title, rows }: { title: string; rows: ReturnType<typeof shotSplits> }) {
  const max = Math.max(1, ...rows.map((r) => r.shots));
  return (
    <section className="card p-5">
      <h2 className={`mb-3 ${H2}`}>{title}</h2>
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-muted">{r.label}</span>
              <span className="tnum font-mono">
                {r.shots} shots · {r.goals} goals · xG {r.xg.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <span className="seg-grow block h-full rounded-full bg-brand" style={{ width: `${(r.shots / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- profile */

export function ProfilePanel({ player }: { player: PlayerHeader }) {
  const facts: [string, string | null][] = [
    ["Position", [player.position, ...player.otherPositions].filter(Boolean).join(", ") || null],
    ["Shirt", player.shirt ? `#${player.shirt}` : null],
    ["Age", player.age ? `${player.age}` : null],
    ["Height", player.height ? `${player.height} cm` : null],
    ["Foot", player.foot],
    ["Country", player.country],
    ["Market value", money(player.marketValue)],
    ["Contract until", player.contractEnd?.slice(0, 4) ?? null],
  ];
  const shown = facts.filter(([, v]) => v);
  return (
    <div className="space-y-4">
      {player.injury && (
        <section className="card flex items-center gap-3 border-rose/30 bg-rose/[0.05] p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose/15 text-sm font-bold text-rose" aria-hidden>+</span>
          <p className="text-sm">
            <span className="font-semibold">Injured{player.injury.name ? `: ${player.injury.name}` : ""}.</span>{" "}
            {player.injury.expectedReturn && <span className="text-ink-muted">Expected back: {player.injury.expectedReturn}</span>}
          </p>
        </section>
      )}
      {shown.length > 0 && (
        <section className="card stagger grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-4">
          {shown.map(([label, value], i) => (
            <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5" style={{ ["--i" as string]: i }}>
              <p className="text-[10.5px] uppercase tracking-wider text-ink-dim">{label}</p>
              <p className="mt-1 truncate text-sm font-semibold">{value}</p>
            </div>
          ))}
        </section>
      )}
      {player.career.club.length > 0 && <CareerList title="Career" spells={player.career.club} />}
      {player.career.national.length > 0 && <CareerList title="International" spells={player.career.national} />}
      {player.trophies.length > 0 && (
        <section className="card p-5">
          <h2 className={`mb-3 ${H2}`}>Trophies</h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {player.trophies.map((t) => (
              <li key={`${t.name}-${t.team}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="block truncate text-[11px] text-ink-dim">{[t.team, t.latest && `last ${t.latest}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="tnum shrink-0 font-display text-xl font-bold text-gold">{t.won}×</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!player.hasProfile && <EmptyCard text="The full profile appears once it has been fetched." />}
    </div>
  );
}

function CareerList({ title, spells }: { title: string; spells: PlayerHeader["career"]["club"] }) {
  return (
    <section className="card overflow-hidden">
      <h2 className={`border-b border-line px-4 py-3 sm:px-5 ${H2}`}>{title}</h2>
      <ul className="divide-y divide-line">
        {spells.map((s, i) => (
          <li key={`${s.team}-${i}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 sm:px-5">
            <span className="min-w-0">
              <span className="flex items-center gap-2 truncate text-sm font-medium">
                {s.team}
                {s.active && <span className="rounded bg-brand/15 px-1 text-[10px] font-bold text-brand">Now</span>}
              </span>
              <span className="block text-[11px] text-ink-dim">
                {s.start?.slice(0, 4) ?? "?"} – {s.active ? "now" : (s.end?.slice(0, 4) ?? "?")}
              </span>
            </span>
            <span className="tnum shrink-0 text-right font-mono text-xs text-ink-muted">
              {s.apps ?? 0} apps · {s.goals ?? 0} goals
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EmptyCard({ text }: { text: string }) {
  return <section className="card px-5 py-10 text-center text-sm text-ink-dim">{text}</section>;
}
