import Anthropic from "@anthropic-ai/sdk";
import { getEntitlement, meets } from "@/lib/entitlements";
import { supabaseServer } from "@/lib/supabase/server";
import { aiEnabled } from "@/lib/ai/analyst";
import { ASK_SYSTEM_PROMPT } from "@/lib/ask/prompt";
import { ASK_TOOLS, runTool, toolStatus, type AskTier } from "@/lib/ask/tools";
import {
  ASK_FREE_DAILY,
  ASK_PAID_DAILY,
  contextPreamble,
  parseAskRequest,
  type AskEvent,
} from "@/lib/ask/request";

export const dynamic = "force-dynamic";
/** A question can take a few tool rounds; leave room beyond the default. */
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
/** Tool rounds per question before the assistant must answer with what it has. */
const MAX_ROUNDS = 6;

const NO_STORE = { "Cache-Control": "no-store" };

/** The panel's header line: whether it works here, and today's allowance. */
export async function GET() {
  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  let used: number | null = null;
  if (entitlement.signedIn) {
    const supabase = await supabaseServer();
    const { data } = await supabase.rpc("ask_used_today");
    used = typeof data === "number" ? data : null;
  }
  return Response.json(
    {
      enabled: aiEnabled(),
      signedIn: entitlement.signedIn,
      paid,
      used,
      limit: entitlement.signedIn ? (paid ? null : ASK_FREE_DAILY) : null,
    },
    { headers: NO_STORE },
  );
}

/**
 * One question, answered as a stream of newline-delimited JSON events
 * (AskEvent): text deltas as they're written, a status line while tools
 * run, pick cards from show_picks, then done.
 *
 * Signed-in accounts only, with a daily allowance claimed in the database
 * before the model is called and handed back if no answer arrives.
 */
export async function POST(request: Request) {
  if (!aiEnabled()) {
    return Response.json(
      { type: "error", code: "unavailable", message: "Ask BetriX isn't available right now." },
      { status: 503, headers: NO_STORE },
    );
  }

  const parsed = parseAskRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") {
    return Response.json({ type: "error", message: parsed }, { status: 400, headers: NO_STORE });
  }

  const entitlement = await getEntitlement();
  if (!entitlement.signedIn) {
    return Response.json(
      { type: "error", code: "sign_in", message: "Create a free account to ask BetriX." },
      { status: 401, headers: NO_STORE },
    );
  }
  const paid = meets(entitlement.tier, "pass");
  const limit = paid ? ASK_PAID_DAILY : ASK_FREE_DAILY;
  const tier: AskTier = paid ? "paid" : "free";

  const supabase = await supabaseServer();
  const { data: claim, error: claimError } = await supabase.rpc("ask_claim", { p_limit: limit });
  const row = Array.isArray(claim) ? (claim[0] as { allowed: boolean; used: number } | undefined) : undefined;
  if (claimError || !row) {
    return Response.json(
      { type: "error", code: "unavailable", message: "Ask BetriX isn't available right now. Try again shortly." },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!row.allowed) {
    return Response.json(
      {
        type: "error",
        code: "limit",
        message: paid
          ? "You've hit today's fair-use limit. Ask again tomorrow."
          : `That's your ${ASK_FREE_DAILY} free questions for today. A Pass or higher makes it unlimited.`,
      },
      { status: 429, headers: NO_STORE },
    );
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = parsed.turns.map((t, i) =>
    i === parsed.turns.length - 1
      ? { role: "user", content: `${contextPreamble(parsed.context, new Date())}\n\n${t.text}` }
      : { role: t.role, content: t.text },
  );

  const encoder = new TextEncoder();
  const client = new Anthropic();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; the loop notices via the abort signal.
        }
      };

      let answered = false;
      try {
        let jsonRetries = 0;
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const turn = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 8000,
              // Chat over numbers the tools already computed; medium keeps the
              // tool choices careful without slow, long turns.
              output_config: { effort: "medium" },
              // Tools + system are identical on every request, so they're cached;
              // the top-level breakpoint also caches the growing conversation
              // across this question's tool rounds.
              system: [{ type: "text", text: ASK_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
              cache_control: { type: "ephemeral" },
              tools: ASK_TOOLS,
              messages,
              // If a safety classifier declines, retry on the model the API picks
              // rather than leaving the user with nothing.
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal: request.signal },
          );
          turn.on("text", (delta) => {
            answered = true;
            send({ type: "text", delta });
          });

          let message: Anthropic.Beta.BetaMessage;
          try {
            message = await turn.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            // Only an unparseable tool input is worth re-issuing; API errors
            // and aborts go to the outer handler.
            if (err instanceof Anthropic.APIError || request.signal.aborted || jsonRetries++ >= 2) throw err;
            continue;
          }

          if (message.stop_reason === "refusal") {
            if (!answered) send({ type: "text", delta: "I can't help with that one. Ask me about a match or your picks." });
            answered = true;
            break;
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }

          const toolUses = message.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
          );
          if (toolUses.length === 0) break;
          if (message.stop_reason === "max_tokens") break; // never run a truncated tool call

          messages.push({ role: "assistant", content: message.content });
          for (const use of toolUses) {
            send({ type: "status", label: toolStatus(use.name, (use.input ?? {}) as Record<string, unknown>) });
          }
          const results = await Promise.all(
            toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const outcome = await runTool(use.name, use.input, {
                tier,
                onPicks: (picks) => {
                  answered = true;
                  send({ type: "picks", picks });
                },
              });
              return {
                type: "tool_result",
                tool_use_id: use.id,
                content: outcome.content,
                ...(outcome.isError ? { is_error: true } : {}),
              };
            }),
          );
          messages.push({ role: "user", content: results });

          if (round === MAX_ROUNDS - 2) {
            messages.push({
              role: "user",
              content: "[Context — not from the user] Answer now with what you have; no more lookups.",
            });
          }
        }

        if (!answered) {
          await supabase.rpc("ask_refund");
          send({ type: "error", message: "I couldn't put an answer together. Try asking another way." });
        } else {
          send({ type: "done", used: row.used, limit: paid ? null : limit });
        }
      } catch {
        if (!answered) await supabase.rpc("ask_refund").then(() => undefined, () => undefined);
        send({
          type: "error",
          message: answered
            ? "The answer was cut off. Ask again to finish it."
            : "Ask BetriX is busy right now. Your question wasn't counted. Try again in a moment.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
