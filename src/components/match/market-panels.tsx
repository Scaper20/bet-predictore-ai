import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { GOAL_LINES, scoreMatrix, type AsianHandicapLine } from "@/lib/model/poisson";
import { ProbabilityBar } from "@/components/ui/primitives";
import { percent } from "@/lib/format";
import { Ask, AskList, inTen, oneIn } from "@/components/match/likelihood";

/**
 * The 1X2 split as three columns, the likeliest lit, and the game's shape
 * underneath (expected goals, over 2.5, both score) unless those are locked.
 */
export function OutcomePanel({ prediction, facts = true }: { prediction: Prediction; facts?: boolean }) {
  const { markets: m, match } = prediction;
  const rows = [
    { label: match.home.shortName, value: m.home, key: "home" },
    { label: "Draw", value: m.draw, key: "draw" },
    { label: match.away.shortName, value: m.away, key: "away" },
  ];
  const best = Math.max(m.home, m.draw, m.away);

  return (
    <Panel title="Match result" hint="1X2">
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => {
          const top = r.value === best;
          return (
            <div key={r.key} className={`min-w-0 rounded-xl px-2 py-2.5 text-center ${top ? "bg-brand/10 ring-1 ring-brand/40" : "bg-surface-2"}`}>
              <p className={`tnum font-mono text-lg font-semibold tracking-tight sm:text-xl ${top ? "text-brand" : "text-ink"}`}>{percent(r.value)}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-dim" title={r.label}>{r.label}</p>
            </div>
          );
        })}
      </div>
      {facts && (
        <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-center">
          <Fact label="xG" value={`${m.expectedGoals.home.toFixed(1)}–${m.expectedGoals.away.toFixed(1)}`} />
          <Fact label="Over 2.5" value={percent(m.over["2.5"])} hot={m.over["2.5"] >= 0.6} />
          <Fact label="Both score" value={percent(m.bttsYes)} hot={m.bttsYes >= 0.6} />
        </dl>
      )}
    </Panel>
  );
}

function Fact({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="min-w-0 px-1 py-2">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className={`tnum mt-0.5 font-mono text-sm font-semibold ${hot ? "text-brand" : "text-ink"}`}>{value}</dd>
    </div>
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

/**
 * Every goal line as one ladder, over beside under, the likelier side lit:
 * five rows instead of a chart and five questions.
 */
export function GoalsPanel({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;
  const t = totals(prediction);
  const likeliest = t.reduce((b, x) => (x.p > b.p ? x : b), t[0]);

  return (
    <Panel title="Goals" hint={`xG ${match.home.shortName} ${m.expectedGoals.home.toFixed(1)} – ${m.expectedGoals.away.toFixed(1)} ${match.away.shortName}`}>
      <p className="mb-3 text-xs leading-relaxed text-ink-muted">{expectSentence(prediction)}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-ink-dim">
            <th className="pb-1.5 text-left font-medium">Line</th>
            <th className="pb-1.5 text-right font-medium">Over</th>
            <th className="pb-1.5 text-right font-medium">Under</th>
          </tr>
        </thead>
        <tbody className="tnum font-mono">
          {GOAL_LINES.map((line) => {
            const over = m.over[String(line)];
            const under = 1 - over;
            return (
              <tr key={line} className="border-t border-line/70">
                <td className="py-1.5 font-sans text-ink-muted">{line}</td>
                <td className={`py-1.5 text-right ${over >= under ? "font-semibold text-brand" : "text-ink-muted"}`}>{percent(over)}</td>
                <td className={`py-1.5 text-right ${under > over ? "font-semibold text-brand" : "text-ink-muted"}`}>{percent(under)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-dim">
        Likeliest total: <span className="font-semibold text-ink">{likeliest.label} goals</span> ({percent(likeliest.p)})
      </p>
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
  const scores = prediction.markets.correctScore.slice(0, 9);
  const top = scores[0]?.probability ?? 1;

  return (
    <Panel title="Correct score" hint="Likeliest scorelines">
      <ol className="grid grid-cols-3 gap-2">
        {scores.map((s, i) => (
          <li key={`${s.home}-${s.away}`} className={`rounded-lg px-2 py-2 text-center ${i === 0 ? "bg-violet/10 ring-1 ring-violet/40" : "bg-surface-2"}`}>
            <p className="tnum font-mono text-base font-semibold">
              {s.home}-{s.away}
            </p>
            <p className="tnum text-[11px] text-ink-dim" title={oneIn(s.probability)}>{percent(s.probability, 1)}</p>
          </li>
        ))}
      </ol>
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
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
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
  return <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">{children}</p>;
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
