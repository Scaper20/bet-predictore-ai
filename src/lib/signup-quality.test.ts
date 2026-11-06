import { describe, expect, it } from "vitest";
import { classifySignup, emailDomain, isEngaged } from "./signup-quality";

describe("classifySignup", () => {
  it("counts an ordinary address as a person", () => {
    expect(classifySignup("ada@gmail.com")).toBe("real");
    expect(classifySignup("ADA@Outlook.com")).toBe("real");
  });
  it("sets our own domains aside", () => {
    expect(classifySignup("support@kiqstat.app")).toBe("internal");
    expect(classifySignup("x@KiqStat.app")).toBe("internal");
  });
  it("flags mistyped and throwaway addresses", () => {
    expect(classifySignup("a@gmal.com")).toBe("suspect");
    expect(classifySignup("a@gmail.con")).toBe("suspect");
    expect(classifySignup("a@mailinator.com")).toBe("suspect");
  });
  it("flags a missing or malformed address", () => {
    expect(classifySignup(null)).toBe("suspect");
    expect(classifySignup("nodomain")).toBe("suspect");
  });
});

describe("emailDomain / isEngaged", () => {
  it("reads the domain", () => expect(emailDomain(" A@B.com ")).toBe("b.com"));
  it("needs a later visit", () => {
    expect(isEngaged("2026-10-01T10:00:00Z", "2026-10-01T10:05:00Z")).toBe(false);
    expect(isEngaged("2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z")).toBe(true);
    expect(isEngaged("2026-10-01T10:00:00Z", null)).toBe(false);
  });
});
