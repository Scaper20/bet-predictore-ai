import { describe, it, expect } from "vitest";
import { classifySegment, SURVEY_QUESTIONS } from "@/lib/outreach";

describe("classifySegment", () => {
  it("classifies a null subscription row as free", () => {
    expect(classifySegment(null)).toBe("free");
  });

  it("classifies an active paid tier as subscribed", () => {
    expect(classifySegment({ tier: "pro", status: "active" })).toBe("subscribed");
    expect(classifySegment({ tier: "vip", status: "active" })).toBe("subscribed");
    expect(classifySegment({ tier: "pass", status: "active" })).toBe("subscribed");
  });

  it("still counts past_due (grace period) as subscribed", () => {
    expect(classifySegment({ tier: "pro", status: "past_due" })).toBe("subscribed");
  });

  it("classifies a cancelled or none-status row as free regardless of tier", () => {
    expect(classifySegment({ tier: "pro", status: "cancelled" })).toBe("free");
    expect(classifySegment({ tier: "vip", status: "none" })).toBe("free");
  });

  it("classifies a free-tier row as free", () => {
    expect(classifySegment({ tier: "free", status: "none" })).toBe("free");
  });
});

describe("SURVEY_QUESTIONS", () => {
  it("gives both surveys a unique id per question", () => {
    for (const survey of ["survey_subscribed", "survey_free"] as const) {
      const ids = SURVEY_QUESTIONS[survey].map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every choice/scale question carries options", () => {
    for (const survey of ["survey_subscribed", "survey_free"] as const) {
      for (const q of SURVEY_QUESTIONS[survey]) {
        if (q.type === "choice" || q.type === "scale") {
          expect(q.options && q.options.length).toBeTruthy();
        }
      }
    }
  });

  it("stays short enough to plausibly fit in a couple of minutes", () => {
    for (const survey of ["survey_subscribed", "survey_free"] as const) {
      expect(SURVEY_QUESTIONS[survey].length).toBeLessThanOrEqual(8);
    }
  });
});
