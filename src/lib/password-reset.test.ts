import { describe, expect, it } from "vitest";
import { RESET_COOLDOWN_MS, plausibleResetToken, resetCoolingDown } from "./password-reset";

describe("resetCoolingDown", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");

  it("lets an address that was never sent a reset through", () => {
    expect(resetCoolingDown(null, now)).toBe(false);
    expect(resetCoolingDown(undefined, now)).toBe(false);
  });

  it("holds an address inside the cooldown", () => {
    expect(resetCoolingDown(new Date(now - 30_000).toISOString(), now)).toBe(true);
    expect(resetCoolingDown(new Date(now - RESET_COOLDOWN_MS + 1).toISOString(), now)).toBe(true);
  });

  it("releases it once the cooldown has passed", () => {
    expect(resetCoolingDown(new Date(now - RESET_COOLDOWN_MS).toISOString(), now)).toBe(false);
    expect(resetCoolingDown(new Date(now - 3_600_000).toISOString(), now)).toBe(false);
  });

  it("treats an unreadable timestamp as no previous send", () => {
    expect(resetCoolingDown("not a date", now)).toBe(false);
  });
});

describe("plausibleResetToken", () => {
  it("accepts Supabase's hex SHA-224 hashed_token", () => {
    expect(plausibleResetToken("a".repeat(56))).toBe(true);
    expect(plausibleResetToken("0123456789abcdefABCDEF0123456789abcdef0123456789abcdef")).toBe(true);
  });

  it("rejects anything else before it reaches the auth server", () => {
    expect(plausibleResetToken(undefined)).toBe(false);
    expect(plausibleResetToken("")).toBe(false);
    expect(plausibleResetToken("short")).toBe(false);
    expect(plausibleResetToken("g".repeat(56))).toBe(false);
    expect(plausibleResetToken(`${"a".repeat(56)}&next=//evil.example`)).toBe(false);
    expect(plausibleResetToken(["a".repeat(56)])).toBe(false);
  });
});
