/**
 * The three picks a match page leads with: the headline pick, then the best
 * of what is left from other kinds of market. Each carries a short reason
 * (a run or a count taken from the recent games, never the model's own
 * number restated), sibling lines of the same idea, and a one-line why.
 * Pure, so the wording is testable; the page component only draws it.
 */

import type { FormEntry, Pick, Prediction } from "@/lib/model/predict";
import type { StatMarkets } from "@/lib/model/match-stats";
import { gradePick, halftimeOf } from "@/lib/pick-grade";
import { sweetSpotLabel } from "@/lib/model/sweet-spots";
import { isPausedPick } from "@/lib/model/paused";
import { bestListedLine, type ListedLine } from "@/lib/board-pick";
import { LEG_MARKET_GAP } from "@/lib/market-check";
import { NEXT_MODEL_FROM } from "@/lib/model/params";

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

import { liveState, type LiveState } from "@/lib/live-state";

export { liveState, type LiveState };

export interface TopPicksInput {
  prediction: Prediction;
  /** Corners and the other count markets; Pro only, absent otherwise. */
  corners?: StatMarkets | null;
  /**
   * The stat lines SportyBet lists on the game, priced by the model
   * (sportybet-lines.ts listedLinesFor): the corners pick is chosen among
   * them. Null when the game isn't on SportyBet; absent when not looked up.
   */
  listed?: ListedLine[] | null;
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

/**
 * How far from the projected total a corners line may sit. A line far from
 * the game's own count ("Under 12.5" on a 9-corner game) is likely, but it
 * reads as no opinion at all; walk-forward over 13,000 games
 * (scripts/corner-realism.ts) every line is calibrated within about two
 * points, so the nearer lines lose no honesty.
 */
const CORNER_REACH = 3;

/**
 * The best corners total: likely enough to lead with, not a near-certainty,
 * and, where SportyBet lists the game, one of the totals it lists (it sets
 * them near the middle, so often none qualifies and the slot stays empty).
 */
function cornersPick(c: StatMarkets, listed?: ListedLine[] | null): Pick | null {
  if (listed) {
    const totals = listed.filter((l) => /^corners:(over|under):/.test(l.market));
    const best = bestListedLine(totals, { gap: LEG_MARKET_GAP, floor: 0.72, cap: MAX_EXTRA });
    return best ? { market: best.market, label: best.label, group: "Corners", probability: best.probability, fairOdds: 1 / best.probability, confidence: 0 } : null;
  }
  let best: { market: string; label: string; p: number } | null = null;
  for (const [l, over] of Object.entries(c.over)) {
    if (Math.abs(Number(l) - c.expected.total) > CORNER_REACH) continue;
    for (const [side, p] of [["over", over], ["under", 1 - over]] as const) {
      if (p < 0.72 || p > MAX_EXTRA) continue;
      if (!best || Math.abs(p - 0.78) < Math.abs(best.p - 0.78)) {
        best = { market: `corners:${side}:${l}`, label: `${side === "over" ? "Over" : "Under"} ${l} corners`, p };
      }
    }
  }
  return best ? { market: best.market, label: best.label, group: "Corners", probability: best.p, fairOdds: 1 / best.p, confidence: 0 } : null;
}


/**
 * From this kickoff the page leads with picks in a fixed order (CTO review
 * follow-up, 5 Nov 2026): the match result or double chance, then a goals
 * line when one is favoured, then the likeliest unusual market, always three,
 * and a fourth only when another unusual market is very likely. It is gated on
 * KICKOFF, like the model parameters (model/params.ts), so a game people have
 * already seen keeps the picks it was published with. 00:00 Lagos on 6 Nov.
 */
export const TOP_PICKS_ORDER_FROM = Math.max(NEXT_MODEL_FROM, Date.parse("2026-11-06T00:00:00+01:00"));

const ORDER_FLOOR = 0.66;
const ORDER_RELAXED_FLOOR = 0.55;
const ORDER_CAP = 0.88;
/** The rare fourth pick: an unusual market this likely, and no more than the cap. */
const FOURTH_FLOOR = 0.85;

type Slot = "result" | "goals" | "exotic";
const SLOT_RANK: Record<Slot, number> = { result: 0, goals: 1, exotic: 2 };

function slotOf(market: string): Slot {
  const f = market.split(":")[0];
  if (f === "1x2" || f === "dc") return "result";
  if (f === "ou") return "goals";
  return "exotic";
}

/** Two picks that say opposite things, or the same thing twice. */
function conflicts(x: Pick, chosen: readonly Pick[]): boolean {
  const has = (re: RegExp) => chosen.some((c) => re.test(c.market));
  const m = x.market;
  if (m === "btts:no" && has(/^ou:over:/)) return true;
  if (m.startsWith("ou:over:") && has(/^btts:no$/)) return true;
  if (m === "btts:yes" && has(/^ou:under:/)) return true;
  if (m.startsWith("ou:under:") && has(/^btts:yes$/)) return true;
  // "0-3 goals" against "over 3.5".
  if (/^raw:450001:/.test(m) && has(/^ou:over:3\.5$/)) return true;
  if (m === "ou:over:3.5" && has(/^raw:450001:/)) return true;
  return false;
}

/** The picks as they were published, in the order they were published. */
function frozenPicks(pr: Prediction, head: Pick): Pick[] {
  return (pr.frozenTopPicks ?? []).map((f) => {
    const live = pr.picks.find((x) => x.market === f.market);
    return {
      market: f.market,
      label: f.label,
      group: f.group,
      probability: f.probability,
      fairOdds: f.probability > 0 ? 1 / f.probability : 0,
      confidence: live?.confidence ?? (f.market === head.market ? head.confidence : 0),
    };
  });
}

export function orderedPicks(pr: Prediction, head: Pick): Pick[] {
  if (pr.frozenTopPicks?.length) return frozenPicks(pr, head);

  const pool = pr.picks.filter(
    (x) =>
      x.market !== head.market &&
      x.group !== "Asian Handicap" &&
      x.group !== "Correct Score" &&
      x.market !== "1x2:draw" &&
      (x.market !== "dc:home-away" || head.market === "dc:home-away") &&
      !isPausedPick(x.market) &&
      !/^ou:(over|under):(0\.5|4\.5)$/.test(x.market),
  );
  const inBand = (x: Pick, floor: number) => x.probability >= floor && x.probability <= ORDER_CAP;
  const byConfidence = (a: Pick, b: Pick) => b.confidence - a.confidence;
  const byChance = (a: Pick, b: Pick) => b.probability - a.probability;

  const chosen: Pick[] = [head];
  const filled = new Set<Slot>([slotOf(head.market)]);
  const take = (list: Pick[]): boolean => {
    const x = list.find((c) => !chosen.includes(c) && !conflicts(c, chosen));
    if (!x) return false;
    chosen.push(x);
    filled.add(slotOf(x.market));
    return true;
  };
  const slot = (s: Slot, floor: number) => pool.filter((x) => slotOf(x.market) === s && inBand(x, floor));

  // 1. The match result or double chance, the model's own ranking among them.
  if (!filled.has("result") && !take(slot("result", ORDER_FLOOR).sort(byConfidence))) take(slot("result", ORDER_RELAXED_FLOOR).sort(byConfidence));
  // 2. A goals line, only when one is favoured.
  if (!filled.has("goals")) take(slot("goals", ORDER_FLOOR).sort(byConfidence));
  // 3. The likeliest unusual market.
  if (!filled.has("exotic") && !take(slot("exotic", ORDER_FLOOR).sort(byChance))) take(slot("exotic", ORDER_RELAXED_FLOOR).sort(byChance));

  // Always three: what is still missing, kind by kind, then any unusual market.
  for (const s of ["result", "goals", "exotic"] as const) {
    if (chosen.length >= 3) break;
    if (!filled.has(s)) take(slot(s, ORDER_RELAXED_FLOOR).sort(s === "exotic" ? byChance : byConfidence));
  }
  while (chosen.length < 3 && take(slot("exotic", ORDER_RELAXED_FLOOR).sort(byChance))) {
    /* keeps taking the next likeliest unusual market */
  }
  // Last resorts, so a game never shows two: the half-goal handicaps, then anything
  // still likely enough to be a reasonable lean that does not contradict the rest.
  if (chosen.length < 3) {
    const handicaps = pr.picks.filter((x) => x.group === "Asian Handicap" && !isPausedPick(x.market) && !chosen.includes(x) && x.probability >= 0.5 && x.probability <= ORDER_CAP);
    while (chosen.length < 3 && take(handicaps.sort(byChance))) {
      /* the likeliest handicap first */
    }
  }
  if (chosen.length < 3) {
    const rest = pool.filter((x) => x.probability >= 0.45 && x.probability <= ORDER_CAP).sort(byChance);
    while (chosen.length < 3 && take(rest)) {
      /* the likeliest of what is left */
    }
  }

  // A fourth, rarely: another unusual market that is very likely.
  if (chosen.length === 3 && filled.size === 3) take(slot("exotic", FOURTH_FLOOR).sort(byChance));

  return chosen
    .map((p, i) => ({ p, i }))
    .sort((a, b) => SLOT_RANK[slotOf(a.p.market)] - SLOT_RANK[slotOf(b.p.market)] || a.i - b.i)
    .map((x) => x.p);
}

/** How the three were chosen before the ordered rule: the headline, then the best of other kinds of market. */
function legacyPicks(pr: Prediction, head: Pick, corners: StatMarkets | null | undefined, listed: ListedLine[] | null | undefined): Pick[] {
  const chosen: Pick[] = [head];
  const taken = new Set<Family>([familyOf(head.market)]);

  const candidates = pr.picks
    .filter((x) => x.market !== head.market && x.group !== "Asian Handicap" && x.group !== "Correct Score" && x.probability >= MIN_EXTRA && x.probability <= MAX_EXTRA)
    // What the headline rules keep out stays out here too: the paused unders, the
    // 0.5 and 4.5 goal lines (near-certain or long shots), and no-draw unless it is the pick.
    .filter((x) => !isPausedPick(x.market) && !/^ou:(over|under):(0\.5|4\.5)$/.test(x.market))
    .filter((x) => x.market !== "dc:home-away" || head.market === "dc:home-away")
    .sort((x, y) => y.confidence - x.confidence);
  const stat = corners ? cornersPick(corners, listed) : null;
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
  return chosen;
}

export function buildTopPicks({ prediction: pr, corners, listed }: TopPicksInput): TopPick[] {
  const head = pr.topPick;
  if (!head || head.market === "locked" || !pr.sufficiency.publishable) return [];

  const chosen = Date.parse(pr.match.kickoff) >= TOP_PICKS_ORDER_FROM ? orderedPicks(pr, head) : legacyPicks(pr, head, corners, listed);

  const finished = pr.match.status === "finished" && pr.match.score.home !== null && pr.match.score.away !== null;
  const inPlay = (pr.match.status === "live" || pr.match.status === "halftime") && pr.match.score.home !== null && pr.match.score.away !== null;
  const withLive = (market: string, h: number, a: number) => {
    const live = liveState(market, h, a);
    return live ? { live } : {};
  };
  return chosen.map((p) => {
    const outcome = finished && familyOf(p.market) !== "corners" ? gradePick(p.market, pr.match.score.home ?? 0, pr.match.score.away ?? 0, halftimeOf(pr.match.halftime)) : null;
    return {
      market: p.market,
      label: p.group === "Asian Handicap" ? sweetSpotLabel(p.market) : p.label,
      group: p.group,
      probability: p.probability,
      headline: p.market === head.market,
      reasons: reasonsFor(p, pr, corners),
      variations: variationsFor(p, pr, corners),
      why: whyFor(p, pr, corners),
      ...(outcome ? { outcome } : {}),
      ...(inPlay && familyOf(p.market) !== "corners" ? withLive(p.market, pr.match.score.home ?? 0, pr.match.score.away ?? 0) : {}),
    };
  });
}
