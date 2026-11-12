import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { uniqueProjections } from "./props-feed";

describe("uniqueProjections", () => {
  it("keeps one row per match, player and market, the last one given", () => {
    const rows = [
      { match_id: "m1", player_id: "p1", market: "shots", mean: 1.1 },
      { match_id: "m1", player_id: "p1", market: "tackles", mean: 2 },
      { match_id: "m1", player_id: "p1", market: "shots", mean: 1.4 },
      { match_id: "m1", player_id: "p2", market: "shots", mean: 0.7 },
    ];
    expect(uniqueProjections(rows)).toEqual([
      { match_id: "m1", player_id: "p1", market: "shots", mean: 1.4 },
      { match_id: "m1", player_id: "p1", market: "tackles", mean: 2 },
      { match_id: "m1", player_id: "p2", market: "shots", mean: 0.7 },
    ]);
  });
});
