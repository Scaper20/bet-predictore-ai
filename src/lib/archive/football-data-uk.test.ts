import { describe, expect, it } from "vitest";
import {
  dedupe,
  parseArchiveDate,
  parseCountryCsv,
  parseDivisionCsv,
  splitCsvLine,
} from "./football-data-uk";

describe("splitCsvLine", () => {
  it("keeps commas inside quoted fields together", () => {
    // The Referee column really does contain quoted names with commas.
    expect(splitCsvLine('E0,01/01/26,Arsenal,"Smith, J",2,1')).toEqual([
      "E0", "01/01/26", "Arsenal", "Smith, J", "2", "1",
    ]);
  });

  it("keeps empty trailing fields", () => {
    expect(splitCsvLine("a,b,,")).toEqual(["a", "b", "", ""]);
  });
});

describe("parseArchiveDate", () => {
  it("reads both year formats", () => {
    expect(parseArchiveDate("24/05/2026", "16:00")).toBe(Date.UTC(2026, 4, 24, 16, 0));
    expect(parseArchiveDate("24/05/26", "16:00")).toBe(Date.UTC(2026, 4, 24, 16, 0));
  });

  it("falls back to midday when no time is given", () => {
    // Midday, not midnight: the day is what the natural key uses, and midday
    // survives a timezone shift in either direction without changing date.
    expect(parseArchiveDate("24/05/2026")).toBe(Date.UTC(2026, 4, 24, 12, 0));
    expect(parseArchiveDate("24/05/2026", "")).toBe(Date.UTC(2026, 4, 24, 12, 0));
  });

  it("rejects anything that is not a date", () => {
    expect(parseArchiveDate("")).toBeNull();
    expect(parseArchiveDate("not-a-date")).toBeNull();
  });
});

describe("parseDivisionCsv", () => {
  const csv = [
    "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgCH",
    "E0,16/08/2025,15:00,Arsenal,Chelsea,2,1,H,2.10",
    "E0,17/08/2025,14:00,Liverpool,Everton,0,0,D,1.50",
  ].join("\n");

  it("reads results with the league code the caller supplies", () => {
    const rows = parseDivisionCsv(csv, "premier-league");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      leagueCode: "premier-league",
      homeName: "Arsenal",
      awayName: "Chelsea",
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("drops fixtures that have not been played", () => {
    // The current-season file carries scheduled matches with empty scores. A
    // 0-0 default would be indistinguishable from a real goalless draw.
    const withFixture = `${csv}\nE0,20/05/2026,15:00,Spurs,Fulham,,,,2.00`;
    expect(parseDivisionCsv(withFixture, "premier-league")).toHaveLength(2);
  });

  it("returns nothing rather than guessing when the header is unfamiliar", () => {
    expect(parseDivisionCsv("a,b,c\n1,2,3", "premier-league")).toEqual([]);
    expect(parseDivisionCsv("", "premier-league")).toEqual([]);
  });
});

describe("parseCountryCsv", () => {
  const csv = [
    "Country,League,Season,Date,Time,Home,Away,HG,AG,Res",
    "Brazil,Serie A,2026,02/09/2026,23:30,Flamengo RJ,Mirassol,2,0,H",
    "Brazil,Serie B,2026,02/09/2026,23:30,Other,Team,1,1,D",
  ].join("\n");

  it("takes only the division asked for", () => {
    // One country file can hold several divisions; Serie B is not Brasileirão.
    const rows = parseCountryCsv(csv, "brasileirao", "Serie A");
    expect(rows).toHaveLength(1);
    expect(rows[0].homeName).toBe("Flamengo RJ");
  });

  it("matches the league name case-insensitively", () => {
    expect(parseCountryCsv(csv, "brasileirao", "serie a")).toHaveLength(1);
  });
});

describe("dedupe", () => {
  const row = (over = {}) => ({
    leagueCode: "premier-league",
    kickoff: Date.UTC(2026, 4, 24, 15, 0),
    homeName: "Arsenal",
    awayName: "Chelsea",
    homeGoals: 2,
    awayGoals: 1,
    ...over,
  });

  it("collapses the same match reported at different times", () => {
    // Two archives, same fixture, kickoff recorded three hours apart. A
    // timestamp key would keep both and double its weight in the fit.
    const out = dedupe([row(), row({ kickoff: Date.UTC(2026, 4, 24, 18, 0) })]);
    expect(out).toHaveLength(1);
  });

  it("keeps genuinely different fixtures", () => {
    const out = dedupe([
      row(),
      row({ homeName: "Chelsea", awayName: "Arsenal" }),
      row({ kickoff: Date.UTC(2026, 4, 25, 15, 0) }),
    ]);
    expect(out).toHaveLength(3);
  });

  it("returns them in kickoff order", () => {
    const out = dedupe([
      row({ kickoff: Date.UTC(2026, 4, 26) }),
      row({ kickoff: Date.UTC(2026, 4, 24), homeName: "A" }),
    ]);
    expect(out[0].kickoff).toBeLessThan(out[1].kickoff);
  });
});
