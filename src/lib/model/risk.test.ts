import { describe, expect, it } from "vitest";
import { LOW_RISK_FROM, MEDIUM_RISK_FROM, riskFor } from "./risk";

describe("riskFor", () => {
  it("labels by the model's probability, on the track record's cut points", () => {
    expect(riskFor(0.82)).toBe("low");
    expect(riskFor(LOW_RISK_FROM)).toBe("low");
    expect(riskFor(0.6499)).toBe("medium");
    expect(riskFor(MEDIUM_RISK_FROM)).toBe("medium");
    expect(riskFor(0.5499)).toBe("high");
    expect(riskFor(0.12)).toBe("high");
  });
});
