/**
 * Improvement search, step 3: does a better probability source make better
 * picks, and which pick policy turns it into hits?
 *
 * One pick a fixture from a universe of the selections the product publishes
 * (result, double chance, over 1.5 / 2.5 / 3.5, draw no bet), under three
 * policies, for each probability source:
 *
 *   cap       the likeliest selection at or under CAP (the price constraint),
 *             published only at FLOOR or over;
 *   rolling   the sweet-spot procedure, but re-derived every month from the
 *             trailing two years of the SAME source (so it adapts to whatever
 *             probabilities it is given), falling back to `cap`;
 *   curve     hit rate of the `cap` pick at several coverage levels (a rank-
 *             based rule: publish only the top share by chance).
 *
 *   npx tsx scripts/improve-picks.ts --dir=<lab dir> [--cap=0.8] [--floor=0.65]
 */
import {
  AnchorCache, anchoredBlend, fair3, loadLab, probsOf, result3,
  type Fixture, type Probs,
} from "./lib/improve-core";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const dirs = (arg("dir") ?? "/tmp/lab").split(",");
const dir = dirs[0];
const CAP = Number(arg("cap") ?? 0.8);
const FLOOR = Number(arg("floor") ?? 0.65);
const DAY = 86_400_000;
const fixtures = loadLab(dirs).filter((f) => f.v.base);
const cache = new AnchorCache(`${dir}/../anchored.json`);

interface Item { id: string; p: number; win: boolean | null; price?: number }

/** The universe, with the model's chance, the outcome and (where the market priced it) the closing price. */
function itemsOf(f: Fixture, q: Probs): Item[] {
  const r = result3(f);
  const total = f.hg + f.ag;
  const fp = f.close ? fair3(f.close) : null;
  const dcPrice = (p: number) => (fp ? 1 / p / 1.05 : undefined);
  const items: Item[] = [
    { id: "1x2:home", p: q.home, win: r === 0, price: f.close?.home },
    { id: "1x2:away", p: q.away, win: r === 2, price: f.close?.away },
    { id: "dc:home-draw", p: q.home + q.draw, win: r !== 2, price: fp ? dcPrice(fp[0] + fp[1]) : undefined },
    { id: "dc:away-draw", p: q.away + q.draw, win: r !== 0, price: fp ? dcPrice(fp[2] + fp[1]) : undefined },
    { id: "dc:home-away", p: q.home + q.away, win: r !== 1, price: fp ? dcPrice(fp[0] + fp[2]) : undefined },
    { id: "ou:over:1.5", p: q.o15, win: total > 1.5 },
    { id: "ou:over:2.5", p: q.o25, win: total > 2.5, price: f.closeOu?.over },
    { id: "ou:over:3.5", p: q.o35, win: total > 3.5 },
    // Draw no bet: the stake back on a draw, so a draw is neither a win nor a loss.
    { id: "ah:home:0", p: q.home / Math.max(1e-9, 1 - q.draw), win: r === 1 ? null : r === 0 },
    { id: "ah:away:0", p: q.away / Math.max(1e-9, 1 - q.draw), win: r === 1 ? null : r === 2 },
  ];
  return items;
}

type Source = (f: Fixture) => [number, number, number] | null;
/**
 * --sources=v:<variant>,a:<variant>:<w>,... where v is a variant as the lab
 * recorded it and a is that variant pulled toward the market's early-week price
 * by w (0 = the model, 1 = the price's own rates).
 */
const SOURCES: Record<string, Source> = {};
for (const spec of (arg("sources") ?? "v:base,v:hl365,a:base:0.5,a:base:1").split(",")) {
  const [kind, name, w] = spec.split(":");
  if (kind === "v") SOURCES[spec] = (f) => f.v[name] ?? null;
  else SOURCES[spec] = (f) => (f.v[name] ? anchoredBlend(f, cache, "open", Number(w), name) : null);
}

interface Pick { f: Fixture; id: string; p: number; win: boolean | null; price?: number }

function allItems(src: Source, fx: Fixture[]): { f: Fixture; items: Item[] }[] {
  const out: { f: Fixture; items: Item[] }[] = [];
  for (const f of fx) {
    const r = src(f);
    if (!r) continue;
    out.push({ f, items: itemsOf(f, probsOf(r[0], r[1], r[2])) });
  }
  return out;
}

const capPick = (items: Item[], cap = CAP): Item | null => items.filter((i) => i.p <= cap + 1e-9).sort((a, b) => b.p - a.p)[0] ?? null;

/** The month-by-month sweet-spot rules from the trailing two years of this source. */
function rollingPicks(rows: { f: Fixture; items: Item[] }[], from: number, to: number, target = 0.82): Pick[] {
  const out: Pick[] = [];
  const months = new Map<string, { f: Fixture; items: Item[] }[]>();
  for (const r of rows) {
    if (r.f.date < from || r.f.date >= to) continue;
    const k = new Date(r.f.date).toISOString().slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), r]);
  }
  for (const [k, list] of [...months].sort()) {
    const start = Date.parse(`${k}-01`);
    const train = rows.filter((r) => r.f.date < start && r.f.date >= start - 730 * DAY);
    const rules = new Map<string, { min: number; record: number }>();
    for (const id of new Set(rows[0].items.map((i) => i.id))) {
      const obs = train.map((r) => r.items.find((i) => i.id === id)!).filter((i) => i.win !== null);
      for (let t = 0.6; t <= 0.85 + 1e-9; t += 0.01) {
        const sel = obs.filter((i) => i.p >= t - 1e-9 && i.p <= 0.85);
        if (sel.length < 100) break;
        const hit = sel.filter((i) => i.win).length / sel.length;
        if (hit >= target) { rules.set(id, { min: Math.round(t * 100) / 100, record: hit }); break; }
      }
    }
    for (const r of list) {
      let best: { id: string; i: Item; record: number } | null = null;
      for (const i of r.items) {
        const rule = rules.get(i.id);
        if (!rule || i.p < rule.min || i.p > 0.85) continue;
        if (!best || rule.record > best.record) best = { id: i.id, i, record: rule.record };
      }
      const chosen = best?.i ?? capPick(r.items.filter((i) => i.p >= FLOOR));
      if (chosen) out.push({ f: r.f, id: chosen.id, p: chosen.p, win: chosen.win, price: chosen.price });
    }
  }
  return out;
}

const stat = (ps: Pick[]) => {
  const graded = ps.filter((p) => p.win !== null);
  const hit = graded.filter((p) => p.win).length / Math.max(1, graded.length);
  const stated = ps.reduce((a, p) => a + p.p, 0) / Math.max(1, ps.length);
  const priced = graded.filter((p) => p.price && p.price > 1);
  const roi = priced.length ? priced.reduce((a, p) => a + (p.win ? p.price! - 1 : -1), 0) / priced.length : NaN;
  return { n: ps.length, hit, stated, roi, priced: priced.length, se: Math.sqrt((hit * (1 - hit)) / Math.max(1, graded.length)) };
};
const pc = (x: number) => `${(100 * x).toFixed(1)}%`;

const windows: [string, number, number][] = [
  ["Aug 2023 - Jun 2025", Date.parse("2023-08-01"), Date.parse("2025-07-01")],
  ["HELD 2025-26", Date.parse("2025-07-01"), Date.parse("2026-07-01")],
  ["OWNER Sep-Oct 2026", Date.parse("2026-09-01"), Date.parse("2026-11-01")],
];

console.log(`cap ${CAP}, floor ${FLOOR}`);
for (const [name, src] of Object.entries(SOURCES)) {
  const rows = allItems(src, fixtures.filter((f) => (name.startsWith("a:") ? f.open && f.openOu : true)));
  console.log(`\n=== source: ${name}  (${rows.length} fixtures)`);
  console.log("window".padEnd(22) + "policy".padEnd(14) + "picks".padStart(7) + "hit".padStart(8) + "stated".padStart(8) + "ROI@close".padStart(11) + "  coverage curve (hit at top 100/80/60/40% by chance)");
  for (const [wn, a, b] of windows) {
    const sub = rows.filter((r) => r.f.date >= a && r.f.date < b);
    const caps = sub.map((r) => {
      const i = capPick(r.items);
      return i && i.p >= FLOOR ? ({ f: r.f, id: i.id, p: i.p, win: i.win, price: i.price } as Pick) : null;
    }).filter((x): x is Pick => x !== null);
    const sc = stat(caps);
    const sorted = [...caps].sort((x, y) => y.p - x.p);
    const curve = [1, 0.8, 0.6, 0.4].map((q) => pc(stat(sorted.slice(0, Math.round(sorted.length * q))).hit)).join(" / ");
    console.log(wn.padEnd(22) + "cap".padEnd(14) + String(sc.n).padStart(7) + pc(sc.hit).padStart(8) + pc(sc.stated).padStart(8) + (Number.isNaN(sc.roi) ? "-" : pc(sc.roi)).padStart(11) + "  " + curve);
    const rp = rollingPicks(rows, a, b);
    const sr = stat(rp);
    console.log("".padEnd(22) + "rolling rules".padEnd(14) + String(sr.n).padStart(7) + pc(sr.hit).padStart(8) + pc(sr.stated).padStart(8) + (Number.isNaN(sr.roi) ? "-" : pc(sr.roi)).padStart(11));
  }
}
cache.save();
