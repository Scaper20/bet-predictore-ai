import { describe, expect, it } from "vitest";
import { leagueByProviderName, leagueByCode, LEAGUES } from "./leagues";

/**
 * These are not hypotheticals. Every string below was read out of
 * predictions_log or match_results on the live database.
 */
describe("leagueByProviderName", () => {
  it("resolves the spellings the three feeds actually store", () => {
    const cases: [string, string][] = [
      ["Premier League", "premier-league"],
      ["English Premier League", "premier-league"],
      ["Serie A", "serie-a"],
      ["Italian Serie A", "serie-a"],
      ["Primera Division", "la-liga"],
      ["La Liga", "la-liga"],
      ["Campeonato Brasileiro Série A", "brasileirao"],
      ["Championship", "championship"],
      ["English League Championship", "championship"],
      ["Eredivisie", "eredivisie"],
      ["Ligue 1", "ligue-1"],
      ["Primeira Liga", "primeira-liga"],
      ["Bundesliga", "bundesliga"],
    ];
    for (const [name, code] of cases) {
      expect(leagueByProviderName(name)?.code, name).toBe(code);
    }
  });

  it("collapses accents and punctuation but not words", () => {
    // match_results holds both spellings of the Spanish top flight.
    expect(leagueByProviderName("Primera División")?.code).toBe("la-liga");
    expect(leagueByProviderName("primera division")?.code).toBe("la-liga");
  });

  it("keeps competitions that merely share words apart", () => {
    // The bug a substring match would reintroduce: three different countries'
    // top divisions all containing "Primera Division".
    expect(leagueByProviderName("Argentinian Primera Division")).toBeUndefined();
    expect(leagueByProviderName("Chile Primera Division")).toBeUndefined();
    expect(leagueByProviderName("American USL Championship")).toBeUndefined();
  });

  it("returns undefined for competitions outside the catalogue", () => {
    for (const name of ["MLS Next Pro", "Polish Cup", "Dutch KNVB Cup", "", null, undefined]) {
      expect(leagueByProviderName(name)).toBeUndefined();
    }
  });

  it("round-trips every catalogue name back to its own code", () => {
    for (const league of LEAGUES) {
      expect(leagueByProviderName(league.name)?.code, league.name).toBe(league.code);
      expect(leagueByCode(league.code)).toBe(league);
    }
  });
});
