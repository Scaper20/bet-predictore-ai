import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { ASK_SYSTEM_PROMPT } from "@/lib/ask/prompt";
import { ASK_TOOLS, runTool as defaultRunTool, toolStatus, type ToolContext } from "@/lib/ask/tools";
import { callCostMicros, promptTokens, worstCallMicros } from "@/lib/ask/cost";
import type { AskConfig } from "@/lib/ask/config";
import type { AskEvent } from "@/lib/ask/request";

/**
 * One Ask KiqStat question, start to finish: the model and tool rounds, with
 * every call's usage and cost recorded. Shared by the live route
 * (api/ask/route.ts) and the Ask lab, so a benchmark measures exactly what
 * users get.
 *
 * Money: with a ceiling, each call is checked before it is made. If the
 * dearest that call could cost (its whole prompt at the cache-write rate plus
 * every output token allowed) would take the question past the ceiling, the
 * call becomes a short final answer with no more lookups, or the question
 * stops. So the ceiling holds whatever the model does. In "observe" mode the
 * check only records that it would have stepped in.
 *
 * Never throws: failures come back as an outcome, with the calls made so far
 * and what they cost (a cancelled call is billed for what it produced).
 */

/**
 * Tokens the system prompt and tool definitions take (about 7,300 characters,
 * near 3 characters a token on Haiku 5.5's tokenizer, plus the API's tool
 * overhead), rounded up: the first call has no usage yet to measure from, and
 * an estimate on the high side only ever stops a question early, never late.
 */
const FIXED_PROMPT_TOKENS = 3_200;
/** A final answer shorter than this isn't worth starting; the question stops instead. */
export const MIN_FINAL_TOKENS = 400;

export type AskOutcome = "answered" | "no_answer" | "budget_stop" | "aborted" | "error" | "refusal";

export interface CallRecord {
  round: number;
  kind: "turn" | "retry" | "final";
  model: string;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  costMicros: number;
  stopReason: string | null;
  aborted: boolean;
  error: string | null;
  ms: number;
}

export interface AskRunResult {
  outcome: AskOutcome;
  answered: boolean;
  calls: CallRecord[];
  costMicros: number;
  ms: number;
  /** Observe mode: the ceiling would have stepped in. */
  wouldStop: boolean;
  /** The account is out of credit or its key was refused. */
  billing: boolean;
  /** The answer text, for the lab; live questions don't store it. */
  text: string;
  tools: string[];
  picks: number;
  error: string | null;
}

export interface RunAskInput {
  client: Pick<Anthropic, "beta">;
  config: AskConfig;
  messages: Anthropic.Beta.BetaMessageParam[];
  toolContext: Omit<ToolContext, "onPicks">;
  emit: (event: AskEvent) => void;
  signal?: AbortSignal;
  /** Most this question may cost, in micro-dollars, or null for no ceiling. */
  ceilingMicros: number | null;
  /** Whether the ceiling stops calls or only records that it would have. */
  enforce: boolean;
  runTool?: typeof defaultRunTool;
}

const chars = (v: unknown) => JSON.stringify(v ?? "").length;
/** Characters to tokens on the high side (Haiku 5.5 averages about 3 a token on this content). */
const tokensFromChars = (n: number) => Math.ceil(n / 2.5);

/** The largest max_tokens that keeps a call with this prompt inside `room`. */
export function outputRoom(model: string, promptEstimate: number, room: number): number {
  const base = worstCallMicros(model, promptEstimate, 0);
  const perToken = worstCallMicros(model, promptEstimate, 1_000_000) - base; // micro-dollars per million output tokens
  return Math.floor(((room - base) * 1_000_000) / perToken);
}

/** The least a question needs to give one short answer: below this, a reservation isn't worth granting. */
export function minQuestionMicros(model: string): number {
  return worstCallMicros(model, FIXED_PROMPT_TOKENS + 300, MIN_FINAL_TOKENS);
}

export function isBillingError(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status === 401 || err.status === 403) return true;
  // The reason sits in the error body; the message may only carry the status.
  return /credit balance|billing|purchase credits/i.test(`${err.message} ${JSON.stringify(err.error ?? "")}`);
}

export async function runAsk(input: RunAskInput): Promise<AskRunResult> {
  const { client, config, emit, signal } = input;
  const runTool = input.runTool ?? defaultRunTool;
  const messages = [...input.messages];
  const started = Date.now();
  const calls: CallRecord[] = [];
  const tools: string[] = [];
  let costMicros = 0;
  let answered = false;
  let text = "";
  let picks = 0;
  let wouldStop = false;
  let outcome: AskOutcome = "no_answer";
  let billing = false;
  let error: string | null = null;
  let jsonRetries = 0;
  let nudged = false;
  // The next call's prompt size, refined after each call from real usage.
  let promptEstimate = FIXED_PROMPT_TOKENS + tokensFromChars(chars(messages));

  const record = (round: number, kind: CallRecord["kind"], usage: Anthropic.Beta.BetaUsage | undefined, t0: number, extra: Partial<CallRecord>) => {
    const u = {
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    };
    const cost = callCostMicros(config.model, u);
    costMicros += cost;
    calls.push({
      round,
      kind,
      model: config.model,
      input: u.input_tokens,
      cacheWrite: u.cache_creation_input_tokens,
      cacheRead: u.cache_read_input_tokens,
      output: u.output_tokens,
      costMicros: cost,
      stopReason: null,
      aborted: false,
      error: null,
      ms: Date.now() - t0,
      ...extra,
    });
    return u;
  };

  const nudge = () => {
    if (nudged) return;
    nudged = true;
    messages.push({ role: "user", content: "[Context — not from the user] Answer now with what you have; no more lookups." });
  };

  try {
    for (let round = 0; round < config.maxRounds; round++) {
      let maxTokens = config.maxTokens;
      // Only the budget forces a final, no-lookup answer; otherwise the last
      // round behaves as before (the nudge after round maxRounds - 2 asks for one).
      let final = false;

      if (input.ceilingMicros !== null) {
        const room = input.ceilingMicros - costMicros;
        const allowed = outputRoom(config.model, promptEstimate, room);
        if (allowed < config.maxTokens) {
          if (!input.enforce) {
            wouldStop = true;
          } else if (allowed >= MIN_FINAL_TOKENS) {
            maxTokens = allowed;
            final = true;
          } else {
            outcome = "budget_stop";
            break;
          }
        }
      }
      if (final) nudge();

      const t0 = Date.now();
      const turn = client.beta.messages.stream(
        {
          model: config.model,
          max_tokens: maxTokens,
          output_config: { effort: config.effort },
          // Tools + system are identical on every request, so they're cached;
          // the top-level breakpoint also caches the growing conversation
          // across this question's tool rounds.
          system: [{ type: "text", text: ASK_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          cache_control: { type: "ephemeral" },
          tools: ASK_TOOLS,
          ...(final ? { tool_choice: { type: "none" as const } } : {}),
          messages,
        },
        { signal },
      );
      turn.on("text", (delta) => {
        answered = true;
        text += delta;
        emit({ type: "text", delta });
      });

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await turn.finalMessage();
      } catch (err) {
        const aborted = Boolean(signal?.aborted);
        record(round, "turn", turn.currentMessage?.usage, t0, {
          aborted,
          error: aborted ? "cancelled" : err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
        // Only an unparseable tool input is worth re-issuing; API errors and
        // cancellations end the question.
        if (err instanceof Anthropic.APIError || aborted || jsonRetries++ >= 2) throw err;
        continue;
      }
      const u = record(round, final ? "final" : jsonRetries > 0 ? "retry" : "turn", message.usage, t0, { stopReason: message.stop_reason });
      jsonRetries = 0;

      if (message.stop_reason === "refusal") {
        if (!answered) {
          const line = "I can't help with that one. Ask me about a match or your picks.";
          text += line;
          emit({ type: "text", delta: line });
        }
        answered = true;
        outcome = "refusal";
        break;
      }

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        promptEstimate = promptTokens(u) + u.output_tokens;
        continue;
      }
      if (toolUses.length === 0 || final || message.stop_reason === "max_tokens") break; // never run a truncated tool call

      messages.push({ role: "assistant", content: message.content });
      for (const use of toolUses) {
        tools.push(use.name);
        emit({ type: "status", label: toolStatus(use.name, (use.input ?? {}) as Record<string, unknown>) });
      }
      const results = await Promise.all(
        toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const result = await runTool(use.name, use.input, {
            ...input.toolContext,
            onPicks: (cards) => {
              answered = true;
              picks += cards.length;
              emit({ type: "picks", picks: cards });
            },
          });
          return { type: "tool_result", tool_use_id: use.id, content: result.content, ...(result.isError ? { is_error: true } : {}) };
        }),
      );
      messages.push({ role: "user", content: results });
      promptEstimate = promptTokens(u) + u.output_tokens + tokensFromChars(chars(results)) + 60;
      if (round === config.maxRounds - 2) nudge();
    }
    if (outcome === "no_answer" && answered) outcome = "answered";
  } catch (err) {
    if (signal?.aborted) {
      outcome = "aborted";
    } else {
      outcome = "error";
      billing = isBillingError(err);
      error =
        err instanceof Anthropic.APIError
          ? `${err.status ?? ""} ${err.type ?? err.name}: ${err.message.slice(0, 160)}`
          : err instanceof Error
            ? err.message.slice(0, 200)
            : String(err);
    }
  }

  return { outcome, answered, calls, costMicros, ms: Date.now() - started, wouldStop, billing, text, tools, picks, error };
}
