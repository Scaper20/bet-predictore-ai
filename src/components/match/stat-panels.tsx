import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import type { StatKind, StatMarkets } from "@/lib/model/match-stats";
import { goalMarkets, type GoalMarkets } from "@/lib/model/goal-markets";
import { scoreMatrix } from "@/lib/model/poisson";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "@/lib/model/halves";
import { Ask, AskList, More, Pick3 } from "@/components/match/likelihood";

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
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        {hint && <span className="shrink-0 text-right text-xs text-ink-dim">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim first:mt-0">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">{children}</p>;
}

const STAT_COPY: Record<StatKind, { title: string; noun: string; weakTotals: boolean; teamLine: string; hcp: string[] }> = {
  corners: { title: "Corners", noun: "corners", weakTotals: true, teamLine: "4.5", hcp: ["-1.5", "+1.5"] },
  cards: { title: "Cards", noun: "cards", weakTotals: false, teamLine: "1.5", hcp: ["-0.5", "+0.5"] },
  shots: { title: "Shots", noun: "shots", weakTotals: false, teamLine: "12.5", hcp: ["-2.5", "+2.5"] },
  shotsOnTarget: { title: "Shots on target", noun: "shots on target", weakTotals: false, teamLine: "4.5", hcp: ["-1.5", "+1.5"] },
};

/** "Over 8.5" read as "9 or more". */
const atLeast = (line: string) => Math.floor(Number(line)) + 1;

export function StatPanel({ kind, markets, match, referee }: { kind: StatKind; markets: StatMarkets; match: Match; referee?: string | null }) {
  const copy = STAT_COPY[kind];
  const e = markets.expected;
  const lines = Object.entries(markets.over);
  // The three lines around the expected total up front; the rest folded.
  const mid = lines.reduce((bi, [, p], i) => (Math.abs(p - 0.5) < Math.abs(lines[bi][1] - 0.5) ? i : bi), 0);
  const from = Math.max(0, Math.min(mid - 1, lines.length - 3));
  const main = lines.slice(from, from + 3);
  const rest = lines.filter((l) => !main.includes(l));
  const hcp = copy.hcp.map((l) => [l.replace("+", ""), markets.handicap[l.replace("+", "")]] as const).filter(([, v]) => v);
  const h = match.home.shortName;
  const a = match.away.shortName;
  return (
    <Section title={copy.title} hint={`About ${Math.round(e.total)} expected`}>
      <Label>Who gets more</Label>
      <Pick3
        items={[
          { label: h, p: markets.result.home },
          { label: "Level", p: markets.result.draw },
          { label: a, p: markets.result.away },
        ]}
      />

      <Label>How many</Label>
      <AskList>
        {main.map(([line, p]) => (
          <Ask key={line} q={`${atLeast(line)} or more ${copy.noun}`} sub={`Over ${line}`} p={p} />
        ))}
      </AskList>
      {copy.weakTotals && <Note>Corner totals swing with the game, so treat them as close calls. Which side wins more corners is far steadier.</Note>}
      {kind === "cards" && (
        <Note>
          {referee ? `Referee: ${referee}. How often they book is part of these numbers.` : "Yellows and reds count one each. Referee not known yet; these assume a typical one."}
        </Note>
      )}

      <More title={`More ${copy.noun} markets`}>
        <AskList>
          {rest.map(([line, p]) => (
            <Ask key={line} q={`${atLeast(line)} or more ${copy.noun}`} sub={`Over ${line}`} p={p} />
          ))}
          <Ask q={`${h}: ${atLeast(copy.teamLine)} or more`} sub={`${h} over ${copy.teamLine}`} p={markets.homeOver[copy.teamLine] ?? 0} />
          <Ask q={`${a}: ${atLeast(copy.teamLine)} or more`} sub={`${a} over ${copy.teamLine}`} p={markets.awayOver[copy.teamLine] ?? 0} />
          {hcp.map(([line, v]) => {
            const n = Number(line);
            const q = n < 0 ? `${h} get ${Math.ceil(-n)}+ more than ${a}` : `${h} get no more than ${Math.floor(n)} fewer`;
            return <Ask key={line} q={q} sub={`Handicap ${h} ${n > 0 ? "+" : ""}${line}`} p={v!.home} />;
          })}
        </AskList>
      </More>
    </Section>
  );
}

/** Full-time goal markets beyond the main panels. */
export function GoalExtrasPanel({ goals, match }: { goals: GoalMarkets; match: Match }) {
  const eh = goals.euroHandicap["-1"];
  const h = match.home.shortName;
  const a = match.away.shortName;
  return (
    <Section title="More goal markets" hint="Full time">
      <AskList>
        <Ask q={`Will ${h} score?`} sub={`${h} over 0.5`} p={goals.homeOver["0.5"]} />
        <Ask q={`Will ${a} score?`} sub={`${a} over 0.5`} p={goals.awayOver["0.5"]} />
        <Ask q={`${h} score 2 or more?`} sub={`${h} over 1.5`} p={goals.homeOver["1.5"]} />
        <Ask q={`${a} score 2 or more?`} sub={`${a} over 1.5`} p={goals.awayOver["1.5"]} />
        <Ask q={`${h} win without conceding?`} sub="Win to nil" p={goals.winToNil.home} />
        <Ask q={`${a} win without conceding?`} sub="Win to nil" p={goals.winToNil.away} />
      </AskList>

      <Label>Winning margin ({h} −1, 3-way)</Label>
      <Pick3
        items={[
          { label: `${h} by 2+`, p: eh.home },
          { label: `${h} by 1`, p: eh.draw },
          { label: `Draw or ${a}`, p: eh.away },
        ]}
      />

      <More title="Result combos">
        <AskList>
          <Ask q={`${h} win and both score`} p={goals.resultBtts.homeYes} />
          <Ask q="Draw and both score" p={goals.resultBtts.drawYes} />
          <Ask q={`${a} win and both score`} p={goals.resultBtts.awayYes} />
          <Ask q={`${h} win and 3+ goals`} sub="Result and over 2.5" p={goals.resultOver25.homeOver} />
          <Ask q="Draw and 3+ goals" sub="Result and over 2.5" p={goals.resultOver25.drawOver} />
          <Ask q={`${a} win and 3+ goals`} sub="Result and over 2.5" p={goals.resultOver25.awayOver} />
        </AskList>
      </More>

      <More title="Specials (close calls)">
        <AskList>
          <Ask q="1 to 3 goals" p={goals.multiGoal["1-3"]} />
          <Ask q="2 or 3 goals" p={goals.multiGoal["2-3"]} />
          <Ask q="Both teams score 2+" p={goals.gg2} />
          <Ask q="Odd number of goals" p={goals.odd} />
        </AskList>
        <Note>Goal ranges, both teams 2+ and odd/even sit close to a coin flip: even closing market prices barely beat the league average on them.</Note>
      </More>
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
  const h = match.home.shortName;
  const a = match.away.shortName;
  return (
    <Section title="Half by half" hint="Goals in each half">
      <Label>Second-half result</Label>
      <Pick3
        items={[
          { label: h, p: g.secondHalf.home },
          { label: "Draw", p: g.secondHalf.draw },
          { label: a, p: g.secondHalf.away },
        ]}
      />
      <div className="mt-3">
        <AskList>
          <Ask q={`${h} win either half`} p={g.winEitherHalf.home} />
          <Ask q={`${a} win either half`} p={g.winEitherHalf.away} />
          <Ask q={`${h} score in the 1st half`} p={g.homeScores.first} />
          <Ask q={`${a} score in the 2nd half`} p={g.awayScores.second} />
        </AskList>
      </div>
      <More title="More half markets">
        <AskList>
          <Ask q={`${h} win both halves`} p={g.winBothHalves.home} />
          <Ask q={`${a} win both halves`} p={g.winBothHalves.away} />
          <Ask q={`${h} score in both halves`} p={g.scoreBothHalves.home} />
          <Ask q={`${a} score in both halves`} p={g.scoreBothHalves.away} />
          <Ask q={`${h} lead at half time by 2+`} sub="1st-half handicap −1.5" p={ah["-1.5"].home} />
          <Ask q={`${h} lead at half time`} sub="1st-half handicap −0.5" p={ah["-0.5"].home} />
          <Ask q={`${h} not behind at half time`} sub="1st-half handicap +0.5" p={ah["+0.5"].home} />
          <Ask q="A goal in both halves" p={g.bothHalvesOver05} />
          <Ask q="Both teams score in the 2nd half" p={g.bttsSecondHalf} />
        </AskList>
        <Note>A goal in both halves and both teams scoring in the second half are close calls; the rest beat the league average clearly in testing.</Note>
      </More>
    </Section>
  );
}
