import { describe, expect, it } from "vitest";
import type { ResultRow } from "@/lib/types";
import { clubKeys, hostGuard, inLeagues } from "./cup-guard";

const row = (homeName: string, awayName: string): ResultRow => ({
  leagueId: "x", date: 0, homeId: homeName, homeName, awayId: awayName, awayName, homeGoals: 1, awayGoals: 0,
});
const TOP = clubKeys([
  row("Milan", "Inter"),
  row("Leverkusen", "Ath Madrid"),
  row("Paris SG", "Lens"),
  row("Man United", "Newcastle"),
]);

describe("inLeagues", () => {
  it("matches the league archive's spellings from the cup's", () => {
    expect(inLeagues("AC Milan", TOP)).toBe(true);
    expect(inLeagues("Bayer Leverkusen", TOP)).toBe(true);
    expect(inLeagues("Atlético Madrid", TOP)).toBe(true);
    expect(inLeagues("Paris Saint-Germain", TOP)).toBe(true);
    expect(inLeagues("Manchester United", TOP)).toBe(true);
    expect(inLeagues("Newcastle United", TOP)).toBe(true);
    expect(inLeagues("Inter Milan", TOP)).toBe(true);
  });

  it("does not let a short name claim another club", () => {
    expect(inLeagues("Inter Club d'Escaldes", TOP)).toBe(false);
    expect(inLeagues("Lens", TOP)).toBe(true);
    expect(inLeagues("Red Bull Salzburg", TOP)).toBe(false);
    expect(inLeagues("Lech Poznań", TOP)).toBe(false);
  });
});

describe("hostGuard", () => {
  it("bars the host's side when a smaller-league host meets a top-five visitor", () => {
    expect(hostGuard("europa-league", ["Red Bull Salzburg"], ["AC Milan"], TOP)).toEqual(["1x2:home", "dc:home-draw"]);
  });

  it("leaves other fixtures alone", () => {
    expect(hostGuard("europa-league", ["AC Milan"], ["Red Bull Salzburg"], TOP)).toEqual([]);
    expect(hostGuard("champions-league", ["Inter Milan"], ["Paris Saint-Germain"], TOP)).toEqual([]);
    expect(hostGuard("champions-league", ["Sabah Baku"], ["Slavia Prague"], TOP)).toEqual([]);
    expect(hostGuard("serie-a", ["Lech Poznań"], ["AC Milan"], TOP)).toEqual([]);
    expect(hostGuard("europa-league", ["Lech Poznań"], ["Bayer Leverkusen"], undefined)).toEqual([]);
  });
});
