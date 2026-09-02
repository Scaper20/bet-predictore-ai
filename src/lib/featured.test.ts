import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  imminence,
  isEligible,
  leagueKey,
  score,
  selectFeatured,
  shortlist,
  stature,
  tension,
  type FeaturedCandidate,
} from "./featured";
import type { Match, MatchStatus } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";

const NOW = Date.parse("2026-03-14T12:00:00.000Z");
const hoursOut = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function match(over: Partial<Match> & { id: string }): Match {
  return {
    kickoff: hoursOut(3),
    status: "scheduled",
    league: { id: "l1", name: "Test", code: "premier-league" },
    home: { id: "h", name: "Home", shortName: "HOM" },
    away: { id: "a", name: "Away", shortName: "AWY" },
    score: { home: null, away: null },
    source: "football-data",
    ...over,
  };
}

/** Only the fields featured.ts actually reads. */
function candidate(
  over: {
    id?: string;
    match?: Partial<Match>;
    confidence?: number | null;
    dataQuality?: number;
    uncertainty?: number;
    publishable?: boolean;
    engagement?: number | null;
  } = {},
): FeaturedCandidate {
  const {
    id = "m1",
    confidence = 60,
    dataQuality = 80,
    uncertainty = 0.9,
    publishable = true,
    engagement,
  } = over;

  const prediction = {
    match: match({ id, ...over.match }),
    topPick: confidence === null ? null : { confidence },
    sufficiency: { publishable },
    model: { dataQuality, uncertainty },
  } as unknown as Prediction;

  return { prediction, engagement };
}

describe("stature", () => {
  it("maps the top-ranked competition to 1 and an unknown one to 0", () => {
    expect(stature("premier-league")).toBe(1);
    expect(stature("brasileirao")).toBeCloseTo(1 / 12, 5);
    expect(stature("not-a-league")).toBe(0);
    expect(stature(undefined)).toBe(0);
  });
});

describe("imminence", () => {
  it("pins live to 1 whatever the clock says", () => {
    expect(imminence(hoursOut(-2), "live", NOW)).toBe(1);
    expect(imminence(hoursOut(-2), "halftime", NOW)).toBe(1);
  });

  it("decays exponentially and dies past the horizon", () => {
    expect(imminence(hoursOut(0), "scheduled", NOW)).toBe(1);
    expect(imminence(hoursOut(18), "scheduled", NOW)).toBeCloseTo(Math.exp(-1), 5);
    expect(imminence(hoursOut(73), "scheduled", NOW)).toBe(0);
  });

  it("separates soon from later far more sharply than a linear ramp would", () => {
    // The whole reason for choosing exponential decay: "in thirty minutes"
    // and "tonight" are the distinction that matters to someone opening the
    // page now, and a linear ramp across a three-day horizon barely registers
    // it. Compared against that alternative rather than a magic threshold, so
    // the test still means something if the time constant is retuned.
    const linear = (h: number) => 1 - h / 72;

    const expGap = imminence(hoursOut(0.5), "scheduled", NOW) - imminence(hoursOut(8), "scheduled", NOW);
    const linearGap = linear(0.5) - linear(8);

    expect(expGap).toBeGreaterThan(linearGap * 3);
  });

  it("is strictly decreasing", () => {
    const series = [0, 3, 6, 12, 24, 48].map((h) => imminence(hoursOut(h), "scheduled", NOW));
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeLessThan(series[i - 1]);
  });
});

describe("tension", () => {
  it("is zero for anything not in progress", () => {
    expect(tension(match({ id: "a" }))).toBe(0);
  });

  it("rates a tight late game above a tight early one", () => {
    const late = tension(match({ id: "a", status: "live", minute: 85, score: { home: 1, away: 1 } }));
    const early = tension(match({ id: "b", status: "live", minute: 20, score: { home: 1, away: 1 } }));
    expect(late).toBeGreaterThan(early);
  });

  it("rates a blowout below a level game at the same minute", () => {
    const level = tension(match({ id: "a", status: "live", minute: 70, score: { home: 1, away: 1 } }));
    const rout = tension(match({ id: "b", status: "live", minute: 70, score: { home: 4, away: 0 } }));
    expect(rout).toBeLessThan(level);
  });

  it("treats minute 0 as minute zero, not as unknown", () => {
    // `?? default` not `|| default`: a genuine 1st-minute match has minute 0,
    // which is falsy but real.
    const kickedOff = tension(match({ id: "a", status: "live", minute: 0, score: { home: 0, away: 0 } }));
    const midway = tension(match({ id: "b", status: "live", minute: 45, score: { home: 0, away: 0 } }));
    expect(kickedOff).toBeLessThan(midway);
  });

  it("never exceeds 1 even on a nonsense minute", () => {
    expect(tension(match({ id: "a", status: "live", minute: 400, score: { home: 0, away: 0 } }))).toBeLessThanOrEqual(1);
  });
});

describe("score", () => {
  it("renormalises over present terms, so a null engagement changes nothing", () => {
    // The load-bearing property: engagement can sit at a real weight,
    // contributing nothing, until there is something to feed it.
    const withNull = score(candidate({ engagement: null }), NOW);
    const withUndefined = score(candidate({}), NOW);
    expect(withNull).toBeCloseTo(withUndefined, 10);
  });

  it("lets a real engagement signal move the score once present", () => {
    const none = score(candidate({ engagement: null }), NOW);
    const strong = score(candidate({ engagement: 1 }), NOW);
    expect(strong).toBeGreaterThan(none);
  });

  it("counts a zero term against the match, unlike a null one", () => {
    // 0 means "measured, and it is zero"; null means "not measured".
    const measuredZero = score(candidate({ engagement: 0 }), NOW);
    const notMeasured = score(candidate({ engagement: null }), NOW);
    expect(measuredZero).toBeLessThan(notMeasured);
  });

  it("drops conviction's weight rather than scoring a missing pick as zero", () => {
    const noPick = score(candidate({ confidence: null }), NOW);
    expect(noPick).toBeGreaterThan(0);
  });

  it("stays within 0-1 for absurd inputs", () => {
    const s = score(candidate({ confidence: 900, dataQuality: 900, engagement: 42 }), NOW);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("weights are the ones documented", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});

describe("isEligible", () => {
  it("refuses anything the model will not stand behind", () => {
    expect(isEligible(candidate({ publishable: false }).prediction, NOW)).toBe(false);
    expect(isEligible(candidate({ confidence: null }).prediction, NOW)).toBe(false);
  });

  it("refuses finished, cancelled and postponed fixtures", () => {
    for (const status of ["finished", "cancelled", "postponed"] as MatchStatus[]) {
      expect(isEligible(candidate({ match: { status } }).prediction, NOW)).toBe(false);
    }
  });

  it("keeps a live match however long ago it kicked off", () => {
    const live = candidate({ match: { status: "live", kickoff: hoursOut(-5) } });
    expect(isEligible(live.prediction, NOW)).toBe(true);
  });

  it("gives a lagging feed three hours of grace, then gives up", () => {
    expect(isEligible(candidate({ match: { kickoff: hoursOut(-2) } }).prediction, NOW)).toBe(true);
    expect(isEligible(candidate({ match: { kickoff: hoursOut(-4) } }).prediction, NOW)).toBe(false);
  });

  it("refuses fixtures beyond the horizon", () => {
    expect(isEligible(candidate({ match: { kickoff: hoursOut(80) } }).prediction, NOW)).toBe(false);
  });
});

describe("selectFeatured", () => {
  it("reserves slots for live without letting live take the whole board", () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, i) =>
        candidate({
          id: `live${i}`,
          confidence: 90,
          match: { status: "live", league: { id: `L${i}`, name: `L${i}`, code: "premier-league" } },
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        candidate({
          id: `up${i}`,
          match: { kickoff: hoursOut(2), league: { id: `U${i}`, name: `U${i}`, code: "npfl" } },
        }),
      ),
    ];

    const board = selectFeatured(candidates, { now: NOW, slots: 4, liveSlots: 2 });
    expect(board).toHaveLength(4);
    expect(board.filter((b) => b.prediction.match.status === "live")).toHaveLength(2);
  });

  it("hands the live slots to upcoming when nothing is live", () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      candidate({
        id: `up${i}`,
        match: { kickoff: hoursOut(i + 1), league: { id: `U${i}`, name: `U${i}`, code: "npfl" } },
      }),
    );
    expect(selectFeatured(candidates, { now: NOW, slots: 4 })).toHaveLength(4);
  });

  it("caps one competition at two — until that would mean a short board", () => {
    const sameLeague = Array.from({ length: 6 }, (_, i) =>
      candidate({ id: `m${i}`, match: { kickoff: hoursOut(i + 1) } }),
    );

    // Nothing else to draw on, so the diversity cap has to give way: four
    // from one competition beats a board of two.
    expect(selectFeatured(sameLeague, { now: NOW, slots: 4 })).toHaveLength(4);
  });

  it("prefers a spread when there is one available", () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, i) =>
        candidate({ id: `epl${i}`, confidence: 95, match: { kickoff: hoursOut(1) } }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        candidate({
          id: `npfl${i}`,
          confidence: 90,
          match: { kickoff: hoursOut(1), league: { id: "n", name: "NPFL", code: "npfl" } },
        }),
      ),
    ];

    const board = selectFeatured(candidates, { now: NOW, slots: 4, maxPerLeague: 2 });
    const eplCount = board.filter((b) => b.prediction.match.league.code === "premier-league").length;
    expect(eplCount).toBeLessThanOrEqual(2);
  });

  it("returns fewer than the slot count rather than padding with junk", () => {
    const board = selectFeatured([candidate({ id: "only" })], { now: NOW, slots: 4 });
    expect(board).toHaveLength(1);
  });

  it("is deterministic regardless of input order", () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      candidate({
        id: `m${i}`,
        confidence: 50 + (i % 3),
        match: { kickoff: hoursOut(1 + (i % 4)), league: { id: `L${i % 3}`, name: "L", code: "npfl" } },
      }),
    );

    const a = selectFeatured(candidates, { now: NOW, slots: 4 }).map((b) => b.prediction.match.id);
    const b = selectFeatured([...candidates].reverse(), { now: NOW, slots: 4 }).map(
      (x) => x.prediction.match.id,
    );
    expect(a).toEqual(b);
  });

  it("labels a live match as live and a confident one as conviction", () => {
    const board = selectFeatured(
      [
        candidate({ id: "l", confidence: 40, match: { status: "live", minute: 30 } }),
        candidate({
          id: "c",
          confidence: 80,
          match: { kickoff: hoursOut(2), league: { id: "n", name: "NPFL", code: "npfl" } },
        }),
      ],
      { now: NOW, slots: 4 },
    );

    expect(board.find((b) => b.prediction.match.id === "l")?.reason).toBe("live");
    expect(board.find((b) => b.prediction.match.id === "c")?.reason).toBe("conviction");
  });
});

describe("shortlist", () => {
  it("caps both fixtures and distinct competitions", () => {
    const matches = Array.from({ length: 60 }, (_, i) =>
      match({
        id: `m${i}`,
        kickoff: hoursOut(1 + (i % 40)),
        league: { id: `L${i % 12}`, name: `L${i % 12}`, code: `league-${i % 12}` },
      }),
    );

    const out = shortlist(matches, NOW, { maxMatches: 18, maxLeagues: 6 });
    expect(out.length).toBeLessThanOrEqual(18);
    expect(new Set(out.map(leagueKey)).size).toBeLessThanOrEqual(6);
  });

  it("drops finished and out-of-horizon fixtures", () => {
    const out = shortlist(
      [
        match({ id: "done", status: "finished" }),
        match({ id: "far", kickoff: hoursOut(100) }),
        match({ id: "good", kickoff: hoursOut(2) }),
      ],
      NOW,
    );
    expect(out.map((m) => m.id)).toEqual(["good"]);
  });

  it("spends the league budget on catalogued competitions first", () => {
    // The failure this prevents: on a quiet slate the feeds are mostly minor
    // competitions, they filled every league slot, and because none of them
    // has training history behind it the board came back with one match on it.
    const uncurated = Array.from({ length: 20 }, (_, i) =>
      match({
        id: `minor${i}`,
        status: "live",
        kickoff: hoursOut(-1),
        league: { id: `X${i}`, name: `Minor ${i}` },
      }),
    );
    const curated = match({
      id: "epl",
      kickoff: hoursOut(30),
      league: { id: "pl", name: "Premier League", code: "premier-league" },
    });

    const out = shortlist([...uncurated, curated], NOW, { maxMatches: 18, maxLeagues: 6 });

    // Every uncurated fixture is live and therefore scores maximum imminence,
    // so without the curated-first pass the EPL tie 30 hours out loses.
    expect(out.map((m) => m.id)).toContain("epl");
  });

  it("still uses leftover budget on uncatalogued fixtures", () => {
    const out = shortlist(
      [
        match({ id: "minor", kickoff: hoursOut(2), league: { id: "X", name: "Minor" } }),
        match({ id: "epl", kickoff: hoursOut(2) }),
      ],
      NOW,
      { maxMatches: 18, maxLeagues: 6 },
    );
    expect(out.map((m) => m.id).sort()).toEqual(["epl", "minor"]);
  });

  it("keys leagues exactly the way predictBatch groups them", () => {
    // service.ts: `m.league.code ?? \`raw:${m.league.id}\``. If these drift,
    // the league cap silently stops capping and the board starts making one
    // upstream training fetch per fixture.
    expect(leagueKey(match({ id: "a", league: { id: "x", name: "X", code: "npfl" } }))).toBe("npfl");
    expect(leagueKey(match({ id: "b", league: { id: "x", name: "X" } }))).toBe("raw:x");
  });
});
