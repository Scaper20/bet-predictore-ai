import { decide, type Action } from "@/lib/code-editor-policy";
import { priceBand, solveOptions } from "@/lib/forge-solve";
import type { ReadSource } from "@/lib/odds/market-read";

/**
 * The Code Hub editor: take the games on someone's code and re-pick them,
 * either to make the code safer or to land near a price they ask for. Pure;
 * code-scan.ts supplies the games, the current pick, the same bet's safer
 * lines and the model's other picks on each (forge.ts candidatesFor).
 *
 * The games stay the user's: nothing is added. Safer follows
 * code-editor-policy.ts: a solid pick is kept, a weak one gets a safer line
 * of the same bet, then a safer pick on the game, and only a long shot
 * nothing rescues comes off, each with the reason.
 */

/** A pick the editor can choose, with the model's chance and fair price. */
export interface EditorPick {
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
  /** Where the chance came from, when it isn't our model (code-scan-core.ts). */
  source?: ReadSource;
}

export interface EditorGame {
  /** Our match id; SportyBet's event id for a game outside our coverage. */
  matchId: string;
  /** SportyBet's event id, so a pick only its full event lists can still be booked. */
  eventId?: string;
  homeName: string;
  awayName: string;
  kickoff: number;
  /** Display name, as the slip carries it (booking resolves the league by it). */
  league: string;
  /** The pick on the code now; null when it was a market we can't read. */
  current: EditorPick | null;
  /** Every pick the model offers on this game, singles and same-game combos. */
  candidates: EditorPick[];
  /** The current pick's safer lines (code-editor-policy.ts saferLines), nearest first, where SportyBet lists them. */
  ladder?: EditorPick[];
}

export interface EditedGame extends EditorPick {
  matchId: string;
  eventId?: string;
  homeName: string;
  awayName: string;
  kickoff: number;
  league: string;
  /** The pick it replaced, when it changed. */
  from: EditorPick | null;
  /** What the editor did and why ("Same bet, safer line: 41% to 72%."). */
  action?: Action;
  why?: string;
}

/** A game the editor took off the code, and why. */
export interface RemovedGame {
  matchId: string;
  homeName: string;
  awayName: string;
  label: string;
  why: string;
}

export interface EditResult {
  games: EditedGame[];
  /** The model's chance of every pick landing. */
  chance: number;
  /** The product of the model's fair prices; SportyBet's own will be a little lower. */
  fairOdds: number;
  removed?: RemovedGame[];
  /** Anything worth saying about the result (a price it couldn't reach). */
  notes?: string[];
}

/** Below this a pick pays almost nothing and still adds a way to lose. */
export const MIN_PICK_ODDS = 1.15;

/** A swap must be worth at least this much chance to change the user's pick. */
const MIN_GAIN = 0.02;

const usable = (g: EditorGame) => g.candidates.filter((c) => c.fairOdds >= MIN_PICK_ODDS);

function result(
  games: readonly EditorGame[],
  chosen: EditorPick[],
  extra: { why?: (string | undefined)[]; action?: (Action | undefined)[]; removed?: RemovedGame[]; notes?: string[] } = {},
): EditResult {
  const out = games.map((g, i) => ({
    ...chosen[i],
    matchId: g.matchId,
    ...(g.eventId ? { eventId: g.eventId } : {}),
    homeName: g.homeName,
    awayName: g.awayName,
    kickoff: g.kickoff,
    league: g.league,
    from: g.current && g.current.market !== chosen[i].market ? g.current : null,
    ...(extra.action?.[i] ? { action: extra.action[i] } : {}),
    ...(extra.why?.[i] ? { why: extra.why[i] } : {}),
  }));
  return {
    games: out,
    chance: Math.round(out.reduce((p, g) => p * g.probability, 1) * 10_000) / 10_000,
    fairOdds: Math.round(out.reduce((p, g) => p * g.fairOdds, 1) * 100) / 100,
    ...(extra.removed?.length ? { removed: extra.removed } : {}),
    ...(extra.notes?.length ? { notes: extra.notes } : {}),
  };
}

const removal = (g: EditorGame, why: string): RemovedGame => ({
  matchId: g.matchId,
  homeName: g.homeName,
  awayName: g.awayName,
  label: g.current?.label ?? "Unread pick",
  why,
});

/** The same bet's safer lines worth having. */
const ladderOf = (g: EditorGame) => (g.ladder ?? []).filter((c) => c.fairOdds >= MIN_PICK_ODDS);

/**
 * The code made safer, game by game (code-editor-policy.ts decide): solid
 * picks kept, weak ones given a safer line of the same bet or a safer pick
 * on the game, long shots nothing rescues taken off, each with its reason.
 */
export function saferCode(games: readonly EditorGame[]): EditResult {
  const kept: EditorGame[] = [];
  const chosen: EditorPick[] = [];
  const why: string[] = [];
  const action: Action[] = [];
  const removed: RemovedGame[] = [];
  for (const g of games) {
    const d = decide(g.current, ladderOf(g), usable(g), MIN_GAIN);
    if (!d.pick) {
      removed.push(removal(g, d.why));
      continue;
    }
    kept.push(g);
    chosen.push(d.pick);
    why.push(d.why);
    action.push(d.action);
  }
  return result(kept, chosen, { why, action, removed });
}

/**
 * The code re-picked to land on `target` odds (within Forge's band, 5%) for
 * as little chance as possible: each game keeps its pick, takes a safer or
 * bolder line of the same bet, or another pick on the game, whichever set
 * lands on the price with the highest chance of all landing (forge-solve.ts
 * solveOptions). When even the safest picks pay more than asked, the
 * riskiest games come off until it fits.
 */
export function targetCode(games: readonly EditorGame[], target: number): EditResult {
  const kept = games.filter((g) => g.current || usable(g).length > 0);
  const options = kept.map((g) => {
    const seen = new Set<string>();
    return [g.current, ...ladderOf(g), ...usable(g)].filter((c): c is EditorPick => {
      if (!c || !(c.fairOdds > 1) || !(c.probability > 0) || seen.has(c.market)) return false;
      seen.add(c.market);
      return true;
    });
  });
  const live = kept.filter((_, i) => options[i].length > 0);
  const opts = options.filter((o) => o.length > 0);
  const solved = solveOptions(
    opts.map((o) => ({ opts: o.map((c) => ({ lo: Math.log(c.fairOdds), q: Math.log(c.probability) })) })),
    target,
  );
  if (!solved) return result([], []);
  let picks = opts.map((o, i) => o[solved.choice[i]]);
  let games2 = live;
  const removed: RemovedGame[] = [];
  const notes: string[] = [];
  const [lo, hi] = priceBand(target);
  let odds = picks.reduce((p, c) => p * c.fairOdds, 1);
  if (odds > hi) {
    // Too long even at the safest picks: the least likely games come off first.
    const order = picks.map((c, i) => i).sort((a, b) => picks[a].probability - picks[b].probability);
    const drop = new Set<number>();
    for (const i of order) {
      if (odds <= hi) break;
      if (odds / picks[i].fairOdds < lo) continue;
      drop.add(i);
      odds /= picks[i].fairOdds;
      removed.push(removal(games2[i], `Taken off to bring the price down to ${target}.`));
    }
    games2 = games2.filter((_, i) => !drop.has(i));
    picks = picks.filter((_, i) => !drop.has(i));
  }
  if (odds < lo - 1e-9 || odds > hi + 1e-9) {
    notes.push(`${odds.toFixed(2)} is as close to ${target} as these games get.`);
  }
  return result(games2, picks, { removed, notes });
}

/** The editor before code-editor-policy.ts, kept for EDITOR_POLICY=legacy: the most likely pick on every game. */
export function legacySaferCode(games: readonly EditorGame[]): EditResult {
  const kept = games.filter((g) => usable(g).length > 0 || g.current);
  const chosen = kept.map((g) => {
    const best = usable(g).reduce<EditorPick | null>((b, c) => (!b || c.probability > b.probability ? c : b), null);
    if (!best) return g.current!;
    if (g.current && best.probability < g.current.probability + MIN_GAIN) return g.current;
    return best;
  });
  return result(kept, chosen);
}
