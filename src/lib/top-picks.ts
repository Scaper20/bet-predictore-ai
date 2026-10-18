/**
 * The three picks a match page leads with: the headline pick, then the best
 * of what is left from other kinds of market. Each carries a short reason
 * (a run or a count taken from the recent games, never the model's own
 * number restated), sibling lines of the same idea, and a one-line why.
 * Pure, so the wording is testable; the page component only draws it.
 */

import type { FormEntry, Pick, Prediction } from "@/lib/model/predict";
import type { StatMarkets } from "@/lib/model/match-stats";
import { evaluatePick } from "@/lib/settlement";
import { sweetSpotLabel } from "@/lib/model/sweet-spots";

export interface Variation {
  label: string;
  probability: number;
}

export interface TopPick {
  market: string;
  label: string;
  group: Pick["group"];
  probability: number;
  /** The headline pick, so the page can badge it. */
  headline: boolean;
  /** "5-match winning run", "Over 1.5 in 9 of the last 12 games". */
  reasons: string[];
  /** Neighbouring lines or the same idea in another market. */
  variations: Variation[];
  why: string;
  /** Once the game is over. */
  outcome?: "win" | "lose" | "push";
  /**
   * While the game is on: settled already ("won" once Over 1.5 has its two
   * goals; "lost" once Under 2.5 has its third), or how it stands on the score
   * now. Absent before kick-off and for corners, which the score cannot tell.
   */
  live?: LiveState;
}

export type LiveState = "won" | "lost" | "winning" | "losing" | "level";

/**
 * A goal pick against the score so far. Goals only ever go up, so a total
 * already past an over line has won and past an under line has lost, and both
 * teams having scored settles that market; every other pick is only "winning"
 * or "losing" until full time.
 */
export function liveState(market: string, home: number, away: number): LiveState | null {
  const [family, side, l] = market.split(":");
  const total = home + away;
  if (family === "ou") {
    const n = Number(l);
    if (total > n) return side === "over" ? "won" : "lost";
    return side === "over" ? "losing" : "winning";
  }
  if (family === "btts") {
    const both = home > 0 && away > 0;
    if (both) return side === "yes" ? "won" : "lost";
    return side === "yes" ? "losing" : "winning";
  }
  const now = evaluatePick(market, home, away);
  if (!now) return null;
  return now === "win" ? "winning" : now === "lose" ? "losing" : "level";
}

export interface TopPicksInput {
  prediction: Prediction;
  /** Corners and the other count markets; Pro only, absent otherwise. */
  corners?: StatMarkets | null;
}

const MAX_PICKS = 3;
const MAX_VARIATIONS = 3;
/** Short of this a pick is not worth leading with; past it, not worth taking. */
const MIN_EXTRA = 0.66;
const MAX_EXTRA = 0.88;

type Family = "result" | "goals" | "btts" | "corners";

function familyOf(market: string): Family {
  const f = market.split(":")[0];
  if (f === "ou") return "goals";
  if (f === "btts") return "btts";
  if (f === "corners") return "corners";
  return "result";
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const line = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Games in a row, newest first, for which `test` holds. */
function run(entries: readonly FormEntry[], test: (e: FormEntry) => boolean): number {
  let n = 0;
  for (const e of entries) {
    if (!test(e)) break;
    n++;
  }
  return n;
}

function sideReason(form: readonly FormEntry[], other: readonly FormEntry[], team: string): string | null {
  const wins = run(form, (e) => e.result === "W");
  if (wins >= 3) return `${team} on a ${wins}-match winning run`;
  const unbeaten = run(form, (e) => e.result !== "L");
  if (unbeaten >= 4) return `${team} unbeaten in ${unbeaten}`;
  const oppWinless = run(other, (e) => e.result !== "W");
  return oppWinless >= 4 ? `Opponent winless in ${oppWinless}` : null;
}

function reasonsFor(p: Pick, pr: Prediction, corners: StatMarkets | null | undefined): string[] {
  const { home, away } = pr.form;
  const hName = pr.match.home.name;
  const aName = pr.match.away.name;
  const both = [...home.entries, ...away.entries];
  const out: string[] = [];
  const [family, a, b] = p.market.split(":");

  const homeSide = p.market === "1x2:home" || p.market === "dc:home-draw" || (family === "ah" && a === "home");
  const awaySide = p.market === "1x2:away" || p.market === "dc:away-draw" || (family === "ah" && a === "away");
  if (homeSide) {
    const r = sideReason(home.entries, away.entries, hName);
    if (r) out.push(r);
  } else if (awaySide) {
    const r = sideReason(away.entries, home.entries, aName);
    if (r) out.push(r);
  } else if (p.market === "dc:home-away" && both.length >= 8) {
    const draws = both.filter((e) => e.result === "D").length;
    if (draws <= both.length / 5) out.push(`${draws === 0 ? "No" : `Only ${draws}`} ${draws === 1 ? "draw" : "draws"} in their last ${both.length} games`);
  } else if (family === "ou" && both.length >= 8) {
    const n = Number(b);
    const hit = both.filter((e) => (a === "over" ? e.goalsFor + e.goalsAgainst > n : e.goalsFor + e.goalsAgainst < n)).length;
    if (hit / both.length >= 0.7) out.push(`${a === "over" ? "Over" : "Under"} ${line(n)} in ${hit} of the last ${both.length} games`);
  } else if (family === "btts" && both.length >= 8) {
    const scored = both.filter((e) => e.goalsFor > 0 && e.goalsAgainst > 0).length;
    const hit = a === "yes" ? scored : both.length - scored;
    if (hit / both.length >= 0.65) out.push(`Both teams ${a === "yes" ? "scored" : "did not both score"} in ${hit} of the last ${both.length}`);
  }

  const xg = pr.markets.expectedGoals;
  if (family === "corners") {
    // Goals say nothing about a corners pick; the count model's own projection does.
    if (corners) out.push(`${corners.expected.total.toFixed(1)} corners projected`);
  } else if (family === "ou" || family === "btts") out.push(`${xg.total.toFixed(1)} goals projected`);
  else if (out.length === 0) out.push(`Expected goals ${xg.home.toFixed(1)} – ${xg.away.toFixed(1)}`);
  return out.slice(0, 2);
}

function whyFor(p: Pick, pr: Prediction, corners: StatMarkets | null | undefined): string {
  const hName = pr.match.home.name;
  const aName = pr.match.away.name;
  const xg = pr.markets.expectedGoals;
  const shown = pct(p.probability);
  const [family, a, b] = p.market.split(":");
  const projected = `${hName} are projected ${xg.home.toFixed(1)} goals to ${aName}'s ${xg.away.toFixed(1)}`;
  switch (p.market) {
    case "1x2:home":
      return `${projected}, and win ${shown} of simulated games.`;
    case "1x2:away":
      return `${projected}, and ${aName} win ${shown} of simulated games.`;
    case "dc:home-draw":
      return `${projected}, so ${hName} avoid defeat in ${shown} of simulated games.`;
    case "dc:away-draw":
      return `${projected}, so ${aName} avoid defeat in ${shown} of simulated games.`;
    case "dc:home-away":
      return `A draw is only ${pct(pr.markets.draw)} likely here, so one side wins in ${shown} of simulated games.`;
    default:
  }
  if (family === "ou") {
    return `${xg.total.toFixed(1)} goals are projected, and ${a} ${line(Number(b))} lands in ${shown} of simulated scorelines.`;
  }
  if (family === "btts") {
    return a === "yes"
      ? `Both sides are expected to find the net (${xg.home.toFixed(1)} and ${xg.away.toFixed(1)} goals projected), which happens in ${shown} of simulated games.`
      : `At least one side is likely to be shut out (${pct(pr.markets.cleanSheet.home)} for a ${hName} clean sheet, ${pct(pr.markets.cleanSheet.away)} for ${aName}), in ${shown} of simulated games.`;
  }
  if (family === "ah") {
    return `${projected}. This handicap line holds in ${shown} of simulated games once a refund is set aside.`;
  }
  if (family === "corners") {
    return `${corners ? corners.expected.total.toFixed(1) : "About ten"} corners are projected, and ${a} ${b} lands in ${shown} of simulated games.`;
  }
  return `${projected}; the model puts this at ${shown}.`;
}

function variationsFor(p: Pick, pr: Prediction, corners: StatMarkets | null | undefined): Variation[] {
  const out: Variation[] = [];
  const at = (market: string) => pr.picks.find((x) => x.market === market);
  const add = (v: Variation | null) => {
    if (v && v.probability >= 0.45 && v.probability <= 0.92 && v.label !== p.label) out.push(v);
  };
  const ofMarket = (market: string): Variation | null => {
    const x = at(market);
    return x ? { label: x.label, probability: x.probability } : null;
  };
  const [family, a, b] = p.market.split(":");

  if (family === "ou") {
    const n = Number(b);
    const step = a === "over" ? [n - 1, n + 1] : [n + 1, n - 1];
    for (const l of step) add(ofMarket(`ou:${a}:${l}`));
  } else if (family === "btts") {
    for (const m of a === "yes" ? ["ou:over:1.5", "ou:over:2.5"] : ["ou:under:2.5", "ou:under:3.5"]) add(ofMarket(m));
  } else if (family === "corners" && corners) {
    const hName = pr.match.home.name;
    const aName = pr.match.away.name;
    const teamLines = (over: Record<string, number>, name: string) => {
      const best = Object.entries(over)
        .map(([l, v]) => ({ l, v }))
        .filter((x) => x.v >= 0.6 && x.v <= 0.95)
        .sort((x, y) => Math.abs(x.v - 0.75) - Math.abs(y.v - 0.75))[0];
      if (best) add({ label: `${name} over ${best.l} corners`, probability: best.v });
    };
    teamLines(corners.homeOver, hName);
    teamLines(corners.awayOver, aName);
  } else if (family === "1x2" && a !== "draw") {
    add(ofMarket(a === "home" ? "dc:home-draw" : "dc:away-draw"));
  } else if (family === "dc" && a !== "home-away") {
    add(ofMarket(a === "home-draw" ? "1x2:home" : "1x2:away"));
    add(ofMarket("ou:over:1.5"));
  } else if (family === "dc") {
    add(ofMarket("ou:over:1.5"));
  } else if (family === "ah") {
    const x = at(a === "home" ? "dc:home-draw" : "dc:away-draw");
    if (x) add({ label: x.label, probability: x.probability });
  }
  return out.slice(0, MAX_VARIATIONS);
}

/** The best count-market line: likely enough to lead with, not a near-certainty. */
function cornersPick(c: StatMarkets): Pick | null {
  let best: { market: string; label: string; p: number } | null = null;
  for (const [l, over] of Object.entries(c.over)) {
    for (const [side, p] of [["over", over], ["under", 1 - over]] as const) {
      if (p < 0.72 || p > MAX_EXTRA) continue;
      if (!best || Math.abs(p - 0.78) < Math.abs(best.p - 0.78)) {
        best = { market: `corners:${side}:${l}`, label: `${side === "over" ? "Over" : "Under"} ${l} corners`, p };
      }
    }
  }
  return best ? { market: best.market, label: best.label, group: "Corners", probability: best.p, fairOdds: 1 / best.p, confidence: 0 } : null;
}

export function buildTopPicks({ prediction: pr, corners }: TopPicksInput): TopPick[] {
  const head = pr.topPick;
  if (!head || head.market === "locked" || !pr.sufficiency.publishable) return [];

  const chosen: Pick[] = [head];
  const taken = new Set<Family>([familyOf(head.market)]);

  const candidates = pr.picks
    .filter((x) => x.market !== head.market && x.group !== "Asian Handicap" && x.group !== "Correct Score" && x.probability >= MIN_EXTRA && x.probability <= MAX_EXTRA)
    // The unders and no-draw lines the headline rules keep out stay out here too.
    .filter((x) => x.market !== "dc:home-away" || head.market === "dc:home-away")
    .sort((x, y) => y.confidence - x.confidence);
  const stat = corners ? cornersPick(corners) : null;
  // Corners compete on probability alone, so it gets one slot at most, after a goal pick.
  for (const x of candidates) {
    if (chosen.length >= MAX_PICKS) break;
    const fam = familyOf(x.market);
    if (taken.has(fam)) continue;
    // Both teams to score "no" beside an over line says two things at once.
    if (x.market === "btts:no" && chosen.some((c) => c.market.startsWith("ou:over"))) continue;
    if (x.market.startsWith("ou:over") && chosen.some((c) => c.market === "btts:no")) continue;
    chosen.push(x);
    taken.add(fam);
  }
  if (stat && chosen.length < MAX_PICKS && !taken.has("corners")) chosen.push(stat);

  const finished = pr.match.status === "finished" && pr.match.score.home !== null && pr.match.score.away !== null;
  const inPlay = (pr.match.status === "live" || pr.match.status === "halftime") && pr.match.score.home !== null && pr.match.score.away !== null;
  const withLive = (market: string, h: number, a: number) => {
    const live = liveState(market, h, a);
    return live ? { live } : {};
  };
  return chosen.map((p) => {
    const outcome = finished && familyOf(p.market) !== "corners" ? evaluatePick(p.market, pr.match.score.home ?? 0, pr.match.score.away ?? 0) : null;
    return {
      market: p.market,
      label: p.group === "Asian Handicap" ? sweetSpotLabel(p.market) : p.label,
      group: p.group,
      probability: p.probability,
      headline: p === head,
      reasons: reasonsFor(p, pr, corners),
      variations: variationsFor(p, pr, corners),
      why: whyFor(p, pr, corners),
      ...(outcome ? { outcome } : {}),
      ...(inPlay && familyOf(p.market) !== "corners" ? withLive(p.market, pr.match.score.home ?? 0, pr.match.score.away ?? 0) : {}),
    };
  });
}
