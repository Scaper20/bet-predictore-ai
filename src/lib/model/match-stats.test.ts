import { describe, expect, it } from "vitest";
import { expectStat, fitStat, nbPmf, statGrid, statMarkets, STAT_LINES, STAT_OPTIONS, type StatSample } from "./match-stats";

const DAY = 86_400_000;
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe("count distributions", () => {
  it("negative binomial sums to one and keeps its mean", () => {
    const p = nbPmf(10, 12, 80);
    expect(sum(p)).toBeCloseTo(1, 6);
    expect(sum(p.map((x, k) => x * k))).toBeCloseTo(10, 3);
    const poisson = nbPmf(4, Infinity, 40);
    expect(poisson[0]).toBeCloseTo(Math.exp(-4), 9);
  });

  it("builds a joint grid with the expected means, and a spread split pulls the sides apart", () => {
    const g = statGrid({ home: 6, away: 4 }, { kTotal: 30, rho: 0.08 }, 34);
    const m = statMarkets(g, STAT_LINES.corners);
    expect(sum(g.flat())).toBeCloseTo(1, 6);
    expect(m.expected.home).toBeCloseTo(6, 1);
    expect(m.expected.away).toBeCloseTo(4, 1);
    expect(m.result.home + m.result.draw + m.result.away).toBeCloseTo(1, 6);
    // Level handicap: a push is exactly a draw on corners.
    expect(m.handicap["0"].push).toBeCloseTo(m.result.draw, 9);
    expect(m.handicap["-0.5"].home).toBeCloseTo(m.result.home, 9);

    // Covariance of home and away is negative with an overdispersed split.
    let eh = 0, ea = 0, eha = 0;
    g.forEach((row, i) => row.forEach((p, j) => { eh += i * p; ea += j * p; eha += i * j * p; }));
    expect(eha - eh * ea).toBeLessThan(0);
  });
});

describe("fitStat", () => {
  // A season where Corner FC wins about 8 corners a game and Park Bus FC about 3.
  const teams = ["Corner FC", "Park Bus FC", "Mid A", "Mid B"];
  const level: Record<string, number> = { "Corner FC": 8, "Park Bus FC": 3, "Mid A": 5, "Mid B": 5 };
  const samples: StatSample[] = [];
  let d = Date.UTC(2025, 7, 1);
  for (let round = 0; round < 12; round++) {
    for (const h of teams) for (const a of teams) {
      if (h === a) continue;
      samples.push({ date: d, home: h, away: a, h: level[h], a: level[a] - 1, referee: round % 2 ? "Strict" : "Calm" });
      d += DAY;
    }
  }
  const now = d + DAY;

  it("rates the side that wins more corners higher", () => {
    const fit = fitStat(samples, now, STAT_OPTIONS.corners);
    expect(fit.attack.get("Corner FC")!).toBeGreaterThan(fit.attack.get("Park Bus FC")!);
    const e = expectStat(fit, "Corner FC", "Park Bus FC");
    expect(e.home).toBeGreaterThan(e.away);
  });

  it("learns a referee who books more", () => {
    const cards = samples.map((s) => (s.referee === "Strict" ? { ...s, h: 3, a: 3 } : { ...s, h: 1, a: 1 }));
    const fit = fitStat(cards, now, STAT_OPTIONS.cards);
    expect(fit.referee.get("Strict")!).toBeGreaterThan(1);
    expect(fit.referee.get("Calm")!).toBeLessThan(1);
    const strict = expectStat(fit, "Mid A", "Mid B", "Strict");
    const calm = expectStat(fit, "Mid A", "Mid B", "Calm");
    expect(strict.home + strict.away).toBeGreaterThan(calm.home + calm.away);
  });

  it("ignores matches on or after the fit date", () => {
    const fit = fitStat(samples, samples[10].date, STAT_OPTIONS.corners);
    expect(fit.matches).toBe(10);
  });
});
