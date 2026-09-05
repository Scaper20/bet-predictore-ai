import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { GOAL_LINES, type AsianHandicapLine } from "@/lib/model/poisson";
import { ProbabilityBar } from "@/components/ui/primitives";
import { odds, percent } from "@/lib/format";

export function OutcomePanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;
  const rows = [
    { label: match.home.name, value: m.home, key: "home" },
    { label: "Draw", value: m.draw, key: "draw" },
    { label: match.away.name, value: m.away, key: "away" },
  ];
  const best = Math.max(m.home, m.draw, m.away);

  return (
    <Panel title="Match result" hint="1X2">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate text-sm ${r.value === best ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {r.label}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="tnum text-xs text-ink-dim">{odds(1 / r.value)}</span>
                <span className="tnum text-sm font-bold">{percent(r.value, 1)}</span>
              </span>
            </div>
            <ProbabilityBar value={r.value} tone={r.value === best ? "brand" : "neutral"} />
          </div>
        ))}
      </div>
      <Footnote>
        Prices shown are break-even: what a selection is worth with no bookmaker margin
        attached, and so the least a price has to beat to be worth taking.
      </Footnote>
    </Panel>
  );
}

export function GoalsPanel({ prediction }: { prediction: Prediction }) {
  const { markets: m } = prediction;

  return (
    <Panel title="Goals" hint={`${m.expectedGoals.total.toFixed(2)} expected`}>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Metric label="Home xG" value={m.expectedGoals.home.toFixed(2)} />
        <Metric label="Away xG" value={m.expectedGoals.away.toFixed(2)} />
        <Metric label="Total" value={m.expectedGoals.total.toFixed(2)} accent />
      </div>

      <div className="space-y-3">
        {GOAL_LINES.map((line) => {
          const over = m.over[String(line)];
          return (
            <div key={line} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <span className="tnum w-16 text-xs text-ink-muted">Over {line}</span>
              <ProbabilityBar value={over} tone={over > 0.5 ? "brand" : "neutral"} />
              <span className="tnum w-12 text-right text-xs font-semibold">{percent(over)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function BttsPanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;

  return (
    <Panel title="Both teams to score" hint="BTTS">
      <div className="grid grid-cols-2 gap-3">
        <BigStat label="Yes" value={percent(m.bttsYes)} highlight={m.bttsYes > 0.5} />
        <BigStat label="No" value={percent(m.bttsNo)} highlight={m.bttsNo > 0.5} />
      </div>
      <div className="mt-5 space-y-3">
        <LabelledBar
          label={`${match.home.shortName} clean sheet`}
          value={m.cleanSheet.home}
        />
        <LabelledBar
          label={`${match.away.shortName} clean sheet`}
          value={m.cleanSheet.away}
        />
      </div>
    </Panel>
  );
}

export function DoubleChancePanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;
  const rows = [
    { label: `${match.home.shortName} or Draw`, tag: "1X", value: m.doubleChance.homeOrDraw },
    { label: `${match.away.shortName} or Draw`, tag: "X2", value: m.doubleChance.awayOrDraw },
    { label: "Either team", tag: "12", value: m.doubleChance.homeOrAway },
  ];

  return (
    <Panel title="Double chance" hint="Two outcomes covered">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.tag}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink-muted">
                <span className="mr-2 font-mono text-xs text-ink-dim">{r.tag}</span>
                {r.label}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="tnum text-xs text-ink-dim">{odds(1 / r.value)}</span>
                <span className="tnum text-sm font-bold">{percent(r.value)}</span>
              </span>
            </div>
            <ProbabilityBar value={r.value} tone="cyan" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CorrectScorePanel({ prediction }: { prediction: Prediction }) {
  const scores = prediction.markets.correctScore.slice(0, 10);
  const top = scores[0]?.probability ?? 1;

  return (
    <Panel title="Correct score" hint="Most likely scorelines">
      <ol className="space-y-2.5">
        {scores.map((s) => (
          <li key={`${s.home}-${s.away}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <span className="tnum w-12 font-mono text-sm font-semibold">
              {s.home}-{s.away}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-violet"
                style={{ width: `${(s.probability / top) * 100}%` }}
              />
            </div>
            <span className="tnum w-12 text-right text-xs font-semibold text-ink-muted">
              {percent(s.probability, 1)}
            </span>
          </li>
        ))}
      </ol>
      <Footnote>
        Correct score is a long shot by nature — even the likeliest scoreline here is well under
        evens.
      </Footnote>
    </Panel>
  );
}

export function AsianHandicapPanel({
  asianHandicap: lines,
  match,
}: {
  asianHandicap: AsianHandicapLine[];
  match: Match;
}) {
  // The full ±2 range is mostly academic at the extremes — the tradeable
  // range that matters in practice is the middle of the table.
  const core = lines.filter((l) => Math.abs(l.line) <= 1.5);

  return (
    <Panel title="Asian handicap" hint={`${match.home.shortName} line`}>
      <div className="space-y-3">
        {core.map((l) => (
          <div key={l.line} className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-3">
            <span className="tnum text-xs font-semibold text-ink-muted">
              {l.line === 0 ? "0" : l.line > 0 ? `+${l.line}` : l.line}
            </span>
            <BarCell label={match.home.shortName} value={l.home} />
            <BarCell label={match.away.shortName} value={l.away} />
          </div>
        ))}
      </div>
      <Footnote>
        Line is applied to {match.home.shortName}. A negative line means they must win by more
        than that margin to cover; a positive line gives them a head start. Whole lines (0, ±1) can
        push — your stake is refunded if the match lands exactly on the line.
      </Footnote>
    </Panel>
  );
}

function BarCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] text-ink-dim">{label}</span>
        <span className="tnum text-xs font-semibold">{percent(value)}</span>
      </div>
      <ProbabilityBar value={value} tone={value > 0.5 ? "brand" : "neutral"} />
    </div>
  );
}

export function FormPanel({ prediction }: { prediction: Prediction }) {
  const { form, match } = prediction;
  const sides = [
    { team: match.home, f: form.home },
    { team: match.away, f: form.away },
  ];

  if (form.home.entries.length === 0 && form.away.entries.length === 0) {
    return (
      <Panel title="Recent form" hint="Last matches">
        <p className="text-sm text-ink-dim">
          No recent completed matches for either side in the data available for this competition.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Recent form" hint="Most recent first">
      <div className="space-y-6">
        {sides.map(({ team, f }) => (
          <div key={team.id}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold">{team.name}</span>
              <span className="tnum shrink-0 text-xs text-ink-muted">
                {f.points} pts / {f.entries.length * 3}
              </span>
            </div>

            {f.entries.length === 0 ? (
              <p className="text-xs text-ink-dim">No completed matches in the sample.</p>
            ) : (
              <>
                <div className="flex gap-1.5">
                  {f.entries.map((e, i) => (
                    <span
                      key={i}
                      title={`${e.home ? "H" : "A"} vs ${e.opponent}: ${e.goalsFor}-${e.goalsAgainst}`}
                      className={`grid size-7 place-items-center rounded-md text-[11px] font-bold ${
                        e.result === "W"
                          ? "bg-brand/15 text-brand"
                          : e.result === "D"
                            ? "bg-surface-3 text-ink-muted"
                            : "bg-rose/15 text-rose"
                      }`}
                    >
                      {e.result}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-dim">
                  <span>
                    <span className="tnum text-ink-muted">{f.goalsFor}</span> scored
                  </span>
                  <span>
                    <span className="tnum text-ink-muted">{f.goalsAgainst}</span> conceded
                  </span>
                  <span>
                    <span className="tnum text-ink-muted">{percent(f.bttsRate)}</span> BTTS
                  </span>
                  <span>
                    <span className="tnum text-ink-muted">{f.cleanSheets}</span> clean sheets
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function H2HPanel({ prediction }: { prediction: Prediction }) {
  const { h2h, match } = prediction;

  if (h2h.meetings === 0) {
    return (
      <Panel title="Head to head" hint="Previous meetings">
        <p className="text-sm text-ink-dim">
          No previous meetings found in the available data.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Head to head" hint={`Last ${h2h.meetings} meetings`}>
      <div className="mb-5 grid grid-cols-3 gap-3 text-center">
        <BigStat label={match.home.shortName} value={String(h2h.homeWins)} />
        <BigStat label="Draws" value={String(h2h.draws)} />
        <BigStat label={match.away.shortName} value={String(h2h.awayWins)} />
      </div>

      <ul className="space-y-2">
        {h2h.recent.slice(0, 5).map((r, i) => (
          <li key={i} className="flex items-center gap-3 text-xs">
            <span className="tnum w-20 shrink-0 text-ink-dim">
              {new Date(r.date).toLocaleDateString("en-NG", { year: "2-digit", month: "short", day: "numeric" })}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-muted">
              {r.homeName} <span className="tnum font-semibold text-ink">{r.homeGoals}-{r.awayGoals}</span> {r.awayName}
            </span>
          </li>
        ))}
      </ul>
      <Footnote>
        Head-to-head is context, not evidence. Squads turn over, and five meetings is far too
        small a sample to move a probability on its own — the model treats it that way.
      </Footnote>
    </Panel>
  );
}

/* ------------------------------------------------------------- Shared bits */

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        {hint && <span className="shrink-0 text-xs text-ink-dim">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className={`tnum mt-1 text-lg font-bold ${accent ? "text-brand" : ""}`}>{value}</p>
    </div>
  );
}

function BigStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-lg px-3 py-3 text-center ${highlight ? "bg-brand/10" : "bg-surface-2"}`}
    >
      <p className={`tnum text-xl font-bold ${highlight ? "text-brand" : ""}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-dim">{label}</p>
    </div>
  );
}

function LabelledBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="min-w-0">
        <p className="mb-1.5 truncate text-xs text-ink-muted">{label}</p>
        <ProbabilityBar value={value} tone="amber" />
      </div>
      <span className="tnum text-xs font-semibold">{percent(value)}</span>
    </div>
  );
}

function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-[11px] leading-relaxed text-ink-dim">{children}</p>;
}
