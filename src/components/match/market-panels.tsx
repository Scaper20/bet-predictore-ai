import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { GOAL_LINES, scoreMatrix, type AsianHandicapLine } from "@/lib/model/poisson";
import { ProbabilityBar } from "@/components/ui/primitives";
import { percent } from "@/lib/format";
import { Ask, AskList, CountChart, More, inTen, oneIn } from "@/components/match/likelihood";

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
                <span className="tnum text-sm font-bold">{percent(r.value, 1)}</span>
              </span>
            </div>
            <ProbabilityBar value={r.value} tone={r.value === best ? "brand" : "neutral"} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Exact total goals, 0 to 6+, from the scoreline grid. */
function totals(prediction: Prediction) {
  const { home, away } = prediction.markets.expectedGoals;
  const grid = scoreMatrix(home, away, prediction.model.rho);
  const t = [0, 0, 0, 0, 0, 0, 0];
  grid.forEach((row, x) => row.forEach((p, y) => (t[Math.min(6, x + y)] += p)));
  return t.map((p, i) => ({ label: i === 6 ? "6+" : String(i), p }));
}

/** One plain sentence on the shape of the game, for people who read no further. */
export function expectSentence(prediction: Prediction): string {
  const { markets: m, match } = prediction;
  const total = m.expectedGoals.total;
  const goals = total < 2.1 ? "a tight, low-scoring game" : total < 2.9 ? "a game with two or three goals" : "an open game with plenty of goals";
  // Same rounding as the rows below, so the sentence never contradicts them.
  const bothIn10 = Math.round(m.bttsYes * 10);
  const both = bothIn10 >= 6 ? "both sides likely to score" : bothIn10 <= 4 ? "at least one side likely to fire blanks" : "both scoring is a toss-up";
  const cs = Math.max(m.cleanSheet.home, m.cleanSheet.away);
  const keeper = cs >= 0.4 ? `; ${m.cleanSheet.home >= m.cleanSheet.away ? match.home.shortName : match.away.shortName} best placed to keep a clean sheet` : "";
  return `Expect ${goals}, ${both}${keeper}.`;
}

export function GoalsPanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;
  const words = ["1 or more goals", "2 or more goals", "3 or more goals", "4 or more goals", "5 or more goals"];

  return (
    <Panel title="Goals" hint={`${match.home.shortName} ${m.expectedGoals.home.toFixed(1)} – ${m.expectedGoals.away.toFixed(1)} ${match.away.shortName} expected`}>
      <p className="mb-5 rounded-lg bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink">{expectSentence(prediction)}</p>
      <CountChart bars={totals(prediction)} noun="goals" />
      <div className="mt-4">
        <AskList>
          {GOAL_LINES.map((line, i) => (
            <Ask key={line} q={words[i]} sub={`Over ${line}`} p={m.over[String(line)]} />
          ))}
        </AskList>
      </div>
    </Panel>
  );
}

export function BttsPanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;

  return (
    <Panel title="Both teams to score" hint="GG / NG">
      <AskList>
        <Ask q="Will both teams score?" p={m.bttsYes} />
        <Ask q={`${match.home.shortName} keep a clean sheet?`} p={m.cleanSheet.home} />
        <Ask q={`${match.away.shortName} keep a clean sheet?`} p={m.cleanSheet.away} />
      </AskList>
    </Panel>
  );
}

export function DoubleChancePanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;

  return (
    <Panel title="Two results" hint="Double chance">
      <AskList>
        <Ask q={`${match.home.shortName} or draw`} sub="1X" p={m.doubleChance.homeOrDraw} />
        <Ask q={`${match.away.shortName} or draw`} sub="X2" p={m.doubleChance.awayOrDraw} />
        <Ask q="Either team wins" sub="12, no draw" p={m.doubleChance.homeOrAway} />
      </AskList>
    </Panel>
  );
}

export function CorrectScorePanel({ prediction }: { prediction: Prediction }) {
  const scores = prediction.markets.correctScore.slice(0, 10);
  const top = scores[0]?.probability ?? 1;
  const row = (s: (typeof scores)[number]) => (
    <li key={`${s.home}-${s.away}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
      <span className="tnum w-12 font-mono text-sm font-semibold">
        {s.home}-{s.away}
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-violet" style={{ width: `${(s.probability / top) * 100}%` }} />
      </div>
      <span className="tnum w-14 text-right text-xs font-semibold text-ink-muted" title={percent(s.probability, 1)}>
        {oneIn(s.probability)}
      </span>
    </li>
  );

  return (
    <Panel title="Correct score" hint="Most likely scorelines">
      <ol className="space-y-2.5">{scores.slice(0, 5).map(row)}</ol>
      {scores.length > 5 && (
        <More title="More scorelines">
          <ol className="space-y-2.5 pt-2">{scores.slice(5).map(row)}</ol>
        </More>
      )}
      <Footnote>Even the likeliest score comes up only about {oneIn(top)} times: scorelines are long shots by nature.</Footnote>
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
    <Panel title="Winning margin" hint={`Asian handicap · ${match.home.shortName} line`}>
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
      <Footnote>Line applies to {match.home.shortName}. On whole lines a result exactly on the line counts as level.</Footnote>
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
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        {hint && <span className="shrink-0 text-xs text-ink-dim">{hint}</span>}
      </div>
      {children}
    </section>
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

function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-[11px] leading-relaxed text-ink-dim">{children}</p>;
}

/**
 * Half-time and second-half markets. Pro only (ProMarkets), and shown as
 * probabilities, never as picks: see halves.ts for what the walk-forward
 * test supports.
 */
export function HalvesPanel({ prediction }: { prediction: Prediction }) {
  const h = prediction.markets.halves;
  if (!h) return null;
  const { match } = prediction;
  const ht = [
    { label: match.home.shortName, value: h.ht.home },
    { label: "Draw", value: h.ht.draw },
    { label: match.away.shortName, value: h.ht.away },
  ];
  const bestHt = Math.max(h.ht.home, h.ht.draw, h.ht.away);
  const htft = Object.entries(h.htft)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const name = (k: string) => {
    const side = (c: string) => (c === "H" ? match.home.shortName : c === "A" ? match.away.shortName : "Draw");
    const [a, b] = k.split("/");
    return `${side(a)} / ${side(b)}`;
  };

  return (
    <Panel title="Halves" hint="Half time and second half">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Half-time result</p>
      <div className="space-y-3">
        {ht.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate text-sm ${r.value === bestHt ? "font-semibold text-ink" : "text-ink-muted"}`}>{r.label}</span>
              <span className="tnum text-sm font-bold">{percent(r.value, 1)}</span>
            </div>
            <ProbabilityBar value={r.value} tone={r.value === bestHt ? "brand" : "neutral"} />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <AskList>
          <Ask q="A goal before half time" sub="1st half over 0.5" p={h.htOver["0.5"]} />
          <Ask q="2+ goals before half time" sub="1st half over 1.5" p={h.htOver["1.5"]} />
          <Ask q="A goal after half time" sub="2nd half over 0.5" p={h.shOver["0.5"]} />
          <Ask q="2+ goals after half time" sub="2nd half over 1.5" p={h.shOver["1.5"]} />
        </AskList>
      </div>

      <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Half time / full time, likeliest</p>
      <ul className="space-y-1.5">
        {htft.map(([k, v]) => (
          <li key={k} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-muted">{name(k)}</span>
            <span className="tnum font-semibold">{inTen(v)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
