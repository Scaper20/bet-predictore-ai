import { describe, expect, it } from "vitest";
import { saferCode, targetCode, type EditorGame, type EditorPick } from "./code-editor";

const pick = (market: string, probability: number): EditorPick => ({
  market,
  label: market,
  probability,
  fairOdds: Math.round((1 / probability) * 100) / 100,
});

function game(id: string, current: EditorPick | null, candidates: EditorPick[]): EditorGame {
  return { matchId: id, homeName: `${id}H`, awayName: `${id}A`, kickoff: 1, league: "Premier League", current, candidates };
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

describe("targetCode", () => {
  it("climbs from the safest version toward the asked price", () => {
    const safe = saferCode([a, b, c]);
    const out = targetCode([a, b, c], 6);
    // Near the target: these games can make 5.68 or 8.17 but nothing between.
    expect(out.fairOdds).toBeGreaterThanOrEqual(6 * 0.8);
    expect(out.fairOdds).toBeLessThanOrEqual(6 * 1.35);
    expect(out.chance).toBeLessThan(safe.chance);
  });

  it("stays at the safest version when the target is already met", () => {
    const out = targetCode([a, b, c], 2);
    expect(out.games.map((g) => g.market)).toEqual(saferCode([a, b, c]).games.map((g) => g.market));
  });

  it("gets as close as the games allow when the target is out of reach", () => {
    const out = targetCode([b], 50);
    expect(out.games[0].market).toBe("1x2:away");
  });
});
