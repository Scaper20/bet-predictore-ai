import { afterEach, describe, expect, it, vi } from "vitest";
import { dataLayer, viaLayer } from "./data-layer";
import { publicMatchId, rowToMatch, sourceKeyForId, type MatchRow } from "./db-source";

const row: MatchRow = {
  id: "7f0c1d1e-0000-4000-8000-000000000001",
  league_code: "npfl",
  kickoff: "2026-10-04T15:00:00+00:00",
  status: "live",
  minute: 63,
  home_goals: 2,
  away_goals: 1,
  ht_home: 1,
  ht_away: 0,
  round: "Round 7",
  venue: null,
  source_ids: { thesportsdb: "2598057", espn: "754692" },
  home_name: "Remo Stars",
  away_name: "Enyimba",
  home: { id: "t1", name: "Remo Stars", crest: "https://example.test/remo.png" },
  away: { id: "t2", name: "Enyimba", crest: null },
};

describe("db-source ids", () => {
  it("keeps the id a game had under the live feeds", () => {
    expect(publicMatchId(row)).toBe("sdb:2598057");
    expect(publicMatchId({ ...row, source_ids: { ...row.source_ids, "football-data-org": "537785" } })).toBe("fd:537785");
    expect(publicMatchId({ ...row, source_ids: {} })).toBe(`db:${row.id}`);
  });

  it("finds a game by any id a page or log row might hold", () => {
    expect(sourceKeyForId("sdb:2598057")).toEqual({ kind: "contains", value: { thesportsdb: "2598057" } });
    expect(sourceKeyForId("fd:537785")).toEqual({ kind: "contains", value: { "football-data-org": "537785" } });
    expect(sourceKeyForId(`db:${row.id}`)).toEqual({ kind: "id", value: row.id });
    expect(sourceKeyForId("af:123")).toBeNull();
  });

  it("maps a row to the Match pages already render", () => {
    const m = rowToMatch(row);
    expect(m).toMatchObject({
      id: "sdb:2598057",
      status: "live",
      minute: 63,
      league: { code: "npfl", name: "Nigeria Professional Football League" },
      home: { name: "Remo Stars", crest: "https://example.test/remo.png" },
      away: { name: "Enyimba" },
      score: { home: 2, away: 1 },
      halftime: { home: 1, away: 0 },
      source: "thesportsdb",
    });
    expect(rowToMatch({ ...row, status: "finished" }).minute).toBeNull();
  });
});

describe("data layer switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to live when nothing is configured", async () => {
    vi.stubEnv("DATA_LAYER", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await dataLayer()).toBe("live");
  });

  it("live never touches the database", async () => {
    vi.stubEnv("DATA_LAYER", "live");
    const fromDb = vi.fn(async () => ["db"]);
    expect(await viaLayer(fromDb, async () => ["live"], [], (v) => v.length === 0)).toEqual(["live"]);
    expect(fromDb).not.toHaveBeenCalled();
  });

  it("db_fallback uses the database, and the API only when it comes back empty or fails", async () => {
    vi.stubEnv("DATA_LAYER", "db_fallback");
    expect(await viaLayer(async () => ["db"], async () => ["live"], [], (v) => v.length === 0)).toEqual(["db"]);
    expect(await viaLayer(async () => [], async () => ["live"], [], (v) => v.length === 0)).toEqual(["live"]);
    expect(await viaLayer(async () => { throw new Error("down"); }, async () => ["live"], [], (v) => v.length === 0)).toEqual(["live"]);
  });

  it("db never calls the API, even when the database fails", async () => {
    vi.stubEnv("DATA_LAYER", "db");
    const fromLive = vi.fn(async () => ["live"]);
    expect(await viaLayer(async () => [], fromLive, [], (v) => v.length === 0)).toEqual([]);
    expect(await viaLayer<string | null>(async () => { throw new Error("down"); }, async () => "live", null, (v) => v === null)).toBeNull();
    expect(fromLive).not.toHaveBeenCalled();
  });
});
