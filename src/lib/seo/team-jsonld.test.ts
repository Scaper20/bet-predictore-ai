import { describe, expect, it } from "vitest";
import { teamJsonLd } from "./team-jsonld";

const team = { id: "8f14e45f-ceea-4e7a-9b6c-1d2e3f4a5b6c", name: "Arsenal", crest: "https://r2.thesportsdb.com/a.png" };

describe("teamJsonLd", () => {
  it("describes the club with what we know", () => {
    const ld = teamJsonLd(team, { league: "English Premier League", coach: "Mikel Arteta", venue: "Emirates Stadium", city: "London" }, "https://www.kiqstat.app");
    const node = ld["@graph"][0] as Record<string, unknown>;
    expect(node["@type"]).toBe("SportsTeam");
    expect(node.url).toBe(`https://www.kiqstat.app/football/team/arsenal--${team.id}`);
    expect(node.logo).toBe(team.crest);
    expect((node.coach as { name: string }).name).toBe("Mikel Arteta");
    expect((node.location as { name: string }).name).toBe("Emirates Stadium");
  });

  it("leaves out what we do not know, and non-https logos", () => {
    const ld = teamJsonLd({ ...team, crest: "javascript:alert(1)" }, {}, "https://www.kiqstat.app");
    const node = ld["@graph"][0] as Record<string, unknown>;
    expect(node.logo).toBeUndefined();
    expect(node.coach).toBeUndefined();
    expect(node.location).toBeUndefined();
  });
});
