import { describe, expect, it } from "vitest";
import { formatWhatsAppNumber, normaliseInviteUrl, normaliseWhatsAppNumber, rosterStatus } from "./vip-chat";

describe("normaliseWhatsAppNumber", () => {
  it("reads Nigerian numbers written locally", () => {
    expect(normaliseWhatsAppNumber("0803 123 4567")).toBe("+2348031234567");
    expect(normaliseWhatsAppNumber("8031234567")).toBe("+2348031234567");
    expect(normaliseWhatsAppNumber("0907-123-4567")).toBe("+2349071234567");
  });
  it("keeps numbers with a country code", () => {
    expect(normaliseWhatsAppNumber("+234 803 123 4567")).toBe("+2348031234567");
    expect(normaliseWhatsAppNumber("2348031234567")).toBe("+2348031234567");
    expect(normaliseWhatsAppNumber("00233 24 123 4567")).toBe("+233241234567");
    expect(normaliseWhatsAppNumber("+44 7700 900123")).toBe("+447700900123");
  });
  it("rejects what can't be a number", () => {
    expect(normaliseWhatsAppNumber("")).toBeNull();
    expect(normaliseWhatsAppNumber("call me")).toBeNull();
    expect(normaliseWhatsAppNumber("12345")).toBeNull();
    expect(normaliseWhatsAppNumber("0123 456 7890")).toBeNull();
  });
});

describe("normaliseInviteUrl", () => {
  it("drops the query WhatsApp adds when a link is copied", () => {
    expect(normaliseInviteUrl("https://chat.whatsapp.com/AbCdEf1234567890xyz?mode=ems_copy_t")).toBe(
      "https://chat.whatsapp.com/AbCdEf1234567890xyz",
    );
  });
  it("only takes WhatsApp group links", () => {
    expect(normaliseInviteUrl("https://example.com/AbCdEf1234567890")).toBeNull();
    expect(normaliseInviteUrl("http://chat.whatsapp.com/AbCdEf1234567890")).toBeNull();
    expect(normaliseInviteUrl("chat.whatsapp.com/AbCdEf1234567890")).toBeNull();
    expect(normaliseInviteUrl("https://chat.whatsapp.com/")).toBeNull();
  });
});

describe("formatWhatsAppNumber", () => {
  it("spaces a Nigerian number and leaves others alone", () => {
    expect(formatWhatsAppNumber("+2348031234567")).toBe("+234 803 123 4567");
    expect(formatWhatsAppNumber("+447700900123")).toBe("+447700900123");
  });
});

describe("rosterStatus", () => {
  it("asks for a lapsed member's number to come out of the group", () => {
    expect(rosterStatus({ vip: false, openedAt: "2026-10-01", removedAt: null })).toBe("remove");
    expect(rosterStatus({ vip: false, openedAt: "2026-10-01", removedAt: "2026-10-20" })).toBe("out");
  });
  it("never asks to remove someone who never opened the link", () => {
    expect(rosterStatus({ vip: false, openedAt: null, removedAt: null })).toBe("out");
  });
  it("tells members who are in from those who have not joined", () => {
    expect(rosterStatus({ vip: true, openedAt: "2026-10-01", removedAt: null })).toBe("in");
    expect(rosterStatus({ vip: true, openedAt: null, removedAt: null })).toBe("not-joined");
  });
});
