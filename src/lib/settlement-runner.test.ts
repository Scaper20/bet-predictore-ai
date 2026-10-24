import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The runner imports the provider facade; capture never calls it.
vi.mock("@/lib/providers", () => ({ getMatch: vi.fn() }));

import { captureMatchResults, resetCapturedMatches } from "./settlement-runner";
import type { Match } from "@/lib/types";

const match = (id: string, status: Match["status"], home: number | null, away: number | null): Match =>
  ({
    id,
    status,
    kickoff: "2026-10-24T14:00:00.000Z",
    league: { id: "l", name: "Premier League", code: "premier-league" },
    home: { id: "h", name: "Arsenal" },
    away: { id: "a", name: "Chelsea" },
    score: { home, away },
  }) as unknown as Match;

function fakeAdmin(error: unknown = null) {
  const upsert = vi.fn().mockResolvedValue({ error });
  return { upsert, client: { from: vi.fn(() => ({ upsert })) } as never };
}

describe("captureMatchResults", () => {
  beforeEach(resetCapturedMatches);

  it("writes a game once, then not again while it is unchanged", async () => {
    const { upsert, client } = fakeAdmin();
    await captureMatchResults(client, [match("fd:1", "finished", 2, 1)]);
    await captureMatchResults(client, [match("fd:1", "finished", 2, 1)]);
    await captureMatchResults(client, [match("fd:1", "finished", 2, 1)]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("writes again when the score or status changes", async () => {
    const { upsert, client } = fakeAdmin();
    await captureMatchResults(client, [match("fd:1", "live", 0, 0)]);
    await captureMatchResults(client, [match("fd:1", "live", 1, 0)]);
    await captureMatchResults(client, [match("fd:1", "finished", 1, 0)]);
    expect(upsert).toHaveBeenCalledTimes(3);
  });

  it("sends only the games that changed in a batch", async () => {
    const { upsert, client } = fakeAdmin();
    await captureMatchResults(client, [match("fd:1", "finished", 2, 1), match("fd:2", "live", 0, 0)]);
    await captureMatchResults(client, [match("fd:1", "finished", 2, 1), match("fd:2", "live", 1, 0), match("fd:3", "finished", 0, 0)]);
    const second = upsert.mock.calls[1][0] as { match_id: string }[];
    expect(second.map((r) => r.match_id).sort()).toEqual(["fd:2", "fd:3"]);
  });

  it("retries a game whose write failed", async () => {
    const failing = fakeAdmin({ message: "boom" });
    await captureMatchResults(failing.client, [match("fd:1", "finished", 2, 1)]);
    const ok = fakeAdmin();
    await captureMatchResults(ok.client, [match("fd:1", "finished", 2, 1)]);
    expect(ok.upsert).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty list", async () => {
    const { upsert, client } = fakeAdmin();
    await captureMatchResults(client, []);
    expect(upsert).not.toHaveBeenCalled();
  });
});
