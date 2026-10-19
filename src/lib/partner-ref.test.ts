import { describe, expect, it } from "vitest";
import { cleanRefParam, encodePartnerRef, parsePartnerRef } from "./partner-ref";

const DAY = 86_400_000;

describe("partner ref cookie", () => {
  it("accepts only slug-shaped values", () => {
    expect(cleanRefParam("Ada-Tips")).toBe("ada-tips");
    expect(cleanRefParam("a")).toBeNull();
    expect(cleanRefParam("bad slug!")).toBeNull();
    expect(cleanRefParam("a--b")).toBeNull();
    expect(cleanRefParam(null)).toBeNull();
  });

  it("round-trips a click", () => {
    const now = Date.now();
    expect(parsePartnerRef(encodePartnerRef("ada-tips", now - DAY), now)).toEqual({ slug: "ada-tips", clickedAt: now - DAY });
  });

  it("expires after 90 days and rejects junk or future stamps", () => {
    const now = Date.now();
    expect(parsePartnerRef(encodePartnerRef("ada-tips", now - 91 * DAY), now)).toBeNull();
    expect(parsePartnerRef(encodePartnerRef("ada-tips", now + 10 * DAY), now)).toBeNull();
    expect(parsePartnerRef("nonsense", now)).toBeNull();
    expect(parsePartnerRef("ada-tips.notanumber", now)).toBeNull();
    expect(parsePartnerRef(undefined, now)).toBeNull();
  });
});
