/**
 * A second opinion from SportyBet's own price before a pick goes out.
 *
 * The model has no edge over a sharp market (model/backtest.ts), but the two
 * disagree in a useful way: when the market rates a pick well below the model,
 * the market is usually right. Replayed over the last 365 days in 17 European
 * divisions (scripts/decision-lab.ts --round=check, closing prices standing in
 * for SportyBet's at publish):
 *
 *   - published picks the market rated 3pt+ below the model landed 68.0%
 *     (stated 73.5%), against 79.1% for the rest;
 *   - swapping each for the game's next pick that is at least as likely as
 *     the market makes the old one (both judged by the lower of the model's
 *     and the market's chance), keeping the old one when nothing is and the
 *     market still has it at 60%+, lifted the published record from 77.6% to
 *     78.4% without losing a pick (5,564 of 5,564);
 *   - in the Code Hub, dropping legs the market rates 5pt+ lower lifted the
 *     2-odds code from 51.6% to 58.0% landed and the days with a landed code
 *     from 71% to 75%.
 *
 * Live, on the few logged picks with a SportyBet price at publish (October
 * 2026), the 5pt+ group landed 4 of 12. Neither a stretch of the model's
 * chances nor a shorter memory did as well (both lowered the published
 * record), so the model's numbers stay its own and the market only vetoes.
 *
 * Pure: the caller brings the event's listed markets (odds/sportybet.ts).
 */
import { confidenceFor, headlineEligible, HEADLINE_EXCLUDED, type Pick, type Prediction } from "@/lib/model/predict";
import { fairOdds } from "@/lib/model/odds";
import { isStatMarket } from "@/lib/model/sweet-spots";
import { fairChanceOn } from "@/lib/odds/market-prob";
import type { RawMarket } from "@/lib/odds/sportybet-api";
import { bestListedLine, listedOn, type ListedLine } from "@/lib/board-pick";

/** A published pick gives way when SportyBet rates it this far or more below the model. */
export const PICK_MARKET_GAP = 0.03;
/** A combo leg is dropped when SportyBet rates it this far or more below the model. */
export const LEG_MARKET_GAP = 0.05;
/** The pick swapped in must still be one worth publishing. */
const MIN_REPLACEMENT = 0.6;

/** The model's chance minus SportyBet's fair chance, or null when SportyBet doesn't price the selection. */
export function marketGap(market: string, probability: number, markets: readonly RawMarket[] | undefined): number | null {
  if (!markets?.length) return null;
  const fair = fairChanceOn(market, markets);
  return fair === null ? null : probability - fair;
}

/** True when SportyBet rates the selection `gap` or more below the model. */
export function marketDissents(market: string, probability: number, markets: readonly RawMarket[] | undefined, gap: number): boolean {
  const g = marketGap(market, probability, markets);
  return g !== null && g >= gap - 1e-9;
}

/** A pick's chance on the more cautious of the two views. */
function cautious(x: Pick, markets: readonly RawMarket[]): number {
  const fair = fairChanceOn(x.market, markets);
  return fair === null ? x.probability : Math.min(x.probability, fair);
}

/**
 * The prediction with its headline pick checked against SportyBet. When the
 * market rates it PICK_MARKET_GAP or more lower, the game's next headline pick
 * that is at least as likely as the market makes the old one takes its place.
 * With none, the old pick stands if the market still has it at 60%+, and
 * otherwise the game gets no pick. The pick set aside is kept for the match page.
 */
export function checkPicks(
  p: Prediction,
  markets: readonly RawMarket[] | undefined,
  excluded: readonly string[] = HEADLINE_EXCLUDED,
): Prediction {
  const top = p.topPick;
  if (!top || !markets?.length) return p;
  const gap = marketGap(top.market, top.probability, markets);
  if (gap === null || gap < PICK_MARKET_GAP - 1e-9) return p;

  const marketChance = top.probability - gap;
  const fits = (x: Pick) =>
    x.market !== top.market &&
    headlineEligible(x) &&
    !excluded.includes(x.market) &&
    x.probability >= MIN_REPLACEMENT &&
    !marketDissents(x.market, x.probability, markets, PICK_MARKET_GAP) &&
    cautious(x, markets) >= marketChance;
  const next = p.picks.find(fits) ?? null;
  if (!next && marketChance >= MIN_REPLACEMENT) return p;
  return {
    ...p,
    picks: next ? [next, ...p.picks.filter((x) => x !== next)] : p.picks,
    topPick: next,
    sweetSpot: false,
    marketCheck: { setAside: top, marketChance: Math.round(marketChance * 10_000) / 10_000, reason: "market" },
  };
}

/**
 * The headline pick, kept to what SportyBet lets someone load (board-pick.ts).
 *
 * With the game on SportyBet's board:
 *   - a corners or shots pick is replaced by the strongest corners or shots
 *     line SportyBet actually lists (bestListedLine), and so is any pick whose
 *     line SportyBet doesn't list; with no such line, the game's next headline
 *     pick SportyBet lists and doesn't rate well below us;
 *   - a listed pick goes through the market check as before (checkPicks).
 * With no board for the game (SportyBet doesn't carry it, or couldn't be
 * read), a corners, shots or handicap pick gives way to the next goals or
 * result pick; anything else stands.
 *
 * `lines` are the board's corners and shots lines priced by the model
 * (listedStatLines), empty where stat picks aren't offered.
 */
export function boardChecked(
  p: Prediction,
  markets: readonly RawMarket[] | undefined,
  lines: readonly ListedLine[] = [],
  excluded: readonly string[] = HEADLINE_EXCLUDED,
): Prediction {
  const top = p.topPick;
  if (!top) return p;
  const exotic = isStatMarket(top.market) || top.market.startsWith("ah:");
  if (!markets?.length) {
    if (!exotic) return p;
    const next = p.picks.find((x) => x !== top && headlineEligible(x) && !excluded.includes(x.market)) ?? null;
    return setAside(p, top, next, null, false);
  }
  if (!isStatMarket(top.market) && listedOn(top.market, markets)) return checkPicks(p, markets, excluded);

  const line = bestListedLine(lines, { gap: PICK_MARKET_GAP });
  // The model's own stat pick is already the best listed line: nothing to set aside.
  if (line && line.market === top.market) return p;
  const statPick: Pick | null = line
    ? {
        market: line.market,
        label: line.label,
        group: line.market.startsWith("corners:") ? "Corners" : "Shots",
        probability: line.probability,
        fairOdds: fairOdds(line.probability),
        confidence: confidenceFor(line.probability, p.model.dataQuality, p.model.uncertainty),
      }
    : null;
  const next =
    statPick ??
    p.picks.find(
      (x) =>
        x !== top &&
        headlineEligible(x) &&
        !excluded.includes(x.market) &&
        x.probability >= MIN_REPLACEMENT &&
        listedOn(x.market, markets) &&
        !marketDissents(x.market, x.probability, markets, PICK_MARKET_GAP),
    ) ??
    null;
  return setAside(p, top, next, null, Boolean(statPick));
}

function setAside(p: Prediction, top: Pick, next: Pick | null, marketChance: number | null, sweetSpot: boolean): Prediction {
  return {
    ...p,
    picks: next ? [next, ...p.picks.filter((x) => x !== next && x.market !== next.market)] : p.picks,
    topPick: next,
    sweetSpot,
    marketCheck: { setAside: top, marketChance, reason: "unlisted" },
  };
}
