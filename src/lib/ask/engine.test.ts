import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ask/tools", () => ({
  ASK_TOOLS: [],
  toolStatus: () => "Working…",
  runTool: async () => ({ content: JSON.stringify({ ok: true, rows: "x".repeat(1500) }) }),
}));

const Anthropic = (await import("@anthropic-ai/sdk")).default;
const { runAsk, outputRoom } = await import("./engine");
const { askConfig } = await import("./config");
const { worstCallMicros } = await import("./cost");

type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };
interface Script {
  /** Report prompt sizes that follow from the request, as the real API does. */
  realPrompt?: boolean;
  /** What the model "does" on each call, given the request it got. */
  reply: (req: { max_tokens: number; tool_choice?: { type: string }; messages: unknown[] }, call: number) => {
    text?: string;
    tool?: boolean;
    usage: Partial<Usage>;
    stop?: string;
    fail?: unknown;
  };
}

function fakeClient(script: Script) {
  const requests: { max_tokens: number; tool_choice?: { type: string }; messages: unknown[] }[] = [];
  const client = {
    beta: {
      messages: {
        stream(req: { max_tokens: number; tool_choice?: { type: string }; messages: unknown[] }) {
          requests.push(req);
          const r = script.reply(req, requests.length - 1);
          const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...r.usage };
          if (script.realPrompt) {
            // As the API does: the prompt the model reads is the fixed part plus what was sent.
            const prompt = 2_800 + Math.ceil(JSON.stringify(req.messages).length / 3);
            const read = Math.floor(prompt * Math.random());
            const write = Math.floor((prompt - read) * Math.random());
            Object.assign(usage, { cache_read_input_tokens: read, cache_creation_input_tokens: write, input_tokens: prompt - read - write });
          }
          // The fake respects max_tokens, as the API does.
          usage.output_tokens = Math.min(usage.output_tokens, req.max_tokens);
          const listeners: ((d: string) => void)[] = [];
          return {
            on(_e: string, cb: (d: string) => void) {
              listeners.push(cb);
              return this;
            },
            currentMessage: { usage },
            async finalMessage() {
              if (r.fail) throw r.fail;
              if (r.text) for (const l of listeners) l(r.text);
              const content = r.tool && req.tool_choice?.type !== "none"
                ? [{ type: "tool_use", id: `t${requests.length}`, name: "get_prediction", input: { match_id: "x" } }]
                : [{ type: "text", text: r.text ?? "" }];
              return { content, usage, stop_reason: r.stop ?? (content[0].type === "tool_use" ? "tool_use" : "end_turn") };
            },
          };
        },
      },
    },
  };
  return { client: client as never, requests };
}

const ctx = { tier: "paid" as const, viewer: { paid: true, freeStrongId: null, freeIds: [] } as never, timeZone: "Africa/Lagos" };
const question = [{ role: "user" as const, content: "Is Arsenal v Chelsea a high-scoring game?" }];

describe("runAsk", () => {
  it("answers through tool rounds and records every call's cost", async () => {
    const { client } = fakeClient({
      reply: (_req, i) =>
        i < 2
          ? { tool: true, usage: { input_tokens: 300, cache_creation_input_tokens: 2600, output_tokens: 120 } }
          : { text: "Probably, yes.", usage: { input_tokens: 400, cache_read_input_tokens: 5000, output_tokens: 200 } },
    });
    const r = await runAsk({ client, config: askConfig({}), messages: question, toolContext: ctx, emit: () => {}, ceilingMicros: null, enforce: false });
    expect(r.outcome).toBe("answered");
    expect(r.calls).toHaveLength(3);
    expect(r.costMicros).toBe(r.calls.reduce((s, c) => s + c.costMicros, 0));
    expect(r.costMicros).toBeGreaterThan(0);
    expect(r.text).toBe("Probably, yes.");
  });

  it("enforcing, keeps a question under its ceiling however long the model writes", async () => {
    const ceiling = 12_000; // $0.012
    const { client, requests } = fakeClient({
      // A model that always looks something up and always writes the maximum.
      reply: () => ({ tool: true, text: "…", usage: { input_tokens: 2000, cache_creation_input_tokens: 3000, output_tokens: 99_999 } }),
    });
    const r = await runAsk({ client, config: askConfig({}), messages: question, toolContext: ctx, emit: () => {}, ceilingMicros: ceiling, enforce: true });
    expect(r.costMicros).toBeLessThanOrEqual(ceiling);
    // The capped call ran without tools and with a smaller output ceiling.
    expect(requests.at(-1)?.tool_choice).toEqual({ type: "none" });
    expect(requests.at(-1)!.max_tokens).toBeLessThan(8000);
  });

  it("stops before the first call when even a short answer wouldn't fit", async () => {
    const { client, requests } = fakeClient({ reply: () => ({ text: "x", usage: { output_tokens: 10 } }) });
    const r = await runAsk({ client, config: askConfig({}), messages: question, toolContext: ctx, emit: () => {}, ceilingMicros: 100, enforce: true });
    expect(r.outcome).toBe("budget_stop");
    expect(requests).toHaveLength(0);
    expect(r.costMicros).toBe(0);
  });

  it("observing, runs as before and only records that it would have stepped in", async () => {
    const { client, requests } = fakeClient({ reply: () => ({ text: "Fine.", usage: { input_tokens: 3000, output_tokens: 300 } }) });
    const r = await runAsk({ client, config: askConfig({}), messages: question, toolContext: ctx, emit: () => {}, ceilingMicros: 100, enforce: false });
    expect(r.outcome).toBe("answered");
    expect(r.wouldStop).toBe(true);
    expect(requests[0].max_tokens).toBe(8000);
  });

  it("costs a cancelled call for what it produced", async () => {
    const controller = new AbortController();
    const { client } = fakeClient({
      reply: () => {
        controller.abort();
        return { usage: { input_tokens: 2500, output_tokens: 180 }, fail: new Anthropic.APIUserAbortError() };
      },
    });
    const r = await runAsk({ client, config: askConfig({}), messages: question, toolContext: ctx, emit: () => {}, signal: controller.signal, ceilingMicros: null, enforce: false });
    expect(r.outcome).toBe("aborted");
    expect(r.calls[0].aborted).toBe(true);
    expect(r.costMicros).toBe(2500 * 0.1 + 180 * 0.5);
  });

  it("flags an empty credit balance as a billing failure", async () => {
    // Built the way the SDK builds it from the API's reply (the shape in the production logs).
    const err = Anthropic.APIError.generate(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
      undefined,
      new Headers(),
    );
    const { client } = fakeClient({ reply: () => ({ usage: {}, fail: err }) });
    const r = await runAsk({ client, config: askConfig({}), messages: question, toolContext: ctx, emit: () => {}, ceilingMicros: null, enforce: false });
    expect(r.outcome).toBe("error");
    expect(r.billing).toBe(true);
    expect(r.costMicros).toBe(0);
  });

  it("holds the ceiling across random models and settings", async () => {
    for (let trial = 0; trial < 200; trial++) {
      const ceiling = 1_000 + Math.floor(Math.random() * 40_000);
      const config = askConfig({}, { maxTokens: 300 + Math.floor(Math.random() * 8000), maxRounds: 1 + Math.floor(Math.random() * 6) });
      const { client } = fakeClient({
        realPrompt: true,
        reply: () => ({
          tool: Math.random() < 0.7,
          text: "t",
          usage: { output_tokens: Math.floor(Math.random() * 20000) },
        }),
      });
      const r = await runAsk({ client, config, messages: question, toolContext: ctx, emit: () => {}, ceilingMicros: ceiling, enforce: true });
      expect(r.costMicros).toBeLessThanOrEqual(ceiling);
    }
  });
});

describe("outputRoom", () => {
  it("is the largest output ceiling whose worst case fits the room", () => {
    const room = outputRoom("claude-haiku-5-5", 10_000, 5_250);
    expect(worstCallMicros("claude-haiku-5-5", 10_000, room)).toBeLessThanOrEqual(5_250);
    expect(worstCallMicros("claude-haiku-5-5", 10_000, room + 2)).toBeGreaterThan(5_250);
  });
});
