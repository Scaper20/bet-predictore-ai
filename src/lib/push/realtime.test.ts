import { describe, expect, it } from "vitest";
import { communityPayload, hubCodesPayload, slipPayload } from "@/lib/push/messages";
import { gradeSlip, parseSlip, MAX_SLIP_LEGS } from "@/lib/push/slips";
import { DEFAULT_TOPICS, parseTopics } from "@/lib/push/subscription";
import type { LegResult, LegScore, TrackedLeg } from "@/lib/slip-tracker";

const leg = (matchId: string, over: Partial<TrackedLeg> = {}): TrackedLeg => ({
  matchId,
  fixture: "Arsenal v Chelsea",
  homeName: "Arsenal",
  awayName: "Chelsea",
  league: "Premier League",
  kickoff: "2026-10-24T14:00:00.000Z",
  market: "ou:over:1.5",
  label: "Over 1.5 goals",
  probability: 0.78,
  fairOdds: 1.28,
  ...over,
});

const win = (home: number, away: number): LegResult => ({ home, away, grade: "win" });
const lose = (home: number, away: number): LegResult => ({ home, away, grade: "lose" });

describe("topics", () => {
  it("new topics default on and parse like the old ones", () => {
    expect(DEFAULT_TOPICS).toMatchObject({ codes: true, community: true, slips: true });
    expect(parseTopics({ codes: false, slips: false, community: "no", picks: true })).toEqual({ codes: false, slips: false, picks: true });
  });
});

describe("hubCodesPayload", () => {
  const codes = [
    { tier: "2", name: "Steady 2" },
    { tier: "3", name: "Solid 3" },
    { tier: "5", name: "Balanced 5" },
  ];

  it("tells a paid device every code that is ready", () => {
    const p = hubCodesPayload({ codes, paid: true, freeTier: "2", proMore: 2 })!;
    expect(p.title).toBe("Today's 3 codes are ready");
    expect(p.body).toBe("Steady 2 · Solid 3 · Balanced 5\nTap to load them on SportyBet.");
    expect(p.url).toBe("/football/code-hub");
    expect(p.tag).toBe("hub-codes");
  });

  it("names a single late code", () => {
    expect(hubCodesPayload({ codes: [codes[2]], paid: true, freeTier: "2", proMore: 0 })!.title).toBe("New code: Balanced 5");
  });

  it("tells a free device about its one code and counts the rest for Pro", () => {
    const p = hubCodesPayload({ codes, paid: false, freeTier: "2", proMore: 4 })!;
    expect(p.title).toBe("Today's free code is ready");
    expect(p.body).toBe("Steady 2\nTap to load it on SportyBet.\n🔒 4 more for Pro members.");
    // Nothing of the locked codes is named.
    expect(p.body).not.toContain("Solid");
  });

  it("does not pester a free device about a code only Pro opens", () => {
    expect(hubCodesPayload({ codes: codes.slice(1), paid: false, freeTier: "2", proMore: 4 })).toBeNull();
    expect(hubCodesPayload({ codes: [], paid: true, freeTier: "2", proMore: 0 })).toBeNull();
  });
});

describe("communityPayload", () => {
  it("names one poster, with the price when known", () => {
    const p = communityPayload([{ author: "Tunde", games: 4, odds: 7.5 }])!;
    expect(p.title).toBe("New community code");
    expect(p.body).toBe("Tunde posted a 4-game code at 7.50 odds.\nSee how we rate it.");
    expect(communityPayload([{ author: "Tunde", games: 3, odds: null }])!.body).toContain("Tunde posted a 3-game code.");
  });

  it("groups several into one", () => {
    const p = communityPayload([
      { author: "Tunde", games: 4, odds: 7 },
      { author: "Ada", games: 3, odds: 4 },
      { author: "Tunde", games: 5, odds: 12 },
      { author: "Musa", games: 2, odds: 2 },
    ])!;
    expect(p.title).toBe("4 new community codes");
    expect(p.body).toBe("From Tunde, Ada and 1 more.\nSee them ranked by our read.");
    expect(p.tag).toBe("community");
  });

  it("says nothing when there is nothing", () => {
    expect(communityPayload([])).toBeNull();
  });
});

describe("slipPayload", () => {
  const legs = [leg("fd:1"), leg("fd:2", { homeName: "Everton", awayName: "Spurs", label: "Home or Draw" }), leg("fd:3", { homeName: "Wolves", awayName: "Leeds" })];

  it("reports progress as each game finishes, under one tag per slip", () => {
    const p = slipPayload({ slipId: "s1", legs, results: { "fd:1": win(2, 1) }, fresh: ["fd:1"] })!;
    expect(p.title).toBe("✅ 1 of 3 in");
    expect(p.body).toBe("Arsenal 2–1 Chelsea: Over 1.5 goals won\n2 games to play.");
    expect(p.tag).toBe("slip-s1");
    expect(p.url).toBe("/football/combo/tracked");
  });

  it("calls a lost leg at once, whatever is still to play", () => {
    const p = slipPayload({ slipId: "s1", legs, results: { "fd:1": win(2, 1), "fd:2": lose(1, 3) }, fresh: ["fd:2"] })!;
    expect(p.title).toBe("❌ Slip out");
    expect(p.body).toBe("Everton 1–3 Spurs: Home or Draw lost\nYour 3-leg slip is out after 1 win. 1 game still to play can't change that.");
  });

  it("announces a slip that landed on its last game", () => {
    const results = { "fd:1": win(2, 1), "fd:2": win(1, 1), "fd:3": win(3, 0) };
    const p = slipPayload({ slipId: "s1", legs, results, fresh: ["fd:3"] })!;
    expect(p.title).toBe("🎉 Slip landed");
    expect(p.body).toContain("Your 3-leg slip landed: all 3 legs won.");
  });

  it("counts refunded legs on a slip that still lands", () => {
    const results = { "fd:1": win(2, 1), "fd:2": { home: 1, away: 1, grade: "void" as const }, "fd:3": win(3, 0) };
    const p = slipPayload({ slipId: "s1", legs, results, fresh: ["fd:3"] })!;
    expect(p.body).toContain("all 3 legs (1 refunded).");
  });

  it("calls a slip of refunds void, and a called-off game by name", () => {
    const off: LegResult = { home: 0, away: 0, grade: "void", abandoned: "postponed" };
    const results = { "fd:1": off, "fd:2": { ...off }, "fd:3": { ...off } };
    expect(slipPayload({ slipId: "s1", legs, results, fresh: ["fd:3"] })!.title).toBe("↩️ Slip void");
    expect(slipPayload({ slipId: "s1", legs, results: { "fd:1": off }, fresh: ["fd:1"] })!.body).toContain("Arsenal v Chelsea: Over 1.5 goals was called off");
  });

  it("folds several games that finished together into one notification", () => {
    const results = { "fd:1": win(2, 1), "fd:2": win(1, 1) };
    const p = slipPayload({ slipId: "s1", legs, results, fresh: ["fd:1", "fd:2"] })!;
    expect(p.title).toBe("✅ 2 of 3 in");
    expect(p.body.split("\n")).toHaveLength(3);
  });

  it("says nothing when nothing is fresh, and names a single-leg slip plainly", () => {
    expect(slipPayload({ slipId: "s1", legs, results: { "fd:1": win(2, 1) }, fresh: [] })).toBeNull();
    const one = slipPayload({ slipId: "s2", legs: [legs[0]], results: { "fd:1": lose(0, 0) }, fresh: ["fd:1"] })!;
    expect(one.body).toContain("Your slip is out.");
    // Plural agrees too.
    const many = slipPayload({ slipId: "s3", legs: [...legs, leg("fd:4")], results: { "fd:1": lose(0, 1) }, fresh: ["fd:1"] })!;
    expect(many.body).toContain("3 games still to play can't change that.");
  });
});

describe("parseSlip", () => {
  const good = {
    id: "abc_123",
    legs: [
      { matchId: "fd:564718", fixture: "Rayo v Elche", homeName: "Rayo Vallecano", awayName: "Elche", league: "La Liga", kickoff: "2026-10-24T17:00:00Z", market: "dc:home-draw", label: "Home or Draw", probability: 0.76, fairOdds: 1.31 },
      { matchId: "fd:564719", homeName: "Getafe", awayName: "Betis", kickoff: "2026-10-25T17:00:00Z", market: "corners:over:9.5", label: "Over 9.5 corners" },
    ],
  };

  it("accepts a slip and works out its span and whether it waits on counts", () => {
    const s = parseSlip(good)!;
    expect(s.slipId).toBe("abc_123");
    expect(s.legs).toHaveLength(2);
    expect(s.firstKickoff).toBe("2026-10-24T17:00:00.000Z");
    expect(s.lastKickoff).toBe("2026-10-25T17:00:00.000Z");
    expect(s.needsPoll).toBe(true);
    expect(parseSlip({ ...good, legs: [good.legs[0]] })!.needsPoll).toBe(false);
  });

  it("keeps only results for games on the slip, in a shape grading understands", () => {
    const s = parseSlip({ ...good, results: { "fd:564718": { home: 1, away: 0, grade: "win" }, "fd:999": { home: 1, away: 0, grade: "win" }, "fd:564719": { home: 1, away: 0, grade: "maybe" } } })!;
    expect(Object.keys(s.results)).toEqual(["fd:564718"]);
  });

  it("refuses anything malformed or oversized", () => {
    expect(parseSlip(null)).toBeNull();
    expect(parseSlip({ ...good, id: "has spaces" })).toBeNull();
    expect(parseSlip({ ...good, legs: [] })).toBeNull();
    expect(parseSlip({ ...good, legs: Array.from({ length: MAX_SLIP_LEGS + 1 }, () => good.legs[0]) })).toBeNull();
    expect(parseSlip({ ...good, legs: [{ ...good.legs[0], matchId: "../etc" }] })).toBeNull();
    expect(parseSlip({ ...good, legs: [{ ...good.legs[0], market: "x y" }] })).toBeNull();
    expect(parseSlip({ ...good, legs: [{ ...good.legs[0], kickoff: "soon" }] })).toBeNull();
  });

  it("clips long text", () => {
    const s = parseSlip({ ...good, legs: [{ ...good.legs[0], label: "x".repeat(500) }] })!;
    expect(s.legs[0].label.length).toBe(120);
  });
});

describe("gradeSlip", () => {
  const NOW = Date.parse("2026-10-24T20:00:00Z");
  const legs = [
    leg("fd:1", { kickoff: "2026-10-24T14:00:00Z", market: "1x2:home", label: "Arsenal" }),
    leg("fd:2", { kickoff: "2026-10-24T17:00:00Z", market: "ou:over:2.5", label: "Over 2.5" }),
    leg("fd:3", { kickoff: "2026-10-25T14:00:00Z", market: "dc:home-draw", label: "Home or Draw" }),
  ];
  const slip = { legs, results: {} as Record<string, LegResult>, lastKickoff: "2026-10-25T14:00:00Z" };
  const fin = (home: number, away: number): LegScore => ({ status: "finished", home, away });

  it("settles what has finished and leaves the rest", () => {
    const g = gradeSlip(slip, { "fd:1": fin(2, 0), "fd:2": { status: "live", home: 1, away: 1, minute: 70 } }, NOW);
    expect(Object.keys(g.results)).toEqual(["fd:1"]);
    expect(g.fresh).toEqual(["fd:1"]);
    expect(g.done).toBe(false);
  });

  it("does not announce a leg twice", () => {
    const first = gradeSlip(slip, { "fd:1": fin(2, 0) }, NOW);
    const again = gradeSlip({ ...slip, results: first.results }, { "fd:1": fin(2, 0), "fd:2": fin(3, 1) }, NOW);
    expect(again.fresh).toEqual(["fd:2"]);
  });

  it("is done the moment a leg loses, with games still to play", () => {
    const g = gradeSlip(slip, { "fd:1": fin(0, 1) }, NOW);
    expect(g.done).toBe(true);
    expect(g.results["fd:1"].grade).toBe("lose");
  });

  it("is done when every leg is in, and not before", () => {
    const early = Date.parse("2026-10-25T18:00:00Z");
    const g = gradeSlip(slip, { "fd:1": fin(1, 0), "fd:2": fin(2, 1), "fd:3": fin(1, 1) }, early);
    expect(g.done).toBe(true);
    expect(g.fresh).toHaveLength(3);
    expect(gradeSlip(slip, { "fd:1": fin(1, 0) }, NOW).done).toBe(false);
  });

  it("calls off a game that was postponed", () => {
    const g = gradeSlip(slip, { "fd:1": { status: "postponed", home: null, away: null } }, NOW);
    expect(g.results["fd:1"]).toMatchObject({ grade: "void", abandoned: "postponed" });
  });

  it("lets go of a slip that never resolved", () => {
    const later = Date.parse("2026-11-05T00:00:00Z");
    expect(gradeSlip(slip, {}, later).done).toBe(true);
  });

  it("does not look at a game that has not kicked off", () => {
    const g = gradeSlip(slip, { "fd:3": fin(5, 0) }, NOW);
    expect(g.fresh).toEqual([]);
  });
});
