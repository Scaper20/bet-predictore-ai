import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { preflightChecks } = await import("./preflight");
const { askConfig } = await import("./config");

const ready = {
  paused: false,
  config: askConfig({}),
  hasKey: true,
  hasOwnKey: true,
  alertTo: "support@kiqstat.app",
  canEmail: true,
  books: true,
  passWindow: true,
  offerCaps: true,
};
const state = (input: typeof ready) => Object.fromEntries(preflightChecks(input).map((c) => [c.id, c.state]));

describe("Ask activation preflight", () => {
  it("passes everything when the guard enforces, the books answer and alerts can go out", () => {
    expect(Object.values(state(ready)).every((s) => s === "ok")).toBe(true);
  });
  it("fails an observing or disabled guard", () => {
    expect(state({ ...ready, config: askConfig({ ASK_GUARD: "observe" }) }).guard).toBe("fail");
    expect(state({ ...ready, config: askConfig({ ASK_GUARD: "off" }) }).guard).toBe("fail");
  });
  it("fails without 0088 or 0089, and without a way to send alerts", () => {
    expect(state({ ...ready, books: false }).books).toBe("fail");
    expect(state({ ...ready, passWindow: false }).pass).toBe("fail");
    expect(state({ ...ready, offerCaps: false }).pass).toBe("fail");
    expect(state({ ...ready, canEmail: false }).alerts).toBe("fail");
  });
  it("warns on a shared key and while Ask is paused", () => {
    expect(state({ ...ready, hasOwnKey: false }).key).toBe("warn");
    expect(state({ ...ready, hasOwnKey: false, hasKey: false }).key).toBe("fail");
    expect(state({ ...ready, paused: true }).paused).toBe("warn");
  });
  it("fails a per-question ceiling above the daily budget", () => {
    expect(state({ ...ready, config: askConfig({ ASK_DAILY_BUDGET_USD: "0.01", ASK_REQUEST_CEILING_USD: "0.02" }) }).caps).toBe("fail");
  });
});
