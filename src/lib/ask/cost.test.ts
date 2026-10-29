import { describe, expect, it } from "vitest";
import { callCostMicros, promptTokens, worstCallMicros } from "./cost";

describe("callCostMicros", () => {
  it("prices Haiku 5.5 input, output and both cache rates", () => {
    // 1M of each: 0.10 + 0.125 + 0.01 + 0.50 dollars.
    const u = { input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, output_tokens: 1_000_000 };
    // Over 100K prompt tokens, so the long-context rates apply: 0.5 + 0.625 + 0.05 + 2.5.
    expect(callCostMicros("claude-haiku-5-5", u)).toBe(3_675_000);
  });
  it("uses the short-prompt rates up to 100K tokens", () => {
    const u = { input_tokens: 2_000, cache_creation_input_tokens: 400, cache_read_input_tokens: 2_400, output_tokens: 500 };
    // 2000*0.1 + 400*0.125 + 2400*0.01 + 500*0.5 = 200 + 50 + 24 + 250
    expect(callCostMicros("claude-haiku-5-5", u)).toBe(524);
    expect(promptTokens(u)).toBe(4_800);
  });
  it("treats missing cache fields as zero and an unknown model as Haiku", () => {
    expect(callCostMicros("something-else", { input_tokens: 1000, output_tokens: 1000 })).toBe(600);
  });
});

describe("worstCallMicros", () => {
  it("bounds a call: the whole prompt at the cache-write rate plus every allowed output token", () => {
    // 10,000 * 0.125 + 8,000 * 0.5 = 1,250 + 4,000
    expect(worstCallMicros("claude-haiku-5-5", 10_000, 8_000)).toBe(5_250);
  });
  it("is never below what the call can actually cost", () => {
    const u = { input_tokens: 3_000, cache_creation_input_tokens: 4_000, cache_read_input_tokens: 3_000, output_tokens: 1_500 };
    expect(worstCallMicros("claude-haiku-5-5", promptTokens(u), 1_500)).toBeGreaterThanOrEqual(callCostMicros("claude-haiku-5-5", u));
  });
});
