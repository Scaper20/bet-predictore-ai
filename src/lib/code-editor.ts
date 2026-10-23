/**
 * The Code Hub editor: take the games on someone's code and re-pick them,
 * either to make the code as safe as it can be or to land near a price they
 * ask for. Pure; code-scan.ts supplies the games, the model's candidates for
 * each (forge.ts candidatesFor) and the current pick.
 *
 * The games stay the user's: nothing is added. A game we could not read is
 * dropped and said so, since a pick we can't price can't be made safer.
 */

/** A pick the editor can choose, with the model's chance and fair price. */
export interface EditorPick {
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
}

export interface EditorGame {
  matchId: string;
  homeName: string;
  awayName: string;
  kickoff: number;
  /** Display name, as the slip carries it (booking resolves the league by it). */
  league: string;
  /** The pick on the code now; null when it was a market we can't read. */
  current: EditorPick | null;
  /** Every pick the model offers on this game, singles and same-game combos. */
  candidates: EditorPick[];
}

export interface EditedGame extends EditorPick {
  matchId: string;
  homeName: string;
  awayName: string;
  kickoff: number;
  league: string;
  /** The pick it replaced, when it changed. */
  from: EditorPick | null;
}

export interface EditResult {
  games: EditedGame[];
  /** The model's chance of every pick landing. */
  chance: number;
  /** The product of the model's fair prices; SportyBet's own will be a little lower. */
  fairOdds: number;
}

/** Below this a pick pays almost nothing and still adds a way to lose. */
export const MIN_PICK_ODDS = 1.15;

/** A swap must be worth at least this much chance to change the user's pick. */
const MIN_GAIN = 0.02;

const usable = (g: EditorGame) => g.candidates.filter((c) => c.fairOdds >= MIN_PICK_ODDS);

function result(games: EditorGame[], chosen: EditorPick[]): EditResult {
  const out = games.map((g, i) => ({
    ...chosen[i],
    matchId: g.matchId,
    homeName: g.homeName,
    awayName: g.awayName,
    kickoff: g.kickoff,
    league: g.league,
    from: g.current && g.current.market !== chosen[i].market ? g.current : null,
  }));
  return {
    games: out,
    chance: Math.round(out.reduce((p, g) => p * g.probability, 1) * 10_000) / 10_000,
    fairOdds: Math.round(out.reduce((p, g) => p * g.fairOdds, 1) * 100) / 100,
  };
}

/** The safest version of the code: on each game, the most likely pick worth having. */
export function saferCode(games: readonly EditorGame[]): EditResult {
  const kept = games.filter((g) => usable(g).length > 0 || g.current);
  const chosen = kept.map((g) => {
    const best = usable(g).reduce<EditorPick | null>((b, c) => (!b || c.probability > b.probability ? c : b), null);
    if (!best) return g.current!;
    if (g.current && best.probability < g.current.probability + MIN_GAIN) return g.current;
    return best;
  });
  return result(kept, chosen);
}

/**
 * The code re-picked to land near `target` odds, losing as little chance as
 * possible on the way: start from the safest pick on every game, then keep
 * making the single change that buys the most price for the least chance
 * (largest gain in log-odds per log-chance given up), until the total reaches
 * the target. Stops short rather than overshooting by more than a third.
 */
export function targetCode(games: readonly EditorGame[], target: number): EditResult {
  const kept = games.filter((g) => usable(g).length > 0);
  // Each game's picks from safest to boldest.
  const ladders = kept.map((g) => [...usable(g)].sort((a, b) => b.probability - a.probability));
  const at = ladders.map(() => 0);
  const total = () => ladders.reduce((p, l, i) => p * l[at[i]].fairOdds, 1);

  for (let guard = 0; guard < 200 && total() < target * 0.97; guard++) {
    const now = total();
    const moves: { i: number; j: number; score: number; after: number }[] = [];
    for (let i = 0; i < ladders.length; i++) {
      const cur = ladders[i][at[i]];
      for (let j = at[i] + 1; j < ladders[i].length; j++) {
        const next = ladders[i][j];
        if (next.fairOdds <= cur.fairOdds) continue;
        const gain = Math.log(next.fairOdds / cur.fairOdds);
        const cost = Math.log(cur.probability / next.probability);
        moves.push({ i, j, score: gain / Math.max(cost, 1e-6), after: (now / cur.fairOdds) * next.fairOdds });
      }
    }
    // The cheapest move that does not overshoot by more than a third; failing
    // that, while still well short, the move that overshoots least.
    const fits = moves.filter((m) => m.after <= target * 1.35).sort((x, y) => y.score - x.score);
    const move = fits[0] ?? (now < target * 0.8 ? [...moves].sort((x, y) => x.after - y.after)[0] : undefined);
    if (!move) break;
    at[move.i] = move.j;
  }
  return result(kept, ladders.map((l, i) => l[at[i]]));
}
