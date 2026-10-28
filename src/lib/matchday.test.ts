import { describe, expect, it } from "vitest";
import { dayName, previousMatchday, projectMatchday } from "./matchday";

const NOW = Date.parse("2026-10-28T10:00:00Z"); // 11:00 in Lagos

describe("previousMatchday", () => {
  it("takes the latest graded day before today, pushes and pending apart", () => {
    const r = previousMatchday(
      [
        { kickoff: "2026-10-28T08:00:00Z", result: "win" }, // today: ignored
        { kickoff: "2026-10-27T14:00:00Z", result: "win" },
        { kickoff: "2026-10-27T19:00:00Z", result: "lose" },
        { kickoff: "2026-10-27T22:30:00Z", result: "win" }, // 23:30 Lagos, still the 27th
        { kickoff: "2026-10-27T16:00:00Z", result: "push" },
        { kickoff: "2026-10-27T17:00:00Z", result: null },
        { kickoff: "2026-10-26T14:00:00Z", result: "lose" },
      ],
      NOW,
    );
    expect(r).toEqual({ day: "2026-10-27", wins: 2, losses: 1, pushes: 1, pending: 1, rate: 2 / 3 });
  });

  it("skips a day with nothing graded yet", () => {
    const r = previousMatchday([{ kickoff: "2026-10-27T14:00:00Z", result: null }, { kickoff: "2026-10-25T14:00:00Z", result: "lose" }], NOW);
    expect(r?.day).toBe("2026-10-25");
    expect(previousMatchday([], NOW)).toBeNull();
  });
});

describe("projectMatchday", () => {
  it("projects the next day's picks still to kick off", () => {
    const p = projectMatchday(
      [
        { kickoff: "2026-10-28T09:00:00Z", probability: 0.9 }, // kicked off
        { kickoff: "2026-10-28T15:00:00Z", probability: 0.8 },
        { kickoff: "2026-10-28T19:00:00Z", probability: 0.7 },
        { kickoff: "2026-10-29T15:00:00Z", probability: 0.75 },
      ],
      NOW,
    )!;
    expect(p.day).toBe("2026-10-28");
    expect(p.picks).toBe(2);
    expect(p.expectedWins).toBeCloseTo(1.5, 9);
    expect(p.accuracy).toBeCloseTo(0.75, 9);
    expect(p.range).toEqual([1, 2]);
  });
});

describe("dayName", () => {
  it("names the days around today", () => {
    expect(dayName("2026-10-28", NOW)).toBe("Today");
    expect(dayName("2026-10-27", NOW)).toBe("Yesterday");
    expect(dayName("2026-10-29", NOW)).toBe("Tomorrow");
    expect(dayName("2026-10-24", NOW)).toBe("Sat 24 Oct");
  });
});
