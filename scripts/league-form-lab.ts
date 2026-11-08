/**
 * Research only: does building the Code Hub from leagues in recent good form
 * land more codes than building it from every league?
 *
 * Walk-forward over the last N days (default 365, stops at the frozen holdout
 * unless --final) on the football-data.co.uk divisions, the way
 * decision-lab.ts does it: each fixture is predicted from results strictly
 * before its matchday, and the day's hub is rebuilt with the production
 * builder (bookmaker closing prices standing in for SportyBet's, legs the
 * market rates 5pt+ below the model dropped, code-hub-feed.ts).
 *
 * A league's "form" on a day uses ONLY games settled before that day: over the
 * previous W days, every game's strongest hub-eligible leg (60%+, hub markets),
 * landed minus stated. Then:
 *
 *   1. persistence   does a league's form over one window predict its form
 *                    over the next? (correlation across league-windows)
 *   2. hub variants  baseline against hubs built only from leagues whose form
 *                    clears a bar, the top K leagues, or without the bottom K,
 *                    and one that marks legs down by their league's form
 *                    instead of excluding them.
 *
 * Codes are graded on the real scores; profit is 1 unit a code at the closing
 * price the code would have loaded at.
 *
 *   npx tsx scripts/league-form-lab.ts
 *   npx tsx scripts/league-form-lab.ts --days=540
 */

import type { PoolEntry } from "../src/lib/forge";
import { buildHub, hubMarketAllowed, hubTier, HUB_LIVE_TIERS, type HubBuildOptions } from "../src/lib/code-hub";
import { arg, candidates, closingPrice, DAY, DIVS, load, walk, won, type Graded } from "./lib/hub-walk";

/* ----------------------------------------------------------------- form */

/** One sample a game: its strongest hub-eligible leg, landed (1/0) against stated. */
interface Sample {
  day: number;
  code: string;
  won: number;
  p: number;
}

function samples(all: Graded[]): Sample[] {
  const out: Sample[] = [];
  for (const g of all) {
    const cs = candidates(g);
    if (!cs.length) continue;
    const best = cs.reduce((a, b) => (b.probability > a.probability ? b : a));
    const r = won(best.market, g.row);
    if (r === "push" || r === null) continue;
    out.push({ day: g.day, code: g.code, won: r === "win" ? 1 : 0, p: best.probability });
  }
  return out;
}

/** Each league's form on `day` from games in [day - window, day): mean landed minus stated, and the count. */
function formOn(byLeague: Map<string, Sample[]>, day: number, window: number): Map<string, { form: number; n: number }> {
  const out = new Map<string, { form: number; n: number }>();
  for (const [code, ss] of byLeague) {
    let n = 0, sum = 0;
    for (const s of ss) {
      if (s.day >= day) break;
      if (s.day < day - window * DAY) continue;
      n++;
      sum += s.won - s.p;
    }
    out.set(code, { form: n ? sum / n : 0, n });
  }
  return out;
}

function persistence(all: Sample[], byLeague: Map<string, Sample[]>, days: number[]) {
  console.log("\n1. DOES A LEAGUE'S RECENT FORM CARRY OVER? (landed minus stated, strongest hub leg a game)");
  for (const w of [14, 30, 60, 90]) {
    const xs: number[] = [], ys: number[] = [], ns: number[] = [];
    // Non-overlapping windows: form over [t-w, t) against form over [t, t+w).
    for (let t = days[0] + w * DAY; t + w * DAY <= days[days.length - 1]; t += w * DAY) {
      const before = formOn(byLeague, t, w);
      const after = formOn(byLeague, t + w * DAY, w);
      for (const [code, b] of before) {
        const a = after.get(code)!;
        if (b.n < 8 || a.n < 8) continue;
        xs.push(b.form);
        ys.push(a.form);
        ns.push(a.n);
      }
    }
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    const r = sxy / Math.sqrt(sxx * syy);
    // Top third by past form against bottom third: their next-window form.
    const order = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
    const third = Math.floor(order.length / 3);
    const avg = (idx: number[]) => (100 * idx.reduce((a, i) => a + ys[i], 0)) / Math.max(1, idx.length);
    console.log(
      `  ${String(w).padStart(3)}-day windows: ${xs.length} league-windows, correlation ${r.toFixed(3)} (±${(1.96 / Math.sqrt(xs.length)).toFixed(3)} is noise)` +
        `;  next window: hottest third ${avg(order.slice(-third)).toFixed(1)}pt, coldest third ${avg(order.slice(0, third)).toFixed(1)}pt`,
    );
  }
  const overall = all.reduce((a, s) => a + s.won - s.p, 0) / all.length;
  console.log(`  all games: ${all.length} legs, landed minus stated ${(100 * overall).toFixed(1)}pt`);
}

/**
 * The same question for teams: the published pick on a team's games (either
 * side), in blocks of its consecutive games. Does a team whose picks landed in
 * one block keep landing them in the next?
 */
function teamPersistence(all: Graded[]) {
  console.log("\n1b. DOES A TEAM'S RECORD WITH OUR PICK CARRY OVER? (published pick on its games, consecutive blocks)");
  const byTeam = new Map<string, { won: number; p: number }[]>();
  for (const g of all) {
    const pk = g.p.topPick;
    if (!pk || pk.market === "locked") continue;
    const r = won(pk.market, g.row);
    if (r === "push" || r === null) continue;
    for (const t of [g.row.home, g.row.away]) byTeam.set(`${g.code}|${t}`, [...(byTeam.get(`${g.code}|${t}`) ?? []), { won: r === "win" ? 1 : 0, p: pk.probability }]);
  }
  for (const block of [6, 8, 10]) {
    const pairs: { before: number; after: number; afterStated: number; perfect: boolean }[] = [];
    for (const ss of byTeam.values()) {
      for (let i = 0; i + 2 * block <= ss.length; i += block) {
        const a = ss.slice(i, i + block), b = ss.slice(i + block, i + 2 * block);
        const hit = (x: typeof a) => x.reduce((s, y) => s + y.won, 0) / x.length;
        pairs.push({ before: hit(a), after: hit(b), afterStated: b.reduce((s, y) => s + y.p, 0) / b.length, perfect: a.every((y) => y.won === 1) });
      }
    }
    const grp = (f: (x: (typeof pairs)[number]) => boolean) => {
      const xs = pairs.filter(f);
      const n = xs.length || 1;
      return `${String(xs.length).padStart(4)} blocks: next block landed ${((100 * xs.reduce((s, x) => s + x.after, 0)) / n).toFixed(1)}% (stated ${((100 * xs.reduce((s, x) => s + x.afterStated, 0)) / n).toFixed(1)}%)`;
    };
    console.log(`  blocks of ${block} games`);
    console.log(`    every pick landed      ${grp((x) => x.perfect)}`);
    console.log(`    80%+ landed            ${grp((x) => x.before >= 0.8)}`);
    console.log(`    60-79% landed          ${grp((x) => x.before >= 0.6 && x.before < 0.8)}`);
    console.log(`    under 60% landed       ${grp((x) => x.before < 0.6)}`);
  }
}

/* ------------------------------------------------------------- variants */

/** Each team's published-pick record, in order: day and landed minus stated. */
let TEAM_LOG = new Map<string, { day: number; d: number }[]>();

function buildTeamLog(all: Graded[]) {
  TEAM_LOG = new Map();
  for (const g of all) {
    const pk = g.p.topPick;
    if (!pk || pk.market === "locked") continue;
    const r = won(pk.market, g.row);
    if (r === "push" || r === null) continue;
    for (const t of [g.row.home, g.row.away]) {
      const k = `${g.code}|${t}`;
      TEAM_LOG.set(k, [...(TEAM_LOG.get(k) ?? []), { day: g.day, d: (r === "win" ? 1 : 0) - pk.probability }]);
    }
  }
}

/** A game's teams' record over their last `n` published picks before `day`, averaged over both sides. */
function teamForm(g: Graded, day: number, n: number): number {
  let sum = 0, k = 0;
  for (const t of [g.row.home, g.row.away]) {
    const xs = (TEAM_LOG.get(`${g.code}|${t}`) ?? []).filter((x) => x.day < day).slice(-n);
    if (xs.length < n / 2) continue;
    sum += xs.reduce((a, x) => a + x.d, 0) / xs.length;
    k++;
  }
  return k ? sum / k : 0;
}

interface Variant {
  /** Mark legs by their teams' last-8 record instead. */
  team?: number;
  name: string;
  /** Leagues allowed on a day, from their form; absent keeps every league. */
  keep?: (form: Map<string, { form: number; n: number }>) => Set<string>;
  window?: number;
  /** Mark legs down (or up) by their league's form instead of excluding. */
  shrink?: number;
  options?: HubBuildOptions;
}

const ranked = (form: Map<string, { form: number; n: number }>, minN: number) =>
  [...form].filter(([, f]) => f.n >= minN).sort((a, b) => b[1].form - a[1].form);

function topK(k: number, minN = 6) {
  return (form: Map<string, { form: number; n: number }>) => {
    const r = ranked(form, minN);
    // Leagues with too few recent games stay in: no evidence either way.
    const thin = [...form].filter(([, f]) => f.n < minN).map(([c]) => c);
    return new Set([...r.slice(0, k).map(([c]) => c), ...thin]);
  };
}
function dropBottom(k: number, minN = 6) {
  return (form: Map<string, { form: number; n: number }>) => {
    const r = ranked(form, minN);
    const out = new Set(form.keys());
    for (const [c] of r.slice(-k)) out.delete(c);
    return out;
  };
}
function atLeast(bar: number, minN = 6) {
  return (form: Map<string, { form: number; n: number }>) =>
    new Set([...form].filter(([, f]) => f.n < minN || f.form >= bar).map(([c]) => c));
}

const VARIANTS: Variant[] = [
  { name: "baseline: every league (production)" },
  { name: "30d form >= 0", window: 30, keep: atLeast(0) },
  { name: "60d form >= 0", window: 60, keep: atLeast(0) },
  { name: "90d form >= 0", window: 90, keep: atLeast(0) },
  { name: "30d form >= -5pt", window: 30, keep: atLeast(-0.05) },
  { name: "60d form >= -5pt", window: 60, keep: atLeast(-0.05) },
  { name: "30d top 8 leagues", window: 30, keep: topK(8) },
  { name: "60d top 8 leagues", window: 60, keep: topK(8) },
  { name: "60d top 5 leagues", window: 60, keep: topK(5) },
  { name: "30d drop bottom 4", window: 30, keep: dropBottom(4) },
  { name: "60d drop bottom 4", window: 60, keep: dropBottom(4) },
  { name: "90d drop bottom 4", window: 90, keep: dropBottom(4) },
  { name: "60d legs marked by league form (x1)", window: 60, shrink: 1 },
  { name: "60d legs marked by league form (x0.5)", window: 60, shrink: 0.5 },
  { name: "legs marked by teams' last 8 (x0.5)", team: 0.5 },
  { name: "legs marked by teams' last 8 (x1)", team: 1 },
];

interface TierStat {
  built: number;
  landed: number;
  expected: number;
  staked: number;
  returned: number;
}

function replay(all: Graded[], byLeague: Map<string, Sample[]>, days: number[], v: Variant, from: number, to: number) {
  const byDay = new Map<number, Graded[]>();
  for (const g of all) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  const rows = new Map(all.map((g) => [g.p.match.id, g.row]));
  const stats = new Map(HUB_LIVE_TIERS.filter((t) => t.days === 1).map((t) => [t.id, { built: 0, landed: 0, expected: 0, staked: 0, returned: 0 } as TierStat]));
  let hubDays = 0, anyDays = 0;
  for (const day of days) {
    if (day < from || day >= to) continue;
    const form = v.window ? formOn(byLeague, day, v.window) : new Map();
    const keep = v.keep?.(form);
    const pool: PoolEntry[] = byDay
      .get(day)!
      .filter((g) => !keep || keep.has(g.code))
      .map((g) => ({ prediction: g.p, candidates: candidates(g) }))
      .filter((e) => e.candidates.length > 0);
    const quality = v.shrink
      ? (() => {
          const byMatch = new Map(byDay.get(day)!.map((g) => [g.p.match.id, form.get(g.code)]));
          return { byMatch };
        })()
      : v.team
        ? { byMatch: new Map(byDay.get(day)!.map((g) => [g.p.match.id, { form: teamForm(g, day, 8), n: 99 }])) }
        : null;
    let codes;
    if (quality) {
      // Rank legs by stated chance plus the league's recent landed-minus-stated.
      const adj = new Map<string, number>();
      for (const e of pool) {
        const f = quality.byMatch.get(e.prediction.match.id);
        adj.set(e.prediction.match.id, f && f.n >= 6 ? (v.shrink ?? v.team!) * f.form : 0);
      }
      const marked = pool.map((e) => ({
        ...e,
        candidates: e.candidates.map((c) => ({ ...c, probability: Math.min(0.99, c.probability + adj.get(e.prediction.match.id)!) })),
      }));
      codes = buildHub(marked, String(day), marked, hubMarketAllowed, v.options);
      // Grade at the stated chance, not the marked one.
      const orig = new Map(pool.flatMap((e) => e.candidates.map((c) => [`${e.prediction.match.id}|${c.market}`, c.probability] as const)));
      codes = codes.map((c) => ({ ...c, legs: c.legs.map((l) => ({ ...l, probability: orig.get(`${l.matchId}|${l.market}`) ?? l.probability })) }));
    } else {
      codes = buildHub(pool, String(day), pool, hubMarketAllowed, v.options);
    }
    const daily = codes.filter((c) => hubTier(c.tier)!.days === 1);
    if (!daily.length) continue;
    hubDays++;
    let any = false;
    for (const c of daily) {
      const s = stats.get(c.tier)!;
      s.built++;
      s.expected += c.legs.reduce((a, l) => a * l.probability, 1);
      const load = c.legs.reduce((a, l) => a * (closingPrice(l.market, rows.get(l.matchId)!) ?? l.fairOdds / 1.07), 1);
      const landed = c.legs.every((l) => {
        const r = won(l.market, rows.get(l.matchId)!);
        return r === "win" || r === "push";
      });
      s.staked++;
      if (landed) {
        s.landed++;
        s.returned += load;
        any = true;
      }
    }
    if (any) anyDays++;
  }
  return { stats, hubDays, anyDays };
}

function print(name: string, r: ReturnType<typeof replay>) {
  let built = 0, landed = 0, expected = 0, staked = 0, returned = 0;
  const cells: string[] = [];
  for (const [tier, s] of r.stats) {
    built += s.built;
    landed += s.landed;
    expected += s.expected;
    staked += s.staked;
    returned += s.returned;
    cells.push(`${tier}: ${s.built ? ((100 * s.landed) / s.built).toFixed(0).padStart(2) : " —"}%/${s.built ? ((100 * s.expected) / s.built).toFixed(0).padStart(2) : " —"}% n${String(s.built).padStart(3)}`);
  }
  console.log(
    `  ${name.padEnd(40)} days ${String(r.hubDays).padStart(3)}  any landed ${((100 * r.anyDays) / Math.max(1, r.hubDays)).toFixed(0).padStart(2)}%  codes ${String(built).padStart(4)} landed ${String(landed).padStart(3)} (exp ${expected.toFixed(0).padStart(3)})  ROI ${(((returned - staked) / Math.max(1, staked)) * 100).toFixed(1).padStart(6)}%  | ${cells.join("  ")}`,
  );
}

async function main() {
  const days = Number(arg("days") ?? 365);
  const all: Graded[] = [];
  for (const d of DIVS) {
    process.stderr.write(`${d.div}… `);
    // Walk 90 days longer than the replay so every day has a form history.
    all.push(...walk(d, await load(d.div), days + 90));
  }
  process.stderr.write(`\n${all.length} publishable fixtures\n`);
  all.sort((a, b) => a.day - b.day);
  const ss = samples(all);
  const byLeague = new Map<string, Sample[]>();
  for (const s of ss) byLeague.set(s.code, [...(byLeague.get(s.code) ?? []), s]);
  const allDays = [...new Set(all.map((g) => g.day))].sort((a, b) => a - b);
  persistence(ss, byLeague, allDays);
  teamPersistence(all);
  buildTeamLog(all);
  if (process.argv.includes("--teams-only")) return;

  const start = allDays[allDays.length - 1] - days * DAY;
  const mid = start + (days / 2) * DAY;
  const end = allDays[allDays.length - 1] + DAY;
  const periods: [string, number, number][] = [
    [`whole replay (${days} days)`, start, end],
    ["first half", start, mid],
    ["second half", mid, end],
  ];
  const owner = Date.parse("2026-09-01");
  if (owner > start) periods.push(["Sep-Oct 2026", owner, end]);
  console.log("\n2. CODE HUB, DAILY CODES (landed% / expected% per tier; ROI at the closing price the code loads at)");
  for (const [label, from, to] of periods) {
    console.log(`\n ${label}`);
    for (const v of VARIANTS) print(v.name, replay(all, byLeague, allDays, v, from, to));
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
