import { describe, expect, it } from "vitest";
import { normaliseKey } from "@/lib/model/fit";
import type { SportyBetEvent } from "./sportybet-api";
import { matchOne, matchRound, nameSimilarity, SLOT_TOLERANCE_MS, type OurFixture } from "./sportybet-match";

const KO = Date.UTC(2026, 9, 24, 14, 0);
const H = 3_600_000;

let seq = 0;
function ev(homeName: string, awayName: string, kickoff = KO, homeId?: string, awayId?: string): SportyBetEvent {
  seq += 1;
  return {
    eventId: `sr:match:${seq}`,
    homeName,
    awayName,
    kickoff,
    markets: [],
    homeId: homeId ?? `sr:competitor:${homeName.length * 100 + seq}`,
    awayId: awayId ?? `sr:competitor:${awayName.length * 100 + seq + 50}`,
  };
}

const fx = (matchId: string, homeName: string, awayName: string, kickoff = KO): OurFixture => ({
  matchId,
  homeName,
  awayName,
  kickoff,
});

const links = (pairs: Record<string, string>) =>
  new Map(Object.entries(pairs).map(([name, id]) => [normaliseKey(name), id]));

describe("matchRound: names", () => {
  it("matches the spellings that broke name-only matching, via the seed list", () => {
    const events = [
      ev("Paris SG", "Marseille"),
      ev("Bayern München", "B. Monchengladbach"),
      ev("Spurs", "Nott'm Forest"),
    ];
    const out = matchRound({
      fixtures: [
        fx("a", "Paris Saint-Germain", "Olympique de Marseille"),
        fx("b", "Bayern Munich", "Borussia Mönchengladbach"),
        fx("c", "Tottenham Hotspur", "Nottingham Forest"),
      ],
      events,
    });
    expect(out.matched.map((m) => [m.matchId, m.eventId, m.method])).toEqual([
      ["a", events[0].eventId, "name"],
      ["b", events[1].eventId, "name"],
      ["c", events[2].eventId, "name"],
    ]);
    expect(out.learned).toHaveLength(6);
    expect(out.learned.every((l) => l.status === "trusted")).toBe(true);
  });

  it("uses our own alias names", () => {
    const events = [ev("Remo Stars", "Enyimba")];
    const out = matchRound({
      fixtures: [fx("a", "Remo Stars FC", "Enyimba International")],
      events,
      aliases: new Map([[normaliseKey("Enyimba International"), ["Enyimba"]]]),
    });
    expect(out.matched[0]?.eventId).toBe(events[0].eventId);
  });

  it("still refuses Manchester when both Manchester clubs fit", () => {
    const out = matchRound({
      fixtures: [fx("a", "Manchester", "Everton")],
      events: [ev("Man Utd", "Everton"), ev("Man City", "Everton", KO + 15 * 60_000)],
    });
    expect(out.matched).toEqual([]);
  });

  it("never matches the teams the other way round", () => {
    const out = matchRound({ fixtures: [fx("a", "Arsenal", "Chelsea")], events: [ev("Chelsea", "Arsenal")], eliminate: true });
    expect(out.matched).toEqual([]);
  });
});

describe("matchRound: ids", () => {
  it("matches learned clubs by id whatever the names now say", () => {
    const events = [ev("FCB", "BMG", KO, "sr:competitor:2672", "sr:competitor:2527")];
    const out = matchRound({
      fixtures: [fx("a", "Bayern Munich", "Borussia Mönchengladbach")],
      events,
      links: links({ "Bayern Munich": "sr:competitor:2672", "Borussia Mönchengladbach": "sr:competitor:2527" }),
    });
    expect(out.matched[0]).toMatchObject({ eventId: events[0].eventId, method: "id" });
    expect(out.learned).toEqual([]);
  });

  it("follows a fixture SportyBet has moved, once both clubs are known", () => {
    const moved = KO + 24 * H;
    const events = [ev("PSG", "Lyon", moved, "sr:competitor:1644", "sr:competitor:1649")];
    const memory = { links: links({ "Paris Saint-Germain": "sr:competitor:1644", Lyon: "sr:competitor:1649" }) };
    expect(matchRound({ ...memory, fixtures: [fx("a", "Paris Saint-Germain", "Lyon")], events }).matched[0]?.method).toBe("id");
    // By name alone a day's difference is a different game.
    expect(matchRound({ fixtures: [fx("a", "Paris Saint-Germain", "Lyon")], events }).matched).toEqual([]);
  });

  it("refuses a name match that contradicts a learned id", () => {
    const out = matchRound({
      fixtures: [fx("a", "Arsenal", "Chelsea")],
      events: [ev("Arsenal", "Chelsea", KO, "sr:competitor:999", "sr:competitor:38")],
      links: links({ Arsenal: "sr:competitor:42" }),
    });
    expect(out.matched).toEqual([]);
  });
});

describe("matchRound: anchors", () => {
  it("finds the game from one certain club and learns the other", () => {
    // Nothing about "Akwa Utd" vs "Akwa United FC Uyo" passes the name rules
    // on its own, but Rivers United at that kickoff is unique.
    const events = [ev("Rivers United", "Akwa Utd", KO, "sr:competitor:1", "sr:competitor:2")];
    const out = matchRound({ fixtures: [fx("a", "Rivers United", "Uyo Akwa FC")], events });
    expect(out.matched[0]).toMatchObject({ eventId: events[0].eventId, method: "anchor" });
    expect(out.learned).toContainEqual(
      expect.objectContaining({ teamKey: normaliseKey("Uyo Akwa FC"), competitorId: "sr:competitor:2", status: "pending" }),
    );
    expect(out.learned).toContainEqual(
      expect.objectContaining({ teamKey: normaliseKey("Rivers United"), competitorId: "sr:competitor:1", status: "trusted" }),
    );
  });

  it("refuses when the anchored club appears twice in the slot", () => {
    const out = matchRound({
      fixtures: [fx("a", "Rivers United", "Uyo Akwa FC")],
      events: [ev("Rivers United", "Akwa Utd"), ev("Rivers United", "Kano Pillars", KO + 10 * 60_000)],
    });
    expect(out.matched).toEqual([]);
  });

  it("refuses when the kickoffs are too far apart for a structural match", () => {
    const out = matchRound({
      fixtures: [fx("a", "Rivers United", "Uyo Akwa FC")],
      events: [ev("Rivers United", "Akwa Utd", KO + SLOT_TOLERANCE_MS + 1)],
    });
    expect(out.matched).toEqual([]);
  });

  it("refuses when the other club is plainly another club in our round", () => {
    const out = matchRound({
      fixtures: [fx("a", "Rivers United", "Uyo Akwa FC"), fx("b", "Kano Pillars", "Enyimba", KO + 3 * H)],
      events: [ev("Rivers United", "Kano Pillars")],
    });
    expect(out.matched).toEqual([]);
  });

  it("refuses when the other club's id is known to be someone else", () => {
    const out = matchRound({
      fixtures: [fx("a", "Rivers United", "Uyo Akwa FC")],
      events: [ev("Rivers United", "Akwa Utd", KO, "sr:competitor:1", "sr:competitor:2")],
      links: links({ Enyimba: "sr:competitor:2" }),
    });
    expect(out.matched).toEqual([]);
  });

  it("lets one anchor's learned id unlock the next fixture", () => {
    // Round one teaches Akwa's id; in round two Akwa is the only certain side.
    const events = [
      ev("Rivers United", "Akwa Utd", KO, "sr:competitor:1", "sr:competitor:2"),
      ev("Akwa Utd", "Shooting Stars SC", KO + 7 * 24 * H, "sr:competitor:2", "sr:competitor:3"),
    ];
    const out = matchRound({
      fixtures: [fx("a", "Rivers United", "Uyo Akwa FC"), fx("b", "Uyo Akwa FC", "3SC Ibadan", KO + 7 * 24 * H)],
      events,
    });
    expect(out.matched.map((m) => m.matchId).sort()).toEqual(["a", "b"]);
  });
});

describe("matchRound: elimination", () => {
  it("pairs the last fixture and event in a slot when the names are related", () => {
    // Neither side is certain ("Leeds Utd. W" only loosely fits), so neither
    // names nor anchors take it; it is simply the only game left at 16:00.
    const events = [ev("Arsenal", "Everton"), ev("Wolverhampton W.", "Leeds Utd. W", KO + 2 * H)];
    const out = matchRound({
      fixtures: [fx("a", "Arsenal", "Everton"), fx("b", "Wolves Women", "Leeds United Women", KO + 2 * H)],
      events,
      eliminate: true,
    });
    const b = out.matched.find((m) => m.matchId === "b");
    expect(b).toMatchObject({ eventId: events[1].eventId });
    expect(out.learned.filter((l) => l.method === "elimination").every((l) => l.status === "pending")).toBe(true);
  });

  it("will not pair unrelated names or run without the whole round", () => {
    const events = [ev("Zamalek", "Al Ahly")];
    expect(matchRound({ fixtures: [fx("a", "Kano Pillars", "Enyimba")], events, eliminate: true }).matched).toEqual([]);
    expect(matchOne(fx("a", "Wolves Women", "Leeds United Women"), [ev("Wolverhampton W.", "Leeds Utd. W")])).toBeNull();
  });

  it("reports unresolved fixtures with their best candidates", () => {
    const out = matchRound({
      fixtures: [fx("a", "Kano Pillars", "Enyimba")],
      events: [ev("Zamalek", "Al Ahly"), ev("Sporting Kano", "Enyimba Aba", KO + H)],
    });
    expect(out.unresolved[0].matchId).toBe("a");
    expect(out.unresolved[0].candidates[0].homeName).toBe("Sporting Kano");
  });
});

describe("nameSimilarity", () => {
  it("scores related spellings above unrelated ones", () => {
    expect(nameSimilarity("Leeds United", "Leeds Utd.")).toBeGreaterThan(0.35);
    expect(nameSimilarity("Kano Pillars", "Zamalek")).toBeLessThan(0.2);
  });
});
