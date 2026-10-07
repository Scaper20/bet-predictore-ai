import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));

describe("parseFixtureReferees", () => {
  it("keeps catalogued divisions with a referee named", async () => {
    const { parseFixtureReferees } = await import("./referees");
    const body = "﻿Div,Date,Time,HomeTeam,AwayTeam,Referee,B365H\nE0,18/10/2026,15:00,Arsenal,Chelsea,M Oliver,1.9\nE0,18/10/2026,17:30,Leeds,Everton,,2.1\nSC1,18/10/2026,15:00,Dundee,Hearts,K Clancy,2.5\n";
    const rows = parseFixtureReferees(body, new Map([["E0", "premier-league"]]));
    expect(rows).toEqual([
      { leagueCode: "premier-league", kickoff: Date.UTC(2026, 9, 18, 15, 0), homeName: "Arsenal", awayName: "Chelsea", referee: "M Oliver" },
    ]);
  });
});

describe("parseDivisionCsv statistics", () => {
  it("reads corners, cards (yellow + red), shots and the referee", async () => {
    const { parseDivisionCsv } = await import("./football-data-uk");
    const body = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,Referee,HS,AS,HST,AST,HC,AC,HY,AY,HR,AR\nE0,16/08/2026,15:00,Arsenal,Chelsea,2,1,M Oliver,15,9,6,3,7,4,2,3,0,1\n";
    const [r] = parseDivisionCsv(body, "premier-league");
    expect(r).toMatchObject({ homeCorners: 7, awayCorners: 4, homeCards: 2, awayCards: 4, homeShots: 15, awayShots: 9, homeShotsOnTarget: 6, referee: "M Oliver" });
  });
});
