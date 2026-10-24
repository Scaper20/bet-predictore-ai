import { describe, expect, it } from "vitest";
import { gradeLeg, priceLeg, refundShare } from "./leg-pricing";
import { scoreMatrix } from "@/lib/model/poisson";

/** A grid where every listed (home, away) result has the given chance. */
function grid(cells: [number, number, number][], size = 8): number[][] {
  const g = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (const [i, j, p] of cells) g[i][j] = p;
  return g;
}

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 10);

describe("gradeLeg", () => {
  it("settles whole lines as a refund on the line", () => {
    expect(gradeLeg("ah:home:-2", 3, 1)).toBe("push");
    expect(gradeLeg("ah:away:2", 3, 1)).toBe("push");
    expect(gradeLeg("ou:over:3", 2, 1)).toBe("push");
    expect(gradeLeg("tg:home:over:1", 1, 0)).toBe("push");
  });

  it("splits a quarter line into half a win or half a loss", () => {
    expect(gradeLeg("ah:home:-0.75", 1, 0)).toBe("halfWin"); // -0.5 wins, -1 refunds
    expect(gradeLeg("ah:home:-0.75", 2, 0)).toBe("win");
    expect(gradeLeg("ah:home:-0.25", 1, 1)).toBe("halfLose"); // 0 refunds, -0.5 loses
    expect(gradeLeg("ah:away:0.25", 1, 1)).toBe("halfWin");
    expect(gradeLeg("ou:over:2.25", 1, 1)).toBe("halfLose");
    expect(gradeLeg("ou:over:2.75", 2, 1)).toBe("halfWin");
    expect(gradeLeg("ou:under:2.25", 1, 1)).toBe("halfWin");
  });

  it("grades the three-way handicap as a result after the head start", () => {
    expect(gradeLeg("eh:home:-2", 3, 0)).toBe("win");
    expect(gradeLeg("eh:draw:-2", 3, 1)).toBe("win");
    expect(gradeLeg("eh:away:-2", 2, 1)).toBe("win");
    expect(gradeLeg("eh:home:1", 1, 1)).toBe("win");
    expect(gradeLeg("eh:draw:1", 1, 2)).toBe("win");
  });

  it("grades count markets, the level result included", () => {
    expect(gradeLeg("corners:most:level", 5, 5)).toBe("win");
    expect(gradeLeg("corners:most:level", 6, 5)).toBe("lose");
    expect(gradeLeg("corners:home:over:4.5", 5, 1)).toBe("win");
    expect(gradeLeg("corners:hcp:away:+2.5", 7, 5)).toBe("win");
    expect(gradeLeg("bookings:over:4.5", 3, 2)).toBe("win");
    expect(gradeLeg("shots:hcp:home:-2", 12, 10)).toBe("push");
  });

  it("refuses what it can't grade", () => {
    expect(gradeLeg("cs:9-9-9", 1, 0)).toBeNull();
    expect(gradeLeg("players:anytime:x", 1, 0)).toBeNull();
  });
});

describe("priceLeg", () => {
  const goals = grid([[0, 0, 0.1], [1, 0, 0.2], [2, 0, 0.15], [3, 0, 0.05], [1, 1, 0.2], [0, 1, 0.15], [2, 1, 0.15]]);

  it("adds up every settlement and counts a refund as surviving", () => {
    const p = priceLeg("ah:home:-1", { goals })!;
    close(p.win, 0.15 + 0.05); // won by 2+
    close(p.push, 0.2 + 0.15); // won by exactly 1
    close(p.lose, 0.1 + 0.2 + 0.15);
    close(p.survive, 0.55);
    close(refundShare(p), 0.35);
  });

  it("prices quarter lines with the half settlements", () => {
    const p = priceLeg("ah:home:-0.75", { goals })!;
    close(p.win, 0.2);
    close(p.halfWin, 0.35);
    close(p.lose, 0.45);
    close(p.win + p.halfWin + p.push + p.halfLose + p.lose, 1);
  });

  it("agrees with the plain markets where nothing can push", () => {
    const g = scoreMatrix(1.6, 1.1, -0.05);
    const home = priceLeg("1x2:home", { goals: g })!;
    const ah = priceLeg("ah:home:-0.5", { goals: g })!;
    close(home.win, ah.win);
    const ehDraw = priceLeg("eh:draw:-1", { goals: g })!.win;
    const byOne = g.reduce((s, row, i) => s + (i >= 1 ? row[i - 1] : 0), 0);
    close(ehDraw, byOne);
  });

  it("prices count legs from that family's grid, and only from it", () => {
    const corners = grid([[5, 4, 0.5], [4, 4, 0.3], [3, 6, 0.2]], 12);
    close(priceLeg("corners:most:home", { stats: { corners } })!.win, 0.5);
    close(priceLeg("corners:most:level", { stats: { corners } })!.win, 0.3);
    close(priceLeg("corners:over:8.5", { stats: { corners } })!.win, 0.7);
    expect(priceLeg("shots:over:20.5", { stats: { corners } })).toBeNull();
    expect(priceLeg("corners:over:8.5", { goals })).toBeNull();
  });

  it("prices a goals combo on one grid; a count part makes it unpriceable", () => {
    const p = priceLeg("combo:1x2:home+ou:over:1.5", { goals })!;
    close(p.win, 0.15 + 0.05 + 0.15);
    expect(priceLeg("combo:1x2:home+corners:over:8.5", { goals })).toBeNull();
  });
});
