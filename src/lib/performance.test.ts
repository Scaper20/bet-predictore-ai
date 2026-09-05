import { describe, expect, it } from "vitest";
import {
  MIN_PUBLISHABLE_SAMPLE,
  isPublishable,
  summarise,
  tally,
  type SettledRow,
} from "@/lib/performance";

function row(over: Partial<SettledRow> = {}): SettledRow {
  return {
    league_code: "premier-league",
    market: "1x2:home",
    model_id: "goals-v1",
    result: "win",
    ...over,
  };
}

function rows(count: number, over: Partial<SettledRow> = {}): SettledRow[] {
  return Array.from({ length: count }, () => row(over));
}

describe("tally", () => {
  it("excludes pushes from the win rate but still counts them", () => {
    const record = tally([
      ...rows(3, { result: "win" }),
      ...rows(1, { result: "lose" }),
      ...rows(6, { result: "push" }),
    ]);

    expect(record.wins).toBe(3);
    expect(record.losses).toBe(1);
    expect(record.pushes).toBe(6);
    // 3/4, not 3/10 — a void result is not a loss.
    expect(record.winRate).toBeCloseTo(0.75);
    expect(record.sample).toBe(4);
  });

  it("reports no rate rather than zero when nothing is graded", () => {
    const record = tally(rows(4, { result: "push" }));
    expect(record.winRate).toBeNull();
    expect(record.sample).toBe(0);
  });

  it("returns a null rate for an empty set", () => {
    expect(tally([]).winRate).toBeNull();
  });
});

describe("isPublishable", () => {
  it("withholds a rate below the sample floor", () => {
    // The exact shape of the bug this guards: 2-1 is not "67% accuracy".
    const thin = tally([...rows(2, { result: "win" }), ...rows(1, { result: "lose" })]);
    expect(thin.winRate).toBeCloseTo(2 / 3);
    expect(isPublishable(thin)).toBe(false);
  });

  it("publishes at exactly the floor", () => {
    const atFloor = tally(rows(MIN_PUBLISHABLE_SAMPLE, { result: "win" }));
    expect(atFloor.sample).toBe(MIN_PUBLISHABLE_SAMPLE);
    expect(isPublishable(atFloor)).toBe(true);
  });

  it("does not count pushes towards the floor", () => {
    const padded = tally([
      ...rows(2, { result: "win" }),
      ...rows(50, { result: "push" }),
    ]);
    expect(isPublishable(padded)).toBe(false);
  });

  it("treats a missing record as unpublishable", () => {
    expect(isPublishable(undefined)).toBe(false);
  });
});

describe("summarise", () => {
  it("groups markets by family, not by full market id", () => {
    const out = summarise([
      row({ market: "ou:over:2.5", result: "win" }),
      row({ market: "ou:under:1.5", result: "lose" }),
      row({ market: "1x2:home", result: "win" }),
    ]);

    // "ou:over:2.5" and "ou:under:1.5" are one bucket — splitting them
    // fragments an already-small sample below the publishable floor.
    expect(out.byMarket.get("ou")?.sample).toBe(2);
    expect(out.byMarket.get("1x2")?.sample).toBe(1);
    expect(out.byMarket.has("ou:over:2.5")).toBe(false);
  });

  it("keys leagues on the catalogue code, never a provider display name", () => {
    const out = summarise([
      row({ league_code: "premier-league" }),
      row({ league_code: "npfl", result: "lose" }),
    ]);

    expect(out.byLeague.get("premier-league")?.wins).toBe(1);
    expect(out.byLeague.get("npfl")?.losses).toBe(1);
    // The old contract, and the bug it caused: the log stores whatever the
    // answering feed calls the competition ("Premier League"), while every
    // caller looked up LeagueDef.name ("English Premier League"). Neither
    // string is a key any more.
    expect(out.byLeague.get("English Premier League")).toBeUndefined();
    expect(out.byLeague.get("Premier League")).toBeUndefined();
  });

  it("counts uncatalogued competitions separately but still in the overall", () => {
    const out = summarise([
      row({ league_code: "premier-league" }),
      // Real rows: the log carries American USL and Chilean fixtures, which
      // are not in src/lib/leagues.ts and never will be.
      row({ league_code: null, result: "lose" }),
      row({ league_code: null }),
    ]);

    expect(out.byLeague.size).toBe(1);
    expect(out.uncatalogued.sample).toBe(2);
    // A pick outside the catalogue is still a pick that was published.
    expect(out.overall.sample).toBe(3);
  });

  it("attributes rows with no model_id to the active model", () => {
    // Everything logged before migration 0012 predates the column and is
    // goals-v1 by definition — the same thing that migration's DEFAULT says.
    const out = summarise([row({ model_id: null }), row({ model_id: "goals-v1" })]);

    expect(out.byModel.get("goals-v1")?.sample).toBe(2);
    expect(out.byModel.size).toBe(1);
  });

  it("ignores an unrecognised model_id rather than inventing a bucket", () => {
    const out = summarise([row({ model_id: "some-model-that-was-removed" })]);
    expect(out.byModel.get("goals-v1")?.sample).toBe(1);
  });

  it("keeps the overall tally consistent with the groups", () => {
    const out = summarise([
      row({ league_code: "a", market: "1x2:home", result: "win" }),
      row({ league_code: "a", market: "ou:over:2.5", result: "lose" }),
      row({ league_code: "b", market: "btts:yes", result: "win" }),
      row({ league_code: "b", market: "btts:no", result: "push" }),
    ]);

    expect(out.overall.wins).toBe(2);
    expect(out.overall.losses).toBe(1);
    expect(out.overall.pushes).toBe(1);

    const leagueSample = [...out.byLeague.values()].reduce((n, r) => n + r.sample, 0);
    expect(leagueSample + out.uncatalogued.sample).toBe(out.overall.sample);
  });

  it("returns empty structures for no rows", () => {
    const out = summarise([]);
    expect(out.overall.sample).toBe(0);
    expect(out.byLeague.size).toBe(0);
    expect(out.byMarket.size).toBe(0);
    expect(out.byModel.size).toBe(0);
    expect(out.uncatalogued.sample).toBe(0);
  });
});
