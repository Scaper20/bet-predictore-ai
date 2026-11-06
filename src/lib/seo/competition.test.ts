import { describe, expect, it } from "vitest";
import { competitionFaq, trackRecordLine } from "./competition";

describe("trackRecordLine", () => {
  it("quotes the record with its date once there are enough picks", () => {
    const line = trackRecordLine("NPFL", { wins: 30, losses: 20, pushes: 1, winRate: 0.6, sample: 50 }, "6 November 2026");
    expect(line).toContain("As of 6 November 2026");
    expect(line).toContain("50 published NPFL picks: 30 won and 20 lost, a 60% hit rate");
  });
  it("quotes no rate on a thin sample", () => {
    const line = trackRecordLine("AFCON", { wins: 3, losses: 2, pushes: 0, winRate: 0.6, sample: 5 }, "6 November 2026");
    expect(line).toContain("5 published AFCON picks, too few");
    expect(line).not.toContain("%");
  });
  it("handles no record at all", () => {
    expect(trackRecordLine("X", undefined, "d")).toContain("0 published X picks");
  });
  it("gives the faq the same line", () => {
    expect(competitionFaq("NPFL", "L")[1].a).toBe("L");
  });
});
