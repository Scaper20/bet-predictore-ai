import { describe, expect, it } from "vitest";
import {
  MIN_MEANINGFUL_EDGE,
  assessValue,
  breakEvenPrice,
  edge,
  worstLeg,
} from "@/lib/value";

describe("edge", () => {
  it("is zero at exactly the fair price", () => {
    // 50% at 2.00 is the definition of break-even, and the whole module hangs
    // off that identity.
    expect(edge(0.5, 2)).toBeCloseTo(0, 10);
    expect(edge(0.8, 1.25)).toBeCloseTo(0, 10);
  });

  it("is negative below it and positive above it", () => {
    expect(edge(0.5, 1.9)).toBeCloseTo(-0.05);
    expect(edge(0.5, 2.2)).toBeCloseTo(0.1);
  });
});

describe("breakEvenPrice", () => {
  it("is the reciprocal of the probability", () => {
    expect(breakEvenPrice(0.25)).toBeCloseTo(4);
    expect(breakEvenPrice(0.8)).toBeCloseTo(1.25);
  });
});

describe("assessValue", () => {
  it("returns nothing at all when no price was offered", () => {
    // The point of the module: with no price there is no value question, and
    // answering it would mean supplying a price.
    expect(assessValue(0.65, undefined)).toBeNull();
    expect(assessValue(0.65, Number.NaN)).toBeNull();
    // A "price" of 1.00 or less returns the stake or worse; it is not a price.
    expect(assessValue(0.65, 1)).toBeNull();
    expect(assessValue(0.65, 0.5)).toBeNull();
  });

  it("refuses to assess a probability that cannot carry a price", () => {
    expect(assessValue(0, 2)).toBeNull();
    expect(assessValue(1, 2)).toBeNull();
  });

  it("calls a short price a losing bet, however often it lands", () => {
    // 80% at 1.20 lands four times in five and still bleeds.
    const v = assessValue(0.8, 1.2)!;
    expect(v.rating).toBe("no-bet");
    expect(v.edge).toBeCloseTo(-0.04);
    expect(v.breakEven).toBeCloseTo(1.25);
    expect(v.reason).toContain("1.25");
  });

  it("does not dress a sliver of edge up as value", () => {
    // Inside the model's own calibration error, so it is not a signal.
    const v = assessValue(0.5, 2.02)!;
    expect(v.edge).toBeCloseTo(0.01);
    expect(v.edge).toBeLessThan(MIN_MEANINGFUL_EDGE);
    expect(v.rating).toBe("thin");
  });

  it("calls a genuinely long price value", () => {
    const v = assessValue(0.5, 2.2)!;
    expect(v.rating).toBe("value");
    expect(v.edge).toBeCloseTo(0.1);
  });

  it("puts the boundary exactly at the measured error band", () => {
    const atFloor = assessValue(0.5, 2 * (1 + MIN_MEANINGFUL_EDGE))!;
    expect(atFloor.rating).toBe("value");
    const justUnder = assessValue(0.5, 2 * (1 + MIN_MEANINGFUL_EDGE) - 0.01)!;
    expect(justUnder.rating).toBe("thin");
  });

  it("treats the exact fair price as thin, not as value", () => {
    const v = assessValue(0.625, 1.6)!;
    expect(v.edge).toBeCloseTo(0, 10);
    expect(v.rating).toBe("thin");
  });
});

describe("worstLeg", () => {
  const read = (l: { probability: number; price?: number }) => ({
    probability: l.probability,
    price: l.price,
  });

  it("finds the leg a combined average would hide", () => {
    // Together these look acceptable; one of them is a straight loss.
    const legs = [
      { probability: 0.5, price: 2.6 },
      { probability: 0.8, price: 1.15 },
      { probability: 0.5, price: 2.1 },
    ];
    const worst = worstLeg(legs, read)!;
    expect(worst.leg.price).toBe(1.15);
    expect(worst.verdict.rating).toBe("no-bet");
  });

  it("ignores legs with no price rather than treating them as bad", () => {
    const legs = [{ probability: 0.5, price: undefined }, { probability: 0.5, price: 2.5 }];
    const worst = worstLeg(legs, read)!;
    expect(worst.leg.price).toBe(2.5);
  });

  it("is null when nothing has been priced", () => {
    expect(worstLeg([{ probability: 0.5, price: undefined }], read)).toBeNull();
    expect(worstLeg([], read)).toBeNull();
  });
});
