/**
 * Research only: the line pricing the replay scripts share (headline-lab.ts,
 * market-accuracy.ts). A game's score or count grid folded onto its total,
 * side and difference distributions, every half line priced off them, and
 * SportyBet's stat ladder stood in for (docs/sportybet-lines.md).
 */
import { gradeLeg } from "../../src/lib/leg-pricing";
import type { Pred } from "../niche-lab";
import type { EngineCandidate } from "../../src/lib/model/headline-engine";

export type Kind = "corners" | "shots" | "shotsOnTarget";
export const KINDS: Kind[] = ["corners", "shots", "shotsOnTarget"];
export const PREFIX: Record<Kind, string> = { corners: "corners", shots: "shots", shotsOnTarget: "sot" };
export const LADDER: Record<Kind, { total: number; team: number; handicap: number }> = {
  corners: { total: 2, team: 5, handicap: 2 },
  shots: { total: 4, team: 3, handicap: 0 },
  shotsOnTarget: { total: 3, team: 3, handicap: 0 },
};
/** Share of games SportyBet lists the family on (board, October 2026). */
export const LISTED_SHARE: Record<Kind, number> = { corners: 0.45, shots: 0.22, shotsOnTarget: 0.22 };

export interface Cand extends EngineCandidate {
  won: boolean;
}

/* -------------------------------------------------------------- pricing */

export interface Dists { total: number[]; home: number[]; away: number[]; diff: Map<number, number> }

export function dists(grid: number[][]): Dists {
  const n = grid.length;
  const m = grid[0]?.length ?? 0;
  const total = new Array<number>(n + m).fill(0), home = new Array<number>(n).fill(0), away = new Array<number>(m).fill(0);
  const diff = new Map<number, number>();
  for (let i = 0; i < n; i++) for (let j = 0; j < grid[i].length; j++) {
    const p = grid[i][j];
    if (!(p > 0)) continue;
    total[i + j] += p; home[i] += p; away[j] += p;
    diff.set(i - j, (diff.get(i - j) ?? 0) + p);
  }
  return { total, home, away, diff };
}

const above = (xs: number[], line: number) => xs.reduce((s, p, k) => (k > line ? s + p : s), 0);
const below = (xs: number[], line: number) => xs.reduce((s, p, k) => (k < line ? s + p : s), 0);
const diffWhere = (d: Map<number, number>, ok: (x: number) => boolean) => [...d].reduce((s, [x, p]) => (ok(x) ? s + p : s), 0);

/** The chance a half-line market lands, for any family the engine reads (goals or stats). */
export function chance(market: string, d: Dists): number {
  const parts = market.split(":");
  const [fam, a, b] = parts;
  const line = Number(parts[parts.length - 1]);
  if (fam === "1x2") return a === "home" ? diffWhere(d.diff, (x) => x > 0) : diffWhere(d.diff, (x) => x < 0);
  if (fam === "dc") return a === "home-draw" ? diffWhere(d.diff, (x) => x >= 0) : diffWhere(d.diff, (x) => x <= 0);
  if (a === "over") return above(d.total, line);
  if (a === "under") return below(d.total, line);
  if (a === "home" || a === "away") {
    if (fam === "ah") return a === "home" ? diffWhere(d.diff, (x) => x > -line) : diffWhere(d.diff, (x) => -x > -line);
    const xs = a === "home" ? d.home : d.away;
    return b === "over" ? above(xs, line) : below(xs, line);
  }
  if (a === "hcp") return b === "home" ? diffWhere(d.diff, (x) => x > -line) : diffWhere(d.diff, (x) => -x > -line);
  if (a === "most") return b === "home" ? diffWhere(d.diff, (x) => x > 0) : diffWhere(d.diff, (x) => x < 0);
  return 0;
}

export const won = (market: string, h: number, a: number) => {
  const g = gradeLeg(market, h, a);
  return g === "win" || g === "halfWin";
};

export const GOALS = [
  "1x2:home", "1x2:away", "dc:home-draw", "dc:away-draw",
  "ou:over:1.5", "ou:over:2.5", "ou:over:3.5", "ou:under:1.5", "ou:under:2.5", "ou:under:3.5",
  "ah:home:-1.5", "ah:away:-1.5", "ah:home:+1.5", "ah:away:+1.5",
  "tg:home:over:0.5", "tg:away:over:0.5", "tg:home:over:1.5", "tg:away:over:1.5",
  "tg:home:under:1.5", "tg:away:under:1.5", "tg:home:under:2.5", "tg:away:under:2.5",
];

/** The closing market's chance on the lines it covers. */
export function closing(market: string, mk: Pred["mk"]): number | null {
  if (!mk) return null;
  const [h, d, a, o25] = mk;
  switch (market) {
    case "1x2:home": return h;
    case "1x2:away": return a;
    case "dc:home-draw": return h + d;
    case "dc:away-draw": return a + d;
    case "ou:over:2.5": return o25;
    case "ou:under:2.5": return 1 - o25;
  }
  return null;
}

export function ladder(kind: Kind, d: Dists): string[] {
  const p = PREFIX[kind];
  const half = (hi: number) => Array.from({ length: hi + 1 }, (_, i) => i + 0.5);
  const max = kind === "corners" ? 18 : kind === "shots" ? 40 : 16;
  const teamMax = kind === "corners" ? 12 : kind === "shots" ? 24 : 12;
  const fams: { pairs: [string, string][]; k: number }[] = [
    { pairs: half(max).map((l) => [`${p}:over:${l}`, `${p}:under:${l}`]), k: LADDER[kind].total },
    ...["home", "away"].map((s) => ({ pairs: half(teamMax).map((l) => [`${p}:${s}:over:${l}`, `${p}:${s}:under:${l}`] as [string, string]), k: LADDER[kind].team })),
  ];
  if (LADDER[kind].handicap) {
    const hs = [-4.5, -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5];
    fams.push({ pairs: hs.map((h) => [`${p}:hcp:home:${h > 0 ? "+" : ""}${h}`, `${p}:hcp:away:${-h > 0 ? "+" : ""}${-h}`]), k: LADDER[kind].handicap });
  }
  const out: string[] = [];
  for (const f of fams) {
    const ranked = f.pairs.map((pair) => ({ pair, p: chance(pair[0], d) })).sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5));
    for (const { pair } of ranked.slice(0, f.k)) out.push(...pair);
  }
  out.push(`${p}:most:home`, `${p}:most:away`);
  return out;
}

