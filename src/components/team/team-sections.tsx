import Link from "next/link";
import { Crest } from "@/components/ui/crest";
import { LocalTime } from "@/components/ui/local-time";
import { FormPips } from "@/components/stats/form-pips";
import { RatingChip } from "@/components/match/lineup-pitch";
import { matchPath, playerPath, teamPath } from "@/lib/routes";
import { percent } from "@/lib/format";
import { outcome, type FormSummary, type GoalProfile } from "@/lib/stats/compute";
import type { TeamFixture } from "@/lib/team-page";
import { topBy, type Honour, type Leader, type SquadGroup, type SquadMember, type TeamProfile, type Transfer } from "@/lib/team-page-core";

const H2 = "font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted";

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/* --------------------------------------------------------------- fixtures */

export function FixtureList({ title, fixtures, empty, results }: { title: string; fixtures: TeamFixture[]; empty: string; results?: boolean }) {
  return (
    <section className="card overflow-hidden">
      <h2 className={`border-b border-line px-4 py-3 sm:px-5 ${H2}`}>{title}</h2>
      {fixtures.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-dim">{empty}</p>
      ) : (
        <ul className="stagger divide-y divide-line">
          {fixtures.map((f, i) => (
            <li key={f.publicId} style={{ ["--i" as string]: i }}>
              <FixtureRow f={f} result={results} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FixtureRow({ f, result }: { f: TeamFixture; result?: boolean }) {
  const o = result && f.goalsFor !== null && f.goalsAgainst !== null ? outcome({ goalsFor: f.goalsFor, goalsAgainst: f.goalsAgainst }) : null;
  const tone = o === "W" ? "bg-brand text-brand-ink" : o === "L" ? "bg-rose text-white" : o === "D" ? "bg-surface-3 text-ink" : "";
  return (
    <Link href={matchPath(f.publicId)} className="group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:px-5">
      <span className="w-14 shrink-0 text-[11px] leading-tight text-ink-dim">
        <LocalTime iso={f.kickoff} kind="day" />
        {!result && (
          <span className="block tnum font-mono text-ink-muted">
            <LocalTime iso={f.kickoff} />
          </span>
        )}
      </span>
      <span className="w-7 shrink-0 text-center text-[10px] font-semibold uppercase text-ink-dim">{f.isHome ? "H" : "A"}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <Crest src={f.opponentCrest ?? undefined} name={f.opponentName} size={22} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium group-hover:text-brand">{f.opponentName}</span>
          <span className="block truncate text-[11px] text-ink-dim">{f.leagueName}</span>
        </span>
      </span>
      {result && o ? (
        <span className={`tnum shrink-0 rounded-md px-2 py-1 font-mono text-xs font-bold ${tone}`}>
          {f.goalsFor}-{f.goalsAgainst}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-brand opacity-0 transition-opacity group-hover:opacity-100">Preview →</span>
      )}
    </Link>
  );
}

/* --------------------------------------------------------------- next game */

export function NextMatchCard({ next, teamName }: { next: TeamFixture; teamName: string }) {
  return (
    <Link href={matchPath(next.publicId)} className="card group block overflow-hidden p-5 transition-colors hover:border-brand/40">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">Next match · {next.leagueName}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-display text-base font-bold sm:text-lg">
            {next.isHome ? `${teamName} v ${next.opponentName}` : `${next.opponentName} v ${teamName}`}
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            <LocalTime iso={next.kickoff} kind="dayTime" />
          </span>
        </span>
        <Crest src={next.opponentCrest ?? undefined} name={next.opponentName} size={40} />
      </div>
      <p className="mt-3 text-xs font-medium text-brand">Prediction, lineups and team news →</p>
    </Link>
  );
}

/* ------------------------------------------------------------ form summary */

export function FormCard({ form, goals }: { form: FormSummary; goals: GoalProfile | null }) {
  const tiles: [string, string][] = [
    ["Record", `${form.won}-${form.drawn}-${form.lost}`],
    ["Points a game", form.ppg.toFixed(2)],
    ["Scored", String(form.goalsFor)],
    ["Conceded", String(form.goalsAgainst)],
  ];
  const bars: [string, number][] = goals
    ? [
        ["Over 2.5 goals", goals.over25],
        ["Both teams scored", goals.btts],
        ["Clean sheets", goals.cleanSheets],
        ["Failed to score", goals.failedToScore],
      ]
    : [];
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={H2}>Last {form.played} games</h2>
        <FormPips letters={form.letters.slice(0, 5)} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <p className="text-[10.5px] uppercase tracking-wider text-ink-dim">{label}</p>
            <p className="tnum mt-1 font-mono text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {bars.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {bars.map(([label, share], i) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-muted">{label}</span>
                <span className="tnum font-mono font-semibold">{percent(share)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span className="seg-grow block h-full rounded-full bg-brand" style={{ width: `${share * 100}%`, animationDelay: `${i * 70}ms` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- injuries */

export function InjuriesCard({ injured }: { injured: SquadMember[] }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={H2}>Injuries</h2>
        <span className={`tnum font-mono text-xs ${injured.length ? "text-rose" : "text-ink-dim"}`}>{injured.length} out</span>
      </div>
      {injured.length === 0 ? (
        <p className="text-sm text-ink-dim">No one reported injured.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {injured.map((m) => (
            <li key={m.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-rose/15 text-[10px] font-bold text-rose" aria-hidden>+</span>
                <span className="min-w-0 truncate text-sm">{m.name}</span>
                {m.position && <span className="shrink-0 text-[11px] text-ink-dim">{m.position}</span>}
              </span>
              {m.injury && <span className="shrink-0 text-right text-[11px] text-ink-muted">{m.injury}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ squad */

const GROUP_LABEL: Record<SquadGroup, string> = { keepers: "Goalkeepers", defenders: "Defenders", midfielders: "Midfielders", attackers: "Forwards" };

export function SquadPanel({ profile, links = {} }: { profile: TeamProfile; links?: Record<number, string> }) {
  const groups = (Object.keys(GROUP_LABEL) as SquadGroup[]).filter((g) => profile.squad[g].length > 0);
  if (groups.length === 0) return <EmptyCard text="The squad list isn't in yet." />;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g} className="card overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3 sm:px-5">
            <h2 className={H2}>{GROUP_LABEL[g]}</h2>
            <span className="hidden text-[10.5px] uppercase tracking-wider text-ink-dim sm:block">Age · G · A · Rating</span>
          </div>
          <ul className="stagger divide-y divide-line">
            {profile.squad[g].map((m, i) => (
              <li key={m.id} className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5" style={{ ["--i" as string]: i }}>
                <span className="tnum w-7 shrink-0 text-right font-mono text-sm text-ink-dim">{m.shirt ?? ""}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {links[m.id] ? (
                      <Link href={playerPath(links[m.id], m.name)} prefetch={false} className="truncate hover:text-brand">
                        {m.name}
                      </Link>
                    ) : (
                      m.name
                    )}
                    {m.injured && <span className="rounded bg-rose/15 px-1 text-[10px] font-bold text-rose" title={m.injury ?? "Injured"}>Inj</span>}
                  </span>
                  <span className="block truncate text-[11px] text-ink-dim">{[m.position?.replace(/,\s*/g, ", "), m.country].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="tnum hidden w-8 shrink-0 text-right font-mono text-xs text-ink-muted sm:block">{m.age ?? ""}</span>
                <span className="tnum w-6 shrink-0 text-right font-mono text-xs">{m.goals || ""}</span>
                <span className="tnum w-6 shrink-0 text-right font-mono text-xs text-ink-muted">{m.assists || ""}</span>
                <span className="w-10 shrink-0 text-right">{m.rating !== null && m.rating > 0 ? <RatingChip rating={m.rating} /> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- leaders */

export function LeadersPanel({ leaders }: { leaders: Leader[] }) {
  if (leaders.length === 0) return <EmptyCard text="Player numbers for this season appear once its games are in." />;
  const boards: { title: string; pick: (l: Leader) => number; fmt?: (v: number) => string; minApps?: number }[] = [
    { title: "Goals", pick: (l) => l.goals },
    { title: "Assists", pick: (l) => l.assists },
    { title: "Expected goals (xG)", pick: (l) => l.xg, fmt: (v) => v.toFixed(2) },
    { title: "Shots on target", pick: (l) => l.shotsOnTarget },
    { title: "Average rating", pick: (l) => l.rating ?? 0, fmt: (v) => v.toFixed(2), minApps: 3 },
    { title: "Minutes", pick: (l) => l.minutes, fmt: (v) => `${Math.round(v)}'` },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {boards.map((b) => {
        const top = topBy(leaders, b.pick, 5, b.minApps ?? 0);
        if (top.length === 0) return null;
        const max = b.pick(top[0]) || 1;
        return (
          <section key={b.title} className="card p-5">
            <h2 className={`mb-3 ${H2}`}>{b.title}</h2>
            <ol className="space-y-2.5">
              {top.map((l, i) => (
                <li key={l.playerId}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="tnum mr-2 font-mono text-xs text-ink-dim">{i + 1}</span>
                      <Link href={playerPath(l.playerId, l.name)} prefetch={false} className="hover:text-brand">
                        {l.name}
                      </Link>
                    </span>
                    <span className={`tnum shrink-0 font-mono font-semibold ${i === 0 ? "text-brand" : ""}`}>{(b.fmt ?? String)(b.pick(l))}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                    <span className={`seg-grow block h-full rounded-full ${i === 0 ? "bg-brand" : "bg-ink-dim/60"}`} style={{ width: `${(b.pick(l) / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- club */

export function ClubPanel({ profile }: { profile: TeamProfile }) {
  const ins = profile.transfers.filter((t) => t.direction === "in");
  const outs = profile.transfers.filter((t) => t.direction === "out");
  return (
    <div className="space-y-4">
      {(profile.venue || profile.coach) && (
        <section className="card grid gap-3 p-5 sm:grid-cols-3">
          {profile.coach && <Fact label="Head coach" value={profile.coach} />}
          {profile.venue && <Fact label="Stadium" value={[profile.venue, profile.city].filter(Boolean).join(", ")} />}
          {profile.capacity && <Fact label="Capacity" value={profile.capacity.toLocaleString("en-GB")} />}
        </section>
      )}
      {profile.transfers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TransferList title="Arrivals" list={ins} />
          <TransferList title="Departures" list={outs} />
        </div>
      )}
      {profile.honours.length > 0 && <Honours honours={profile.honours} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      <p className="text-[10.5px] uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function TransferList({ title, list }: { title: string; list: Transfer[] }) {
  return (
    <section className="card overflow-hidden">
      <h2 className={`border-b border-line px-4 py-3 sm:px-5 ${H2}`}>{title}</h2>
      {list.length === 0 ? (
        <p className="px-5 py-5 text-sm text-ink-dim">None recorded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, 10).map((t, i) => (
            <li key={`${t.name}-${i}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 sm:px-5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block truncate text-[11px] text-ink-dim">
                  {t.direction === "in" ? "from" : "to"} {t.club ?? "unknown"}
                  {t.date ? ` · ${t.date.slice(0, 10)}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-ink-muted">{t.onLoan ? "Loan" : (t.fee ?? "")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Honours({ honours }: { honours: Honour[] }) {
  return (
    <section className="card p-5">
      <h2 className={`mb-3 ${H2}`}>Honours</h2>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {honours.map((h) => (
          <li key={h.name} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{h.name}</span>
              {h.latest && <span className="block text-[11px] text-ink-dim">Last: {h.latest}</span>}
            </span>
            <span className="tnum shrink-0 font-display text-xl font-bold text-gold">{h.won}×</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EmptyCard({ text }: { text: string }) {
  return <section className="card px-5 py-10 text-center text-sm text-ink-dim">{text}</section>;
}

/** A small link to another club, for tables and lists. */
export function TeamLink({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <Link href={teamPath(id, name)} className={className ?? "hover:text-brand"}>
      {name}
    </Link>
  );
}
