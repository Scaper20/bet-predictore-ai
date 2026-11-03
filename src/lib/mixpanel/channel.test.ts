import { describe, expect, it } from "vitest";
import { acquisitionChannel } from "./channel";
import { accuracyBucket, clean, needsConsent, questionTopic } from "./events";

const touch = (t: Record<string, string | null>) => encodeURIComponent(JSON.stringify(t));

describe("acquisitionChannel", () => {
  it("is direct with no first touch", () => {
    expect(acquisitionChannel(undefined, undefined)).toBe("direct");
    expect(acquisitionChannel("not json", null)).toBe("direct");
  });
  it("puts a partner link first", () => {
    expect(acquisitionChannel(touch({ referrerHost: "google.com" }), "abc")).toBe("partner");
  });
  it("reads paid media as ads", () => {
    expect(acquisitionChannel(touch({ utmSource: "x", utmMedium: "cpc" }), null)).toBe("ads");
  });
  it("reads AI assistants by referrer or by the utm_source they add", () => {
    expect(acquisitionChannel(touch({ utmSource: "chatgpt.com" }), null)).toBe("ai_assistant");
    expect(acquisitionChannel(touch({ referrerHost: "www.perplexity.ai" }), null)).toBe("ai_assistant");
    expect(acquisitionChannel(touch({ referrerHost: "gemini.google.com" }), null)).toBe("ai_assistant");
  });
  it("reads social hosts, search hosts and other referrers", () => {
    expect(acquisitionChannel(touch({ referrerHost: "t.co" }), null)).toBe("social");
    expect(acquisitionChannel(touch({ referrerHost: "www.google.com" }), null)).toBe("organic_search");
    expect(acquisitionChannel(touch({ referrerHost: "someblog.ng" }), null)).toBe("referral");
  });
});

describe("mixpanel helpers", () => {
  it("holds back analytics only where consent comes first", () => {
    expect(needsConsent("DE")).toBe(true);
    expect(needsConsent("gb")).toBe(true);
    expect(needsConsent("NG")).toBe(false);
    expect(needsConsent(undefined)).toBe(false);
  });
  it("buckets confidence", () => {
    expect(accuracyBucket(82)).toBe("high");
    expect(accuracyBucket(58)).toBe("medium");
    expect(accuracyBucket(31)).toBe("low");
    expect(accuracyBucket(undefined)).toBe("unrated");
  });
  it("drops empty properties and keeps numbers numeric", () => {
    expect(clean({ a: "x", b: "", c: null, d: undefined, e: 0, f: Number.NaN })).toEqual({ a: "x", e: 0 });
  });
  it("classifies a question without keeping it", () => {
    expect(questionTopic("What are the odds on Arsenal?")).toBe("odds");
    expect(questionTopic("Who will win tonight?")).toBe("predictions");
    expect(questionTopic("hello")).toBe("other");
  });
});
