import Anthropic from "@anthropic-ai/sdk";
import { getEntitlement, meets } from "@/lib/entitlements";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { aiEnabled, askApiKey } from "@/lib/ai/enabled";
import { ASK_PAUSED, ASK_PAUSED_MESSAGE } from "@/lib/ask/status";
import { APP_TIMEZONE } from "@/lib/format";
import type { AskTier } from "@/lib/ask/tools";
import { claimGuest, guestIdentity, guestUsed, refundGuest } from "@/lib/ask/guest";
import { viewerForTier } from "@/lib/viewer";
import { askConfig, type AskPlan } from "@/lib/ask/config";
import { runAsk, type AskRunResult } from "@/lib/ask/engine";
import { checkAlerts, logQuestion, reserveSpend, settleSpend } from "@/lib/ask/ledger";
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
/**
 * A question can take several tool rounds, each a full model turn. Time spent
 * waiting on the model isn't billed as CPU, so a generous ceiling costs
 * nothing and stops a long answer being cut off mid-stream.
 */
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" };

/** Which allowance and spending cap applies: a pass is counted as its own plan. */
function planOf(entitlement: Awaited<ReturnType<typeof getEntitlement>>): AskPlan {
  if (!entitlement.signedIn) return "guest";
  if (entitlement.passOnly || entitlement.tier === "pass") return "pass";
  if (entitlement.tier === "vip") return "vip";
  if (entitlement.tier === "pro") return "pro";
  return "free";
}

/** Questions a day on each plan. A pass gets ASK_PASS_DAILY when set, else its plan's own allowance, as before. */
function dailyLimit(plan: AskPlan, tier: string, passDaily: number | null): number {
  if (plan === "pass") return passDaily ?? (tier === "vip" ? ASK_VIP_DAILY : ASK_PAID_DAILY);
  return plan === "vip" ? ASK_VIP_DAILY : plan === "pro" ? ASK_PAID_DAILY : ASK_FREE_DAILY;
}

/** The panel's header line: whether it works here, and the allowance left. */
export async function GET(request: Request) {
  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  const plan = planOf(entitlement);
  let used: number | null = null;
  let setCookie: string | null = null;
  if (entitlement.userId) {
    const { data } = await supabaseAdmin().rpc("ask_used_today", { p_user: entitlement.userId });
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
      enabled: aiEnabled() && !ASK_PAUSED,
      signedIn: entitlement.signedIn,
      paid,
      used,
      limit: entitlement.signedIn ? dailyLimit(plan, entitlement.tier, askConfig().passDaily) : ASK_GUEST_TOTAL,
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
 * Before the model is called: a question is claimed from the daily allowance
 * (handed back if no answer arrives), and its cost ceiling is reserved against
 * the asker's daily spending cap and Ask's daily budget (lib/ask/ledger.ts).
 * The model and tool rounds run in lib/ask/engine.ts; afterwards the
 * reservation settles to the real cost, the question is logged and the alerts
 * are checked. With ASK_GUARD=observe (the default) the money controls record
 * what they would have stopped without stopping anything.
 */
export async function POST(request: Request) {
  if (ASK_PAUSED) return fail({ type: "error", code: "unavailable", message: ASK_PAUSED_MESSAGE }, 503);
  if (!aiEnabled()) {
    return fail({ type: "error", code: "unavailable", message: "Ask KiqStat isn't available right now." }, 503);
  }

  const parsed = parseAskRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") return fail({ type: "error", message: parsed }, 400);

  const config = askConfig();
  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  const plan = planOf(entitlement);
  const tier: AskTier = paid ? "paid" : "free";
  const viewer = await viewerForTier(entitlement.tier);
  const unavailable = { type: "error", code: "unavailable", message: "Ask KiqStat isn't available right now. Try again shortly." } as const;

  let used: number;
  let limit: number | null;
  let refund: () => Promise<void>;
  let setCookie: string | null = null;
  let subject: string;

  if (entitlement.userId) {
    const userId = entitlement.userId;
    subject = `user:${userId}`;
    limit = dailyLimit(plan, entitlement.tier, config.passDaily);
    const supabase = supabaseAdmin();
    const { data: claim, error: claimError } = await supabase.rpc("ask_claim", { p_user: userId, p_limit: limit });
    const row = Array.isArray(claim) ? (claim[0] as { allowed: boolean; used: number } | undefined) : undefined;
    if (claimError || !row) return fail(unavailable, 503);
    if (!row.allowed) {
      return fail(
        {
          type: "error",
          code: "limit",
          message: paid
            ? `That's your ${limit} questions for today. They reset at midnight, Lagos time.`
            : `That's your ${ASK_FREE_DAILY} free questions for today. Pro gives you ${ASK_PAID_DAILY} a day.`,
        },
        429,
      );
    }
    used = row.used;
    refund = async () => {
      await supabase.rpc("ask_refund", { p_user: userId }).then(
        () => undefined,
        () => undefined,
      );
    };
  } else {
    const guest = guestIdentity(request);
    setCookie = guest.setCookie;
    subject = `guest:${guest.deviceKey.slice(0, 40)}`;
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

  // Money: reserve this question's ceiling before any model call.
  const reserved = config.guard === "off" ? null : await reserveSpend(subject, plan, config);
  if (reserved && !reserved.ok) {
    await refund();
    void logQuestion({
      userId: entitlement.userId,
      guest: !entitlement.signedIn,
      plan,
      source: "live",
      config,
      result: null,
      blocked: true,
      guard: `blocked:${reserved.over ?? "books"}`,
      questionChars: parsed.turns.at(-1)?.text.length ?? 0,
    });
    void checkAlerts({ result: null, config, globalSpentAfter: null, blockedBy: reserved.over });
    return fail(
      reserved.over === "subject"
        ? { type: "error", code: "limit", message: "You've used today's Ask KiqStat allowance. It resets at midnight, Lagos time." }
        : unavailable,
      reserved.over === "subject" ? 429 : 503,
      setCookie,
    );
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = parsed.turns.map((t, i) =>
    i === parsed.turns.length - 1
      ? { role: "user", content: `${contextPreamble(parsed.context, new Date())}\n\n${t.text}` }
      : { role: t.role, content: t.text },
  );

  const encoder = new TextEncoder();
  const client = new Anthropic({ apiKey: askApiKey() });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; the engine notices via the abort signal.
        }
      };

      let result: AskRunResult | null = null;
      try {
        result = await runAsk({
          client,
          config,
          messages,
          toolContext: { tier, viewer, timeZone: parsed.context.timeZone ?? APP_TIMEZONE },
          emit: send,
          signal: request.signal,
          // Enforcing, the question runs under what its reservation was granted
          // (less than the full ceiling near the end of a day).
          ceilingMicros: config.guard === "off" ? null : config.guard === "enforce" && reserved ? reserved.grantedMicros : config.requestCeilingMicros,
          enforce: config.guard === "enforce",
        });

        if (result.outcome === "error") {
          // The user sees a plain line; the log says what failed (bad key, no credit, rate limit) without echoing anything secret.
          console.error("ask: failed", result.error);
        }
        if (!result.answered) {
          // The allowance is handed back; the money it cost is still booked below.
          await refund();
          send({
            type: "error",
            ...(result.billing ? { code: "unavailable" as const } : {}),
            message: result.billing
              ? "Ask KiqStat is unavailable right now. Your question wasn't counted."
              : result.outcome === "budget_stop"
                ? "That question needed more lookups than one question allows. Try one match at a time. It wasn't counted."
                : result.outcome === "error"
                  ? "Ask KiqStat is busy right now. Your question wasn't counted. Try again in a moment."
                  : "I couldn't put an answer together. Try asking another way.",
          });
        } else if (result.outcome === "error" || result.outcome === "aborted") {
          send({ type: "error", message: "The answer was cut off. Ask again to finish it." });
        } else {
          send({ type: "done", used, limit });
        }
      } finally {
        const actual = result?.costMicros ?? 0;
        const globalSpentAfter = reserved ? await settleSpend(reserved.reservation, actual) : null;
        await logQuestion({
          userId: entitlement.userId,
          guest: !entitlement.signedIn,
          plan,
          source: "live",
          config,
          result,
          guard: [config.guard, reserved?.over ? `over:${reserved.over}` : null, result?.wouldStop ? "would_stop" : null].filter(Boolean).join(","),
          questionChars: parsed.turns.at(-1)?.text.length ?? 0,
        });
        await checkAlerts({ result, config, globalSpentAfter, blockedBy: null });
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
