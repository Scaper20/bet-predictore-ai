import { describe, expect, it } from "vitest";
import { matchJsonLd } from "./match-jsonld";
import type { Match } from "@/lib/types";

const SITE = "https://www.kiqstat.app";
const markets = { home: 0.52, draw: 0.24, away: 0.24 };

function match(over: Partial<Match> = {}): Match {
  return {
    id: "m1",
    kickoff: "2026-10-17T14:00:00Z",
    status: "scheduled",
    league: { id: "39", name: "Premier League", country: "England", code: "premier-league" },
    home: { id: "a", name: "Arsenal", shortName: "ARS" },
    away: { id: "b", name: "Chelsea", shortName: "CHE" },
    score: { home: null, away: null },
    venue: "Emirates Stadium",
    source: "football-data",
    ...over,
  };
}

type Node = Record<string, unknown> & { "@type": string };
const nodes = (m: Match): Node[] => matchJsonLd(m, markets, SITE)["@graph"] as Node[];
const eventOf = (m: Match) => nodes(m).find((n) => n["@type"] === "SportsEvent");

describe("matchJsonLd", () => {
  it("gives the event a start date, a place and a canonical url", () => {
    const e = eventOf(match())!;
    expect(e.startDate).toBe("2026-10-17T14:00:00.000Z");
    expect(e.endDate).toBe("2026-10-17T16:00:00.000Z");
    expect(e.location).toEqual({
      "@type": "Place",
      name: "Emirates Stadium",
      address: { "@type": "PostalAddress", addressCountry: "England" },
    });
    expect(e.url).toBe(`${SITE}/football/match/m1`);
  });

  it("publishes one SportsEvent, with the league as organizer rather than a second event", () => {
    const events = nodes(match()).filter((n) => n["@type"] === "SportsEvent");
    expect(events).toHaveLength(1);
    expect(events[0].superEvent).toBeUndefined();
    expect(events[0].organizer).toEqual({ "@type": "SportsOrganization", name: "Premier League" });
  });

  it("describes the pick and lists both teams", () => {
    const e = eventOf(match())!;
    expect(e.description).toContain("52% home win");
    expect(e.performer).toHaveLength(2);
    expect(e.image).toBe(`${SITE}/brand/og.png`);
  });

  it("leaves the event out when the feed has no venue, keeping the breadcrumb", () => {
    for (const venue of [null, undefined, "   "]) {
      const g = nodes(match({ venue }));
      expect(g.map((n) => n["@type"])).toEqual(["BreadcrumbList"]);
    }
  });

  it("leaves the event out when the kickoff is not a date", () => {
    expect(eventOf(match({ kickoff: "TBC" }))).toBeUndefined();
  });

  it("maps postponed and cancelled games to their schema.org status", () => {
    expect(eventOf(match({ status: "postponed" }))!.eventStatus).toBe("https://schema.org/EventPostponed");
    expect(eventOf(match({ status: "cancelled" }))!.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(eventOf(match({ status: "finished" }))!.eventStatus).toBe("https://schema.org/EventScheduled");
  });

  it("omits the address when the league has no country", () => {
    const e = eventOf(match({ league: { id: "x", name: "Friendlies" } }))!;
    expect(e.location).toEqual({ "@type": "Place", name: "Emirates Stadium" });
  });
});
