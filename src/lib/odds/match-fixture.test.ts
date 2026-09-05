import { describe, expect, it } from "vitest";
import { KICKOFF_TOLERANCE_MS, findFixture } from "./match-fixture";

const KO = Date.UTC(2026, 8, 5, 14, 0);
const target = { homeName: "Newcastle United", awayName: "Bournemouth", kickoff: KO };

const c = (over = {}) => ({
  homeName: "Newcastle United",
  awayName: "Bournemouth",
  kickoff: KO,
  id: "sr:match:1",
  ...over,
});

describe("findFixture", () => {
  it("matches across the club-name variants the feeds disagree about", () => {
    // SportyBet says "Newcastle"; our feed says "Newcastle United".
    expect(findFixture(target, [c({ homeName: "Newcastle" })])?.id).toBe("sr:match:1");
    expect(
      findFixture(
        { homeName: "Manchester United", awayName: "Wolverhampton Wanderers", kickoff: KO },
        [c({ homeName: "Man Utd", awayName: "Wolves" })],
      )?.id,
    ).toBe("sr:match:1");
  });

  it("absorbs a kickoff recorded a couple of hours out", () => {
    expect(findFixture(target, [c({ kickoff: KO + 2 * 60 * 60 * 1000 })])).not.toBeNull();
  });

  it("refuses a fixture beyond the tolerance", () => {
    // The reverse-season meeting of the same pair must never match.
    expect(findFixture(target, [c({ kickoff: KO + KICKOFF_TOLERANCE_MS + 1 })])).toBeNull();
    expect(findFixture(target, [c({ kickoff: KO + 120 * 86_400_000 })])).toBeNull();
  });

  it("will not match a fixture with the teams reversed", () => {
    // A different match at a different ground, and the home side's price
    // would be attached to the away side's selection.
    expect(
      findFixture(target, [c({ homeName: "Bournemouth", awayName: "Newcastle United" })]),
    ).toBeNull();
  });

  it("requires both teams, not one", () => {
    expect(findFixture(target, [c({ awayName: "Brentford" })])).toBeNull();
    expect(findFixture(target, [c({ homeName: "Brentford" })])).toBeNull();
  });

  it("takes the closest kickoff when a feed lists a fixture twice", () => {
    const out = findFixture(target, [
      c({ id: "far", kickoff: KO + 3 * 60 * 60 * 1000 }),
      c({ id: "near", kickoff: KO + 60_000 }),
    ]);
    expect(out?.id).toBe("near");
  });

  it("refuses an abbreviation that fits two different clubs", () => {
    // The whole reason abbreviations are not simply stripped. Both fixtures
    // are plausible readings of "Manchester", and picking either would hand
    // a user one club's price for the other club's match.
    const out = findFixture(
      { homeName: "Manchester", awayName: "Brentford", kickoff: KO },
      [
        c({ id: "utd", homeName: "Manchester United", awayName: "Brentford" }),
        c({ id: "city", homeName: "Manchester City", awayName: "Brentford" }),
      ],
    );
    expect(out).toBeNull();
  });

  it("accepts an abbreviation when only one club could be meant", () => {
    const out = findFixture(
      { homeName: "Manchester", awayName: "Brentford", kickoff: KO },
      [c({ id: "utd", homeName: "Manchester United", awayName: "Brentford" })],
    );
    expect(out?.id).toBe("utd");
  });

  it("will not treat a shared word as an abbreviation", () => {
    // "United" is not an abbreviation of "Newcastle United" — it is a word
    // half the division shares. Only a leading stub counts.
    expect(
      findFixture({ ...target, homeName: "United" }, [c()]),
    ).toBeNull();
  });

  it("returns null rather than guessing when nothing is close", () => {
    expect(findFixture(target, [])).toBeNull();
    expect(findFixture({ ...target, homeName: "" }, [c()])).toBeNull();
  });
});
