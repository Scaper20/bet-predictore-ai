import { describe, expect, it } from "vitest";
import { saferCode, targetCode, type EditorGame, type EditorPick } from "./code-editor";

/** A pick as SportyBet lists it: its price is the fair one less a 5% margin. */
const pick = (market: string, probability: number): EditorPick => ({
  market,
  label: market,
  probability,
  fairOdds: Math.round((1 / probability) * 100) / 100,
  price: Math.round((1 / probability / 1.05) * 100) / 100,
});

function game(id: string, current: EditorPick | null, candidates: EditorPick[], ladder: EditorPick[] = []): EditorGame {
  return { matchId: id, homeName: `${id}H`, awayName: `${id}A`, kickoff: 1, league: "Premier League", current, candidates, ladder };
}

const a = game("a", pick("1x2:away", 0.3), [pick("dc:home-draw", 0.7), pick("ou:over:1.5", 0.78), pick("1x2:home", 0.45), pick("ou:over:0.5", 0.95)]);
const b = game("b", pick("btts:yes", 0.55), [pick("dc:away-draw", 0.62), pick("btts:yes", 0.55), pick("1x2:away", 0.35)]);
const c = game("c", null, [pick("ou:over:1.5", 0.72), pick("1x2:home", 0.5)]);

describe("saferCode", () => {
  it("takes the most likely pick worth having on each game", () => {
    const out = saferCode([a, b, c]);
    expect(out.games.map((g) => g.market)).toEqual(["ou:over:1.5", "dc:away-draw", "ou:over:1.5"]);
    // Over 0.5 at 1.05 pays almost nothing: never chosen.
    expect(out.games[0].from?.market).toBe("1x2:away");
    expect(out.games[2].from).toBeNull();
    expect(out.chance).toBeCloseTo(0.78 * 0.62 * 0.72, 3);
  });

  it("keeps the user's pick when nothing is clearly safer", () => {
    const steady = game("d", pick("dc:home-draw", 0.8), [pick("dc:home-draw", 0.8), pick("ou:over:1.5", 0.81)]);
    expect(saferCode([steady]).games[0]).toMatchObject({ market: "dc:home-draw", from: null });
  });

  it("drops a game it has nothing to offer on", () => {
    const empty = game("e", null, [pick("ou:over:0.5", 0.96)]);
    expect(saferCode([a, empty]).games.map((g) => g.matchId)).toEqual(["a"]);
  });
});

describe("saferCode policy", () => {
  it("makes the user's own bet safer before changing it", () => {
    const g = game("o", pick("ou:over:2.5", 0.48), [pick("dc:home-draw", 0.8)], [pick("ou:over:1.5", 0.74)]);
    const out = saferCode([g]).games[0];
    expect(out).toMatchObject({ market: "ou:over:1.5", action: "line" });
    expect(out.why).toMatch(/safer line: 48% to 74%/);
  });

  it("keeps a solid pick even when a safer one exists", () => {
    const g = game("s", pick("btts:yes", 0.62), [pick("dc:home-draw", 0.85)]);
    expect(saferCode([g]).games[0]).toMatchObject({ market: "btts:yes", action: "kept", from: null });
  });

  it("takes off a long shot nothing on the game rescues, and says why", () => {
    const g = game("x", pick("raw:45::288", 0.09), [pick("1x2:home", 0.4)]);
    const out = saferCode([g]);
    expect(out.games).toHaveLength(0);
    expect(out.removed?.[0].why).toMatch(/too long a shot/);
  });

  it("keeps a shaky pick when nothing safer is on offer", () => {
    const g = game("k", pick("btts:yes", 0.52), []);
    expect(saferCode([g]).games[0]).toMatchObject({ market: "btts:yes", action: "kept" });
  });
});

describe("targetCode", () => {
  it("climbs from the safest version toward the asked price", () => {
    const safe = saferCode([a, b, c]);
    const out = targetCode([a, b, c], 6);
    expect(out.odds).toBeGreaterThanOrEqual(6 * 0.8);
    expect(out.odds).toBeLessThanOrEqual(6 * 1.35);
    expect(out.chance).toBeLessThan(safe.chance);
  });

  it("takes the least likely games off when even the safest picks pay more than asked", () => {
    const out = targetCode([a, b, c], 2);
    expect(out.odds).toBeGreaterThanOrEqual(1.9);
    expect(out.odds).toBeLessThanOrEqual(2.1);
    expect(out.removed?.length).toBeGreaterThan(0);
  });

  it("lands inside Forge's band when the games allow it", () => {
    const wide = [0, 1, 2, 3].map((i) =>
      game(`w${i}`, pick("ou:over:2.5", 0.5), [pick("dc:home-draw", 0.8), pick("1x2:home", 0.55)], [pick("ou:over:1.5", 0.75), pick("ou:over:0.5", 0.9)]),
    );
    const out = targetCode(wide, 5);
    expect(out.odds).toBeGreaterThanOrEqual(4.75);
    expect(out.odds).toBeLessThanOrEqual(5.25);
    expect(out.notes).toBeUndefined();
  });

  it("aims at SportyBet's prices, not the model's fair ones", () => {
    // SportyBet pays 12% under fair here: aiming at fair odds of 8 would book about 5.5.
    const short = (m: string, p: number): EditorPick => ({ ...pick(m, p), price: Math.round((1 / p / 1.12) * 100) / 100 });
    const games = [0, 1, 2, 3, 4].map((i) =>
      game(`s${i}`, short("ou:over:2.5", 0.5), [short("dc:home-draw", 0.8), short("1x2:home", 0.55)], [short("ou:over:1.5", 0.75)]),
    );
    const out = targetCode(games, 8);
    expect(out.odds).toBeGreaterThanOrEqual(7.6);
    expect(out.odds).toBeLessThanOrEqual(8.4);
    expect(out.fairOdds).toBeGreaterThan(out.odds!);
  });

  it("never re-picks to a pick SportyBet has no price for, and marks an unpriced pick of the user's as an estimate", () => {
    const unpriced = (m: string, p: number): EditorPick => ({ ...pick(m, p), price: undefined });
    const g = game("u", unpriced("combo:1x2:home+btts:yes", 0.3), [unpriced("combo:1x2:home+ou:over:1.5", 0.45), pick("dc:home-draw", 0.7)]);
    const out = targetCode([g], 3.2);
    expect(out.games[0].market).not.toBe("combo:1x2:home+ou:over:1.5");
    const stuck = targetCode([game("v", unpriced("combo:1x2:home+btts:yes", 0.3), [])], 3);
    expect(stuck.oddsEstimated).toBe(true);
    expect(stuck.notes?.some((n) => /estimate/.test(n))).toBe(true);
  });

  it("gets as close as the games allow when the target is out of reach", () => {
    const out = targetCode([b], 50);
    expect(out.games[0].market).toBe("1x2:away");
  });
});
