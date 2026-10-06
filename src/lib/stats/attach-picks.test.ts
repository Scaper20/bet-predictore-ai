import { describe, expect, it } from "vitest";
import { attachPicks } from "./attach-picks";

const match = (id: string, home: string, away: string, kickoff = "2026-10-02T23:00:00Z") => ({ id, kickoff, home: { name: home }, away: { name: away } });
const pick = (match_id: string, home_name: string, away_name: string, kickoff = "2026-10-02T23:00:00Z") => ({ match_id, label: "Home Win", result: "win", kickoff, home_name, away_name });

describe("attachPicks", () => {
  it("pairs by id", () => {
    expect(attachPicks([match("sdb:1", "A", "B")], [pick("sdb:1", "X", "Y")]).get("sdb:1")?.matchId).toBe("sdb:1");
  });

  it("pairs a pick logged under another feed's id by kickoff and clubs", () => {
    const out = attachPicks([match("sdb:2398399", "São Paulo", "Santos")], [pick("fd:554948", "São Paulo FC", "Santos FC")]);
    expect(out.get("sdb:2398399")).toMatchObject({ matchId: "fd:554948", result: "win" });
  });

  it("does not pair different games", () => {
    expect(attachPicks([match("sdb:1", "São Paulo", "Santos")], [pick("fd:9", "São Paulo FC", "Santos FC", "2026-10-05T23:00:00Z")]).size).toBe(0);
    expect(attachPicks([match("sdb:1", "São Paulo", "Santos")], [pick("fd:9", "Palmeiras", "Santos")]).size).toBe(0);
  });
});
