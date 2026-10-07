import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ supabaseConfigured: false, supabaseServer: async () => ({}) }));
vi.mock("@/lib/ask/guest", () => ({ guestIdentity: () => ({ deviceKey: "k", ipKey: "i", setCookie: null }) }));

describe("checkNickname", () => {
  it("accepts ordinary names and trims them", async () => {
    const { checkNickname } = await import("./identity");
    expect(checkNickname("  Tunde  O. ")).toEqual({ ok: true, name: "Tunde O." });
    expect(checkNickname("Adá_99")).toEqual({ ok: true, name: "Adá_99" });
  });

  it("refuses empty, long, odd or official-sounding names", async () => {
    const { checkNickname } = await import("./identity");
    expect(checkNickname("A").ok).toBe(false);
    expect(checkNickname("x".repeat(25)).ok).toBe(false);
    expect(checkNickname("<script>").ok).toBe(false);
    expect(checkNickname("BetriX Team").ok).toBe(false);
    expect(checkNickname("Oma").ok).toBe(false);
    expect(checkNickname(undefined).ok).toBe(false);
  });
});
