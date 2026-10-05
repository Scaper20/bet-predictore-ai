import Anthropic from "@anthropic-ai/sdk";
import { getEntitlement, meets } from "@/lib/entitlements";
import { supabaseServer } from "@/lib/supabase/server";
import { aiEnabled } from "@/lib/ai/analyst";
import { ASK_SYSTEM_PROMPT } from "@/lib/ask/prompt";
import { ASK_TOOLS, runTool, toolStatus, type AskTier } from "@/lib/ask/tools";
import { claimGuest, guestIdentity, guestUsed, refundGuest } from "@/lib/ask/guest";
import {
  ASK_FREE_DAILY,
  ASK_GUEST_TOTAL,
  ASK_PAID_DAILY,
  ASK_VIP_DAILY,
  contextPreamble,
  parseAskRequest,
  type AskEvent,
} from "@/lib/ask/request";

export const dynamic = "force-dynamic";
/** A question can take a few tool rounds; leave room beyond the default. */
export const maxDuration = 60;

/**
 * Claude Sonnet 5.5: half the per-token price of Opus 5.5 ($2 / $10 per
 * million), which roughly halves what each question costs (docs/pricing.md).
 * The work here is chat over numbers the tools compute, which Sonnet handles.
 */
const MODEL = "claude-sonnet-5-5";
/** Tool rounds per question before the assistant must answer with what it has. */
const MAX_ROUNDS = 6;

const NO_STORE = { "Cache-Control": "no-store" };

/** The panel's header line: whether it works here, and the allowance left. */
export async function GET(request: Request) {
  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  let used: number | null = null;
  let setCookie: string | null = null;
  if (entitlement.signedIn) {
    const supabase = await supabaseServer();
    const { data } = await supabase.rpc("ask_used_today");
    used = typeof data === "number" ? data : null;
  } else {
    const guest = guestIdentity(request);
    setCookie = guest.setCookie;
    used = await guestUsed(guest);
  }
  const headers = new Headers(NO_STORE);
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return Response.json(
    {
      enabled: aiEnabled(),
      signedIn: entitlement.signedIn,
      paid,
      used,
      limit: entitlement.signedIn ? (paid ? null : ASK_FREE_DAILY) : ASK_GUEST_TOTAL,
    },
    { headers },
  );
}

/** A JSON error, carrying the guest cookie when this browser just got one. */
function fail(event: Extract<AskEvent, { type: "error" }>, status: number, setCookie?: string | null) {
  const headers = new Headers(NO_STORE);
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return Response.json(event, { status, headers });
}

/**
 * One question, answered as a stream of newline-delimited JSON events
 * (AskEvent): text deltas as they're written, a status line while tools
 * run, pick cards from show_picks, then done.
 *
 * Allowances are claimed in the database before the model is called and
 * handed back if no answer arrives: accounts get a daily allowance by tier,
 * visitors without one get ASK_GUEST_TOTAL questions per browser (lib/ask/guest.ts).
 */
export async function POST(request: Request) {
  if (!aiEnabled()) {
    return fail({ type: "error", code: "unavailable", message: "Ask BetriX isn't available right now." }, 503);
  }

  const parsed = parseAskRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") return fail({ type: "error", message: parsed }, 400);

  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  const tier: AskTier = paid ? "paid" : "free";
  const unavailable = { type: "error", code: "unavailable", message: "Ask BetriX isn't available right now. Try again shortly." } as const;

  let used: number;
  let limit: number | null;
  let refund: () => Promise<void>;
  let setCookie: string | null = null;

  if (entitlement.signedIn) {
    limit = meets(entitlement.tier, "vip") ? ASK_VIP_DAILY : paid ? ASK_PAID_DAILY : ASK_FREE_DAILY;
    const supabase = await supabaseServer();
    const { data: claim, error: claimError } = await supabase.rpc("ask_claim", { p_limit: limit });
    const row = Array.isArray(claim) ? (claim[0] as { allowed: boolean; used: number } | undefined) : undefined;
    if (claimError || !row) return fail(unavailable, 503);
    if (!row.allowed) {
      return fail(
        {
          type: "error",
          code: "limit",
          message: paid
            ? "You've hit today's fair-use limit. Ask again tomorrow."
            : `That's your ${ASK_FREE_DAILY} free questions for today. A Pass or higher makes it unlimited.`,
        },
        429,
      );
    }
    used = row.used;
    refund = async () => {
      await supabase.rpc("ask_refund").then(
        () => undefined,
        () => undefined,
      );
    };
    // Paid plans are advertised as unlimited; the fair-use cap isn't shown.
    if (paid) limit = null;
  } else {
    const guest = guestIdentity(request);
    setCookie = guest.setCookie;
    const claim = await claimGuest(guest);
    if (!claim) return fail(unavailable, 503, setCookie);
    if (!claim.allowed) {
      return fail(
        {
          type: "error",
          code: "guest_limit",
          message: `That's your ${ASK_GUEST_TOTAL} free questions. Create a free account to keep asking — ${ASK_FREE_DAILY} a day.`,
        },
        429,
        setCookie,
      );
    }
    used = claim.used;
    limit = ASK_GUEST_TOTAL;
    refund = () => refundGuest(guest);
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
              // Chat over numbers the tools already computed; medium (Sonnet
              // 5.5's recommended start for multistep tool use) keeps the tool
              // choices careful without slow, long turns.
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
          await refund();
          send({ type: "error", message: "I couldn't put an answer together. Try asking another way." });
        } else {
          send({ type: "done", used, limit });
        }
      } catch {
        if (!answered) await refund();
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

  const headers = new Headers({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(stream, { headers });
}
