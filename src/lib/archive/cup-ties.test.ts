import { describe, expect, it } from "vitest";
import type { ResultRow } from "@/lib/types";
import { leagueClubTies } from "./cup-ties";

const row = (leagueId: string, homeName: string, awayName: string): ResultRow => ({
  homeId: homeName, awayId: awayName, homeName, awayName, homeGoals: 1, awayGoals: 0, date: 0, leagueId,
});

describe("leagueClubTies", () => {
  it("keeps league rows and cup ties with a league club, drops non-league-only ties", () => {
    const rows = [
      row("premier-league", "Arsenal", "Chelsea"),
      row("league-one", "Wigan Athletic", "Bolton Wanderers"),
      row("fa-cup", "Arsenal", "Wigan Athletic"),
      row("fa-cup", "Hashtag United", "Bolton Wanderers"),
      row("fa-cup", "Hashtag United", "Chatham Town"),
    ];
    const kept = leagueClubTies(rows, "fa-cup").map((r) => `${r.homeName}-${r.awayName}`);
    expect(kept).toEqual(["Arsenal-Chelsea", "Wigan Athletic-Bolton Wanderers", "Arsenal-Wigan Athletic", "Hashtag United-Bolton Wanderers"]);
  });
});
