/**
 * The headline engine's shadow record (engine_picks, 0082) against the
 * published headline (predictions_log), on the same games: what decides
 * whether app_switches.headline_engine goes on. Pure; the admin page reads
 * the rows.
 */

export interface EngineLogRow {
  match_id: string;
  slot: string;
  market: string;
  family: string;
  calibrated: number;
  load_price: number;
  result: "win" | "lose" | "push" | null;
  logged_at: string;
}

export interface PublishedLogRow {
  match_id: string;
  market: string;
  probability: number;
  price_at_publish: number | null;
  result: "win" | "lose" | "push" | null;
}

export interface SideRecord {
  n: number;
  landed: number;
  stated: number;
  /** Average SportyBet price; null where none was recorded. */
  price: number | null;
  /** Share loadable at 1.20 or more. */
  atFloor: number | null;
}

export interface EngineRecord {
  /** Games where both headlines are settled (a push on either side leaves the game out). */
  games: number;
  engine: SideRecord | null;
  published: SideRecord | null;
  /** Share of games where the two headlines were the same selection. */
  same: number;
  /** Days since the first engine row: the shadow period so far. */
  days: number;
  pending: number;
  mix: { family: string; n: number; landed: number }[];
  groups: { group: string; graded: number; landed: number; stated: number; pending: number }[];
}

const decided = (r: { result: string | null }) => r.result === "win" || r.result === "lose";

function side(rows: { stated: number; won: boolean; price: number | null }[]): SideRecord | null {
  if (rows.length === 0) return null;
  const priced = rows.filter((r) => r.price !== null);
  return {
    n: rows.length,
    landed: rows.filter((r) => r.won).length / rows.length,
    stated: rows.reduce((s, r) => s + r.stated, 0) / rows.length,
    price: priced.length ? priced.reduce((s, r) => s + r.price!, 0) / priced.length : null,
    atFloor: priced.length ? priced.filter((r) => r.price! >= 1.2 - 1e-9).length / priced.length : null,
  };
}

export function summariseEngine(engineRows: readonly EngineLogRow[], published: readonly PublishedLogRow[], now = Date.now()): EngineRecord {
  const pub = new Map(published.map((p) => [p.match_id, p]));
  const heads = engineRows.filter((r) => r.slot === "headline");
  const paired = heads.flatMap((e) => {
    const p = pub.get(e.match_id);
    return p && decided(e) && decided(p) ? [{ e, p }] : [];
  });

  const mix = new Map<string, { n: number; w: number }>();
  for (const { e } of paired) {
    const m = mix.get(e.family) ?? { n: 0, w: 0 };
    m.n++;
    if (e.result === "win") m.w++;
    mix.set(e.family, m);
  }

  const groups = new Map<string, { graded: number; w: number; sum: number; pending: number }>();
  for (const r of engineRows) {
    if (r.slot === "headline") continue;
    const g = groups.get(r.slot) ?? { graded: 0, w: 0, sum: 0, pending: 0 };
    if (r.result === null) g.pending++;
    else if (decided(r)) {
      g.graded++;
      g.sum += r.calibrated;
      if (r.result === "win") g.w++;
    }
    groups.set(r.slot, g);
  }

  const first = engineRows.reduce((m, r) => Math.min(m, Date.parse(r.logged_at)), Infinity);
  return {
    games: paired.length,
    engine: side(paired.map(({ e }) => ({ stated: e.calibrated, won: e.result === "win", price: e.load_price }))),
    published: side(paired.map(({ p }) => ({ stated: p.probability, won: p.result === "win", price: p.price_at_publish }))),
    same: paired.length ? paired.filter(({ e, p }) => e.market === p.market).length / paired.length : 0,
    days: Number.isFinite(first) ? Math.floor((now - first) / 86_400_000) : 0,
    pending: heads.filter((r) => r.result === null).length,
    mix: [...mix].map(([family, m]) => ({ family, n: m.n, landed: m.w / m.n })).sort((a, b) => b.n - a.n),
    groups: [...groups].map(([group, g]) => ({ group, graded: g.graded, landed: g.graded ? g.w / g.graded : 0, stated: g.graded ? g.sum / g.graded : 0, pending: g.pending })),
  };
}
