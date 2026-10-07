import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import type { StatKind, StatMarkets } from "@/lib/model/match-stats";
import { goalMarkets, type GoalMarkets } from "@/lib/model/goal-markets";
import { scoreMatrix } from "@/lib/model/poisson";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "@/lib/model/halves";
import { ProbabilityBar } from "@/components/ui/primitives";
import { percent } from "@/lib/format";

/**
 * Corners, cards, shots and the extra goal markets (docs/stats-markets.md).
 *
 * Probabilities only, never picks. Where the walk-forward test found a market
 * barely better than the league's usual rate (corner totals, goal ranges,
 * exact total, odd/even, GG2+), the panel says so in plain words, so a
 * number that is close to a coin flip never reads like a tip.
 */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        {hint && <span className="shrink-0 text-right text-xs text-ink-dim">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim first:mt-0">{children}</p>;
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3">
      <span className="tnum truncate text-xs text-ink-muted">{label}</span>
      <ProbabilityBar value={value} tone={value > 0.5 ? "brand" : "neutral"} />
      <span className="tnum w-12 text-right text-xs font-semibold">{percent(value)}</span>
    </div>
  );
}

function Tile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg px-3 py-3 text-center ${highlight ? "bg-brand/10" : "bg-surface-2"}`}>
      <p className={`tnum text-lg font-bold ${highlight ? "text-brand" : ""}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-dim">{label}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[11px] leading-relaxed text-ink-dim">{children}</p>;
}

function ThreeWay({
  match, home, draw, away, drawLabel = "Level", labels,
}: { match: Match; home: number; draw: number; away: number; drawLabel?: string; labels?: [string, string, string] }) {
  const best = Math.max(home, draw, away);
  const [lh, ld, la] = labels ?? [match.home.shortName, drawLabel, match.away.shortName];
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile label={lh} value={percent(home)} highlight={home === best} />
      <Tile label={ld} value={percent(draw)} highlight={draw === best} />
      <Tile label={la} value={percent(away)} highlight={away === best} />
    </div>
  );
}

const STAT_COPY: Record<StatKind, { title: string; noun: string; weakTotals: boolean; teamLine: string; hcp: string[] }> = {
  corners: { title: "Corners", noun: "corners", weakTotals: true, teamLine: "4.5", hcp: ["-1.5", "+1.5"] },
  cards: { title: "Cards", noun: "cards", weakTotals: false, teamLine: "1.5", hcp: ["-0.5", "+0.5"] },
  shots: { title: "Shots", noun: "shots", weakTotals: false, teamLine: "12.5", hcp: ["-2.5", "+2.5"] },
  shotsOnTarget: { title: "Shots on target", noun: "on target", weakTotals: false, teamLine: "4.5", hcp: ["-1.5", "+1.5"] },
};

export function StatPanel({ kind, markets, match, referee }: { kind: StatKind; markets: StatMarkets; match: Match; referee?: string | null }) {
  const copy = STAT_COPY[kind];
  const e = markets.expected;
  const lines = Object.entries(markets.over);
  const hcp = copy.hcp.map((l) => [l.replace("+", ""), markets.handicap[l.replace("+", "")]] as const).filter(([, v]) => v);
  return (
    <Section title={copy.title} hint={`${e.home.toFixed(1)} – ${e.away.toFixed(1)} expected`}>
      <Label>Total {copy.noun}</Label>
      <div className="space-y-2.5">
        {lines.map(([line, p]) => (
          <Row key={line} label={`Over ${line}`} value={p} />
        ))}
      </div>
      {copy.weakTotals && (
        <Note>Corner totals are close to a coin flip: how many there are swings with the game. Which side wins more of them is far steadier.</Note>
      )}

      <Label>Most {copy.noun}</Label>
      <ThreeWay match={match} home={markets.result.home} draw={markets.result.draw} away={markets.result.away} />

      <Label>Team {copy.noun}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={`${match.home.shortName} over ${copy.teamLine}`} value={percent(markets.homeOver[copy.teamLine] ?? 0)} />
        <Tile label={`${match.away.shortName} over ${copy.teamLine}`} value={percent(markets.awayOver[copy.teamLine] ?? 0)} />
      </div>

      {hcp.length > 0 && (
        <>
          <Label>Handicap</Label>
          <div className="grid grid-cols-2 gap-2">
            {hcp.map(([line, v]) => (
              <Tile key={line} label={`${match.home.shortName} ${Number(line) > 0 ? "+" : ""}${line}`} value={percent(v!.home)} />
            ))}
          </div>
        </>
      )}
      {kind === "cards" && (
        <Note>
          {referee
            ? `Referee: ${referee}. How often they book is part of these numbers.`
            : "Cards are yellows plus reds, one each. Referee not known yet; these assume a typical one."}
        </Note>
      )}
    </Section>
  );
}

/** Full-time goal markets beyond the main panels. */
export function GoalExtrasPanel({ goals, match }: { goals: GoalMarkets; match: Match }) {
  const eh = goals.euroHandicap["-1"];
  return (
    <Section title="More goal markets" hint="Full time">
      <Label>Team goals</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={`${match.home.shortName} over 0.5`} value={percent(goals.homeOver["0.5"])} />
        <Tile label={`${match.home.shortName} over 1.5`} value={percent(goals.homeOver["1.5"])} />
        <Tile label={`${match.away.shortName} over 0.5`} value={percent(goals.awayOver["0.5"])} />
        <Tile label={`${match.away.shortName} over 1.5`} value={percent(goals.awayOver["1.5"])} />
      </div>

      <Label>Win to nil</Label>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={match.home.shortName} value={percent(goals.winToNil.home)} />
        <Tile label={match.away.shortName} value={percent(goals.winToNil.away)} />
      </div>

      <Label>Handicap {match.home.shortName} -1 (3-way)</Label>
      <ThreeWay
        match={match}
        home={eh.home}
        draw={eh.draw}
        away={eh.away}
        labels={[`${match.home.shortName} by 2+`, `${match.home.shortName} by 1`, `Draw or ${match.away.shortName}`]}
      />

      <Label>Result and both teams to score</Label>
      <div className="space-y-2.5">
        <Row label={`${match.home.shortName} & GG`} value={goals.resultBtts.homeYes} />
        <Row label="Draw & GG" value={goals.resultBtts.drawYes} />
        <Row label={`${match.away.shortName} & GG`} value={goals.resultBtts.awayYes} />
      </div>

      <Label>Result and over 2.5</Label>
      <div className="space-y-2.5">
        <Row label={`${match.home.shortName} & over`} value={goals.resultOver25.homeOver} />
        <Row label="Draw & over" value={goals.resultOver25.drawOver} />
        <Row label={`${match.away.shortName} & over`} value={goals.resultOver25.awayOver} />
      </div>

      <Label>Goal ranges and specials</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="GG2+ (both 2+)" value={percent(goals.gg2)} />
        <Tile label="1-3 goals" value={percent(goals.multiGoal["1-3"])} />
        <Tile label="2-3 goals" value={percent(goals.multiGoal["2-3"])} />
        <Tile label="Odd total" value={percent(goals.odd)} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {Object.entries(goals.exactTotal).map(([k, v]) => (
          <Tile key={k} label={`${k} goal${k === "1" ? "" : "s"}`} value={percent(v)} />
        ))}
      </div>
      <Note>Goal ranges, exact total, GG2+ and odd/even are close to a coin flip: even the bookmakers&apos; closing prices barely beat the league average on them.</Note>
    </Section>
  );
}

/** The half-by-half goal markets. Pro, alongside the half-time panel. */
export function HalfExtrasPanel({ prediction }: { prediction: Prediction }) {
  const { home: lam, away: mu } = prediction.markets.expectedGoals;
  const g = goalMarkets(
    scoreMatrix(lam, mu, prediction.model.rho),
    halfGrids(lam, mu, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT, SITE_SECOND_HALF_TILT),
  );
  const { match } = prediction;
  const ah = g.firstHalfHandicap;
  return (
    <Section title="Half by half" hint="Goals in each half">
      <Label>Second-half result</Label>
      <ThreeWay match={match} home={g.secondHalf.home} draw={g.secondHalf.draw} away={g.secondHalf.away} drawLabel="Draw" />

      <Label>First-half handicap ({match.home.shortName})</Label>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="-1.5" value={percent(ah["-1.5"].home)} />
        <Tile label="-0.5" value={percent(ah["-0.5"].home)} />
        <Tile label="+0.5" value={percent(ah["+0.5"].home)} />
      </div>

      <Label>Win either half</Label>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={match.home.shortName} value={percent(g.winEitherHalf.home)} />
        <Tile label={match.away.shortName} value={percent(g.winEitherHalf.away)} />
      </div>

      <Label>Win both halves</Label>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={match.home.shortName} value={percent(g.winBothHalves.home)} />
        <Tile label={match.away.shortName} value={percent(g.winBothHalves.away)} />
      </div>

      <Label>Score in both halves</Label>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={match.home.shortName} value={percent(g.scoreBothHalves.home)} />
        <Tile label={match.away.shortName} value={percent(g.scoreBothHalves.away)} />
      </div>

      <Label>Each half</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={`${match.home.shortName} scores 1st half`} value={percent(g.homeScores.first)} />
        <Tile label={`${match.away.shortName} scores 2nd half`} value={percent(g.awayScores.second)} />
        <Tile label="Goal in both halves" value={percent(g.bothHalvesOver05)} />
        <Tile label="Both teams score 2nd half" value={percent(g.bttsSecondHalf)} />
      </div>
      <Note>A goal in both halves and second-half GG are close to a coin flip; the rest beat the league average clearly in testing.</Note>
    </Section>
  );
}
