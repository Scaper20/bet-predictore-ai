/**
 * Sweet spots: the selections that, above a set chance, have landed at least
 * 82% of the time, in a season they were not chosen on. Where one applies it
 * becomes the KiqStat pick for the game; elsewhere the usual ranking stands.
 *
 * Found by scripts/niche-lab.ts (--ship): 12,749 games in the 17 divisions
 * below, replayed walk-forward, with only the models the site runs. For each
 * selection, the lowest chance at which its 2024-25 record reached its target
 * (100+ picks), then scored on 2025-26:
 *
 *   result, double chance, over 1.5, +-1.5 handicaps    82.0% landed
 *   + whole-line handicaps (+1, +2, draw no bet)        82.5%
 *   + Under 12.5 corners, shots and on-target fillers    82.8%  (94.5% of weeks at 75%+)
 *
 * against 75.6% for the usual ranking (6,820 games). The same rules landed
 * 82-84% on 2024-25. Win rate is bought with shorter prices: fair odds of
 * about 1.24 against 1.37. SWEET_SPOT_MAX keeps every pick at fair odds of
 * 1.18 or more.
 *
 * Two tiers. SWEET_SPOTS compete, the strongest record taking the game; Under
 * 12.5 corners is among them because it held 84.4% on its own. Shots and
 * shots-on-target rules (SWEET_SPOT_FILLERS) held 81-89% but rarely beat the
 * picks above, so they only take a game no rule above covers. Of the other
 * corners variants tested (team corners, corner handicaps, most corners), none
 * held 82% on 2025-26 with real volume.
 *
 * A whole handicap line refunds on its number, so its chance here is win
 * against loss, the chance its fair price is set from; a refund is graded a
 * push. Goal thresholds and records were refitted on both seasons (each within
 * 0.03 of its 2024-25 value); the stat rules keep their 2024-25 thresholds,
 * and their record is both seasons together.
 */

import type { Pick } from "./predict";
import { isPausedPick } from "./paused";
import type { AsianHandicapLine } from "./poisson";

export interface SweetSpot {
  market: string;
  /** Lowest chance at which the rule applies. */
  min: number;
  /** Hit rate of the rule over both replayed seasons; decides between rules that apply. */
  record: number;
}

export const SWEET_SPOTS: readonly SweetSpot[] = [
  { market: "corners:under:12.5", min: 0.82, record: 0.849 },
  { market: "dc:home-away", min: 0.8, record: 0.845 },
  { market: "ah:away:2", min: 0.82, record: 0.838 },
  { market: "1x2:home", min: 0.69, record: 0.832 },
  { market: "dc:home-draw", min: 0.76, record: 0.828 },
  { market: "ah:home:0", min: 0.72, record: 0.827 },
  { market: "ah:away:1.5", min: 0.74, record: 0.825 },
  { market: "ah:home:1.5", min: 0.79, record: 0.824 },
  { market: "ah:away:0", min: 0.7, record: 0.823 },
  { market: "ah:away:1", min: 0.75, record: 0.822 },
  { market: "ah:home:1", min: 0.77, record: 0.822 },
  { market: "dc:away-draw", min: 0.74, record: 0.821 },
  { market: "ah:home:2", min: 0.77, record: 0.82 },
  { market: "ou:over:1.5", min: 0.8, record: 0.82 },
];

/**
 * Only for a game no rule in SWEET_SPOTS covers. The shots handicaps and
 * "level or more" rules were removed on 28 Oct 2026: SportyBet has neither
 * market on any game, so those picks could never be loaded
 * (docs/sportybet-lines.md). A corners or shots rule that fires is then
 * moved to a line SportyBet lists (market-check.ts boardChecked).
 */
export const SWEET_SPOT_FILLERS: readonly SweetSpot[] = [
  { market: "sot:home:over:3.5", min: 0.81, record: 0.869 },
  { market: "sot:most:home", min: 0.8, record: 0.845 },
  { market: "shots:away:under:12.5", min: 0.81, record: 0.845 },
  { market: "shots:home:over:12.5", min: 0.82, record: 0.843 },
  { market: "sot:away:under:5.5", min: 0.81, record: 0.841 },
  { market: "sot:away:under:4.5", min: 0.8, record: 0.838 },
  { market: "sot:home:under:5.5", min: 0.78, record: 0.837 },
];

/** Shorter than fair odds of 1.18 a pick is near-certain and not worth publishing. */
export const SWEET_SPOT_MAX = 0.85;

/** The divisions the rules were found and tested on. Everywhere else keeps the usual ranking. */
export const SWEET_SPOT_LEAGUES: ReadonlySet<string> = new Set([
  "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
  "championship", "eredivisie", "primeira-liga", "scottish-premiership",
  "belgian-pro-league", "super-lig", "greek-super-league", "league-one",
  "bundesliga-2", "serie-b", "la-liga-2", "ligue-2",
]);

export function sweetSpotLeague(leagueCode: string | undefined): boolean {
  return Boolean(leagueCode && SWEET_SPOT_LEAGUES.has(leagueCode));
}

export interface SweetSpotPick {
  market: string;
  label: string;
  group: Pick["group"];
  probability: number;
}

const STAT_NAMES: Record<string, string> = { corners: "corners", shots: "shots", sot: "shots on target", bookings: "bookings" };

/** "Under 12.5 corners", "Home -1.5 shots on target handicap", "Away draw no bet". */
export function sweetSpotLabel(market: string): string {
  const [family, a, b, c] = market.split(":");
  const side = (x: string) => (x === "home" ? "Home" : "Away");
  if (family === "ah") return Number(b) === 0 ? `${side(a)} draw no bet` : `${side(a)} ${Number(b) > 0 ? "+" : ""}${b} handicap`;
  const what = STAT_NAMES[family];
  if (!what) return market;
  if (a === "over" || a === "under") return `${a === "over" ? "Over" : "Under"} ${b} ${what}`;
  if (a === "most") {
    if (b === "level") return `Level on ${what}`;
    return b.endsWith("-or-level") ? `${side(b.split("-")[0])} level or more ${what}` : `${side(b)} more ${what}`;
  }
  if (a === "hcp") return `${side(b)} ${c} ${what} handicap`;
  return `${side(a)} ${b} ${c} ${what}`;
}

/** Corners, shots or shots on target: graded from match stats, not the score. */
export function isStatMarket(market: string): boolean {
  const family = market.split(":")[0];
  return family === "corners" || family === "shots" || family === "sot";
}

/**
 * The chance a rule reads for a market: the ranked pick's own for goal
 * selections and half-goal lines, win against loss for a whole handicap line,
 * and the count model's for corners and shots (statChances, from the service).
 */
function chanceOf(market: string, picks: readonly Pick[], ah: readonly AsianHandicapLine[], stats: Readonly<Record<string, number>> | undefined): number | null {
  if (isStatMarket(market)) return stats?.[market] ?? null;
  const whole = market.match(/^ah:(home|away):(-?\d+)$/);
  if (whole) {
    const homeLine = whole[1] === "home" ? Number(whole[2]) : -Number(whole[2]);
    const line = ah.find((l) => l.line === homeLine);
    if (!line || line.home + line.away <= 0) return null;
    return (whole[1] === "home" ? line.home : line.away) / (line.home + line.away);
  }
  return picks.find((p) => p.market === market)?.probability ?? null;
}

function groupOf(market: string): Pick["group"] {
  const family = market.split(":")[0];
  if (family === "corners") return "Corners";
  if (family === "shots" || family === "sot") return "Shots";
  if (family === "ah") return "Asian Handicap";
  if (family === "dc") return "Double Chance";
  if (family === "ou") return "Goals";
  return "Match Result";
}

/**
 * Every paused handicap rule that would have fired on this game, with its
 * chance: what the pick would have been, for the shadow log.
 */
export function pausedHandicapCandidates(
  picks: readonly Pick[],
  leagueCode: string | undefined,
  ah: readonly AsianHandicapLine[] = [],
): { market: string; label: string; probability: number }[] {
  if (!sweetSpotLeague(leagueCode)) return [];
  const out: { market: string; label: string; probability: number }[] = [];
  for (const rule of SWEET_SPOTS) {
    if (!rule.market.startsWith("ah:") || !isPausedPick(rule.market)) continue;
    const p = chanceOf(rule.market, picks, ah, undefined);
    if (p === null || p < rule.min || p > SWEET_SPOT_MAX) continue;
    out.push({ market: rule.market, label: sweetSpotLabel(rule.market), probability: p });
  }
  return out;
}

/** The game's sweet-spot pick, or null when no rule applies (or the competition was not tested). */
export function sweetSpotPick(
  picks: readonly Pick[],
  leagueCode: string | undefined,
  barred: readonly string[] = [],
  ah: readonly AsianHandicapLine[] = [],
  stats?: Readonly<Record<string, number>>,
): SweetSpotPick | null {
  if (!sweetSpotLeague(leagueCode)) return null;
  for (const tier of [SWEET_SPOTS, SWEET_SPOT_FILLERS]) {
    let best: { rule: SweetSpot; p: number } | null = null;
    for (const rule of tier) {
      if (barred.includes(rule.market) || isPausedPick(rule.market)) continue;
      const p = chanceOf(rule.market, picks, ah, stats);
      if (p === null || p < rule.min || p > SWEET_SPOT_MAX) continue;
      if (!best || rule.record > best.rule.record || (rule.record === best.rule.record && p > best.p)) best = { rule, p };
    }
    if (best) {
      const ranked = picks.find((x) => x.market === best!.rule.market);
      const label = ranked && !/^ah:(home|away):-?\d+$/.test(ranked.market) ? ranked.label : sweetSpotLabel(best.rule.market);
      return { market: best.rule.market, label, group: groupOf(best.rule.market), probability: best.p };
    }
  }
  return null;
}
