import { describe, expect, it } from "vitest";
import type { SportyBetEvent } from "./sportybet-api";
import { voteTournaments } from "./sportybet-discover";
import type { OurFixture } from "./sportybet-match";

const KO = Date.UTC(2026, 9, 24, 15, 0);
const H = 3_600_000;
let seq = 0;

function ev(tournamentId: string, tournamentName: string, category: string, home: string, away: string, kickoff = KO): SportyBetEvent {
  seq += 1;
  return { eventId: `sr:match:${seq}`, homeName: home, awayName: away, kickoff, markets: [], tournamentId, tournamentName, category };
}

const fx = (i: number, home: string, away: string, kickoff = KO): OurFixture => ({ matchId: `m${i}`, homeName: home, awayName: away, kickoff });

const SUPER_LIG = ["sr:tournament:52", "Super Lig", "Turkiye"] as const;
const SRL = ["sr:tournament:32225", "Turkey Super Lig SRL", "Simulated Reality League"] as const;
const U19 = ["sr:tournament:29912", "U19 PAF Ligi", "Turkiye Amateur"] as const;

const ours = [
  fx(1, "Galatasaray", "Fenerbahçe"),
  fx(2, "Besiktas", "Istanbul Basaksehir", KO + 2 * H),
  fx(3, "Gaziantep", "Erzurumspor", KO + 26 * H),
  fx(4, "Konyaspor", "Gençlerbirliği", KO + 50 * H),
  fx(5, "Göztepe", "Çorum", KO + 52 * H),
];

describe("voteTournaments", () => {
  it("trusts the tournament our fixtures are actually found in", () => {
    const board = [
      ev(...SUPER_LIG, "Galatasaray", "Fenerbahce"),
      ev(...SUPER_LIG, "Besiktas", "Basaksehir", KO + 2 * H),
      ev(...SUPER_LIG, "Gaziantep FK", "Erzurumspor FK", KO + 26 * H),
      ev(...SUPER_LIG, "Konyaspor", "Genclerbirligi", KO + 50 * H),
      ev(...SUPER_LIG, "Goztepe", "Corum FK", KO + 52 * H),
    ];
    const out = voteTournaments({ name: "Turkish Süper Lig" }, ours, board);
    expect(out.best?.tournamentId).toBe("sr:tournament:52");
    expect(out.decision).toBe("trusted");
  });

  it("ignores simulated-reality, youth and women's copies of the same names", () => {
    const board = [
      ev(...SRL, "Galatasaray SRL", "Fenerbahce SRL"),
      ev(...SRL, "Besiktas SRL", "Basaksehir SRL", KO + 2 * H),
      ev(...U19, "Galatasaray U19", "Fenerbahce U19"),
      ev("sr:tournament:9", "Super Lig, Women", "Turkiye", "Galatasaray", "Fenerbahce"),
    ];
    const out = voteTournaments({ name: "Turkish Süper Lig" }, ours, board);
    expect(out.tally).toEqual([]);
    expect(out.decision).toBeNull();
  });

  it("leaves a split or thin vote for an admin", () => {
    const board = [
      ev(...SUPER_LIG, "Galatasaray", "Fenerbahce"),
      ev(...SUPER_LIG, "Besiktas", "Basaksehir", KO + 2 * H),
      ev("sr:tournament:96", "Turkish Cup", "Turkiye", "Gaziantep FK", "Erzurumspor FK", KO + 26 * H),
    ];
    const out = voteTournaments({ name: "Turkish Süper Lig" }, ours, board);
    expect(out.best).toMatchObject({ tournamentId: "sr:tournament:52", votes: 2 });
    expect(out.runnerUp?.votes).toBe(1);
    expect(out.decision).toBe("pending");
  });

  it("trusts a small cup round found whole in one place", () => {
    const cup = ["sr:tournament:21", "EFL Cup", "England"] as const;
    const out = voteTournaments(
      { name: "English EFL Cup" },
      [fx(1, "Liverpool", "Chelsea"), fx(2, "Everton", "Newcastle United", KO + H), fx(3, "Fulham", "Crystal Palace", KO + 2 * H)],
      [ev(...cup, "Liverpool", "Chelsea"), ev(...cup, "Everton", "Newcastle", KO + H), ev(...cup, "Fulham", "Crystal Palace", KO + 2 * H)],
    );
    expect(out.decision).toBe("trusted");
  });
});
