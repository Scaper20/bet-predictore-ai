import { beforeEach, describe, expect, it } from "vitest";
import { LAST_SEEN_WINDOW_MS, resetLastSeen, shouldRecordSeen } from "./last-seen";

describe("shouldRecordSeen", () => {
  beforeEach(resetLastSeen);

  it("records a user the first time, then not again inside the window", () => {
    expect(shouldRecordSeen("u1", 0)).toBe(true);
    expect(shouldRecordSeen("u1", 1_000)).toBe(false);
    expect(shouldRecordSeen("u1", LAST_SEEN_WINDOW_MS - 1)).toBe(false);
  });

  it("records them again once the window has passed", () => {
    expect(shouldRecordSeen("u1", 0)).toBe(true);
    expect(shouldRecordSeen("u1", LAST_SEEN_WINDOW_MS)).toBe(true);
    expect(shouldRecordSeen("u1", LAST_SEEN_WINDOW_MS + 5)).toBe(false);
  });

  it("keeps users apart", () => {
    expect(shouldRecordSeen("u1", 0)).toBe(true);
    expect(shouldRecordSeen("u2", 10)).toBe(true);
    expect(shouldRecordSeen("u1", 20)).toBe(false);
  });

  it("stays bounded when a great many users pass through", () => {
    for (let i = 0; i < 12_000; i++) shouldRecordSeen(`user-${i}`, 0);
    // The newest are still remembered, the very oldest were let go.
    expect(shouldRecordSeen("user-11999", 1)).toBe(false);
    expect(shouldRecordSeen("user-0", 1)).toBe(true);
  });
});
