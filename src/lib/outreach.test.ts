import { describe, it, expect } from "vitest";
import { classifySegment, SURVEY_QUESTIONS, answerLabel, averageAnswer } from "@/lib/outreach";

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

describe("answerLabel", () => {
  const choiceQuestion = SURVEY_QUESTIONS.survey_free.find((q) => q.id === "blocker")!;

  it("maps a stored option value back to its display label", () => {
    expect(answerLabel(choiceQuestion, "price")).toBe("Price");
  });

  it("falls back to the raw value for an option that no longer exists", () => {
    expect(answerLabel(choiceQuestion, "some_removed_option")).toBe("some_removed_option");
  });

  it("returns free text as-is for a text question", () => {
    const textQuestion = SURVEY_QUESTIONS.survey_free.find((q) => q.id === "improvement")!;
    expect(answerLabel(textQuestion, "More leagues please")).toBe("More leagues please");
  });
});

describe("averageAnswer", () => {
  it("returns null when nobody answered the question", () => {
    expect(averageAnswer([], "nps")).toBeNull();
    expect(averageAnswer([{ answers: { other: "5" } }], "nps")).toBeNull();
  });

  it("averages numeric answers, skipping rows that omitted it", () => {
    const rows: { answers: Record<string, string> }[] = [
      { answers: { nps: "10" } },
      { answers: { nps: "8" } },
      { answers: {} },
    ];
    expect(averageAnswer(rows, "nps")).toBe(9);
  });
});
