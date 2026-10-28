import { describe, expect, it } from "vitest";
import { lineTables } from "./line-tables";
import type { LineRow } from "./sportybet-lines";

const row = (market: string, probability: number, price: number | null, refund = 0, fair = 1 / probability): LineRow => ({ market, label: market, probability, refund, price, fair });

describe("lineTables", () => {
  it("pairs one side's handicap with the other's, rows by the home line", () => {
    const [t] = lineTables(
      [row("ah:away:0.5", 0.27, 3.8), row("ah:home:-0.5", 0.73, 1.3), row("ah:away:1", 0.49, 3.1, 0.22), row("ah:home:-1", 0.29, 1.4, 0.22)],
      "Celtic",
      "Dundee",
    );
    expect(t.sides).toEqual(["Celtic", "Dundee"]);
    expect(t.lineLabel).toBe("Celtic's line");
    expect(t.rows.map((r) => r.line)).toEqual(["-1", "-0.5"]);
    expect(t.rows[0].cells[1]).toMatchObject({ market: "ah:away:1", refund: 0.22, price: 3.1 });
    expect(t.rows[0].cells[1]!.win).toBeCloseTo(0.27, 9);
    expect(t.rows[1].cells[0]!.market).toBe("ah:home:-0.5");
  });

  it("puts over beside under, one table per question, and marks value", () => {
    const ts = lineTables(
      [row("corners:home:over:4.5", 0.6, 1.9), row("corners:home:under:4.5", 0.4, 1.8), row("corners:over:9.5", 0.52, 1.85), row("corners:most:home", 0.6, 1.5)],
      "Celtic",
      "Dundee",
    );
    expect(ts.map((t) => t.title)).toEqual(["Celtic corners", "Total corners", "Most corners"]);
    expect(ts[0].rows).toEqual([{ line: "4.5", cells: [expect.objectContaining({ value: true }), expect.objectContaining({ value: false })] }]);
    expect(ts[2].sides).toEqual(["Celtic", "Level", "Dundee"]);
    expect(ts[2].rows[0].cells.map((c) => c?.market ?? null)).toEqual(["corners:most:home", null, null]);
  });
});
