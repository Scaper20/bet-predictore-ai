/**
 * What Ask KiqStat's model calls cost, in US dollar micro-units (1e-6 USD),
 * from the usage block each response carries. Pure, so it's tested.
 *
 * Prices are Anthropic's list prices per million tokens. Claude Haiku 5.5:
 * $0.10 in / $0.50 out for prompts up to 100K tokens and $0.50 / $2.50 above;
 * a 5-minute cache write is 1.25x input and a cache read 0.1x. Thinking
 * tokens are billed as output and are inside output_tokens. Update the table
 * when prices change: the logged cost is only as good as these numbers.
 */

export interface ModelPrice {
  input: number;
  output: number;
  /** Prompt size above which `long` applies, in tokens. */
  longAbove?: number;
  long?: { input: number; output: number };
}

export const PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longAbove: 100_000, long: { input: 0.5, output: 2.5 } },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

export interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** The whole prompt the model read on one call: uncached, written to cache and read from cache. */
export function promptTokens(u: CallUsage): number {
  return u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
}

function rates(model: string, prompt: number): { input: number; output: number } {
  const p = PRICES[model] ?? PRICES["claude-haiku-5-5"];
  return p.long && p.longAbove !== undefined && prompt > p.longAbove ? p.long : p;
}

/** One call's cost in micro-dollars (integer, rounded up so a sum never undercounts). */
export function callCostMicros(model: string, u: CallUsage): number {
  const r = rates(model, promptTokens(u));
  const dollarsPerMillion =
    u.input_tokens * r.input +
    (u.cache_creation_input_tokens ?? 0) * r.input * CACHE_WRITE +
    (u.cache_read_input_tokens ?? 0) * r.input * CACHE_READ +
    u.output_tokens * r.output;
  // tokens x ($ per 1M tokens) = micro-dollars.
  return Math.ceil(dollarsPerMillion);
}

/**
 * The most the next call can cost before it is made: its whole prompt at the
 * cache-write rate (the dearest way to read input) plus every output token
 * max_tokens allows. Used to stop a question before a call would take it past
 * its ceiling, so the ceiling holds whatever the model then does.
 */
export function worstCallMicros(model: string, promptEstimate: number, maxTokens: number): number {
  const r = rates(model, promptEstimate);
  return Math.ceil(promptEstimate * r.input * CACHE_WRITE + maxTokens * r.output);
}

export const microsToUsd = (m: number) => m / 1_000_000;
