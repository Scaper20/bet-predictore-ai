import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/props-feed", () => ({ runPlayerProps: vi.fn(), settlePlayerProps: vi.fn() }));
vi.mock("./write", () => ({ writeMatch: vi.fn(), snapshotPrematch: vi.fn() }));

const { classifyDue } = await import("./live");

const NOW = Date.UTC(2026, 10, 3, 18, 0);
const min = 60_000;
const game = (id: string, offsetMin: number, fotmob: string | null = "100") => ({
  id, source_ids: fotmob ? { fotmob } : {}, kickoff: new Date(NOW + offsetMin * min).toISOString(),
});
const det = (id: string, over: Partial<{ lineup_type: string | null; finished: boolean; has_player_stats: boolean; fetched_at: string | null }> = {}) => ({
  match_id: id, lineup_type: null, finished: false, has_player_stats: false, fetched_at: null, ...over,
});

describe("classifyDue", () => {
  it("fetches lineups within 90 minutes until FotMob confirms them", () => {
    const due = classifyDue(
      [game("a", 60), game("b", 60), game("c", 120), game("d", 30, null)],
      [det("a", { lineup_type: "predicted" }), det("b", { lineup_type: "standard" })],
      NOW,
    );
    expect(due.map((d) => [d.matchId, d.reason])).toEqual([["a", "lineup"]]);
  });

  it("follows games in play and just finished until the final stats are in", () => {
    const due = classifyDue(
      [game("live", -30), game("final", -110), game("done", -120), game("old", -7 * 60)],
      [det("live", { lineup_type: "standard" }), det("final", { finished: true }), det("done", { finished: true, has_player_stats: true })],
      NOW,
    );
    expect(due.map((d) => [d.matchId, d.reason])).toEqual([["final", "final"], ["live", "live"]]);
  });

  it("retries a finished game without player stats only every 20 minutes", () => {
    const recent = new Date(NOW - 5 * min).toISOString();
    const stale = new Date(NOW - 25 * min).toISOString();
    expect(classifyDue([game("x", -120)], [det("x", { finished: true, fetched_at: recent })], NOW)).toEqual([]);
    expect(classifyDue([game("x", -120)], [det("x", { finished: true, fetched_at: stale })], NOW)).toHaveLength(1);
  });

  it("puts lineups first, then finals, then games in play", () => {
    const due = classifyDue([game("live", -10), game("final", -100), game("lineup", 70)], [det("final", { finished: true })], NOW);
    expect(due.map((d) => d.reason)).toEqual(["lineup", "final", "live"]);
    expect(due[0].wasConfirmed).toBe(false);
  });
});
