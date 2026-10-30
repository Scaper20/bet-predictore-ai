import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { microsToUsd } from "@/lib/ask/cost";
import type { AskConfig, AskPlan } from "@/lib/ask/config";
import { minQuestionMicros, type AskRunResult } from "@/lib/ask/engine";

/**
 * Ask KiqStat's books (tables from 0088): money reserved and spent per day,
 * every question and model call logged with what it cost, and the alerts.
 *
 * Spend works like a card hold. Before the first model call a question
 * reserves its ceiling (or what is left under the cap, if that still covers
 * a short answer) against the account's daily cap and Ask's daily budget, in
 * one locked database statement each, and then runs under what it was
 * granted. Afterwards it settles to what it really cost, whether it was
 * answered, cancelled, retried or failed. So any number of parallel requests
 * can at most use what is left under the cap, and cancelling a question
 * still books what it cost.
 */

export interface Reservation {
  holds: { key: string; day: string; amount: number }[];
}

export interface ReserveResult {
  /** False only when enforcing and a cap would be passed. */
  ok: boolean;
  /** Which cap stopped it (enforcing) or would have (observing). */
  over: "subject" | "budget" | null;
  reservation: Reservation;
  /** What this question may cost: its ceiling, or less near the end of a day. */
  grantedMicros: number;
  /** Ask's spend today before this question, for the budget alerts. */
  globalSpent: number;
}

/**
 * Whose money a question spends: an account's (or browser's) day, or a
 * pass's whole window. `day` pins the booking to one date, which is how a
 * pass is booked (the Lagos date it started), so its cap covers the pass
 * however many midnights it crosses; without it the day is today in Lagos.
 */
export interface SpendBucket {
  key: string;
  capMicros: number;
  day?: string;
}

/** An account's or browser's daily bucket. */
export function dailyBucket(key: string, capMicros: number): SpendBucket {
  return { key, capMicros };
}

type Row = { allowed: boolean; granted: number; spent: number; reserved: number; spend_day: string };

async function hold(key: string, amount: number, min: number, cap: number, enforce: boolean, day?: string): Promise<Row | null> {
  const args = { p_key: key, p_amount: amount, p_min: min, p_cap: cap, p_enforce: enforce };
  const { data, error } = day
    ? await supabaseAdmin().rpc("ask_spend_reserve_on", { ...args, p_day: day })
    : await supabaseAdmin().rpc("ask_spend_reserve", args);
  const row = Array.isArray(data) ? (data[0] as Row | undefined) : undefined;
  return error || !row ? null : { ...row, granted: Number(row.granted), spent: Number(row.spent), reserved: Number(row.reserved) };
}

/**
 * Reserves one question's ceiling against Ask's daily budget, then the
 * asker's bucket (a daily cap, or a pass's whole-window cap). Observing, it reserves regardless and reports which cap
 * would have stopped it. If the books can't be reached it lets the question
 * through when observing and stops it when enforcing: a broken meter must not
 * mean unmetered spend.
 */
export async function reserveSpend(bucket: SpendBucket, config: AskConfig): Promise<ReserveResult> {
  const enforce = config.guard === "enforce";
  const amount = config.requestCeilingMicros;
  const min = Math.min(amount, minQuestionMicros(config.model));
  const holds: Reservation["holds"] = [];
  const refused = (over: ReserveResult["over"], globalSpent: number): ReserveResult => ({
    ok: false,
    over,
    reservation: { holds: [] },
    grantedMicros: 0,
    globalSpent,
  });
  try {
    const global = await hold("global", amount, min, config.dailyBudgetMicros, enforce);
    if (!global) return enforce ? refused(null, 0) : { ok: true, over: null, reservation: { holds }, grantedMicros: amount, globalSpent: 0 };
    if (enforce && global.granted === 0) return refused("budget", global.spent);
    holds.push({ key: "global", day: global.spend_day, amount: global.granted });

    const own = await hold(bucket.key, global.granted, Math.min(min, global.granted), bucket.capMicros, enforce, bucket.day);
    if (!own) {
      if (enforce) {
        await settleSpend({ holds }, 0);
        return refused(null, global.spent);
      }
      return { ok: true, over: global.allowed ? null : "budget", reservation: { holds }, grantedMicros: global.granted, globalSpent: global.spent };
    }
    if (enforce && own.granted === 0) {
      await settleSpend({ holds }, 0);
      return refused("subject", global.spent);
    }
    // The account's cap granted less than the budget: give the difference back.
    if (own.granted < global.granted) {
      await settleSpend({ holds: [{ ...holds[0], amount: global.granted - own.granted }] }, 0);
      holds[0] = { ...holds[0], amount: own.granted };
    }
    holds.push({ key: bucket.key, day: own.spend_day, amount: own.granted });
    const over = !global.allowed ? "budget" : !own.allowed ? "subject" : null;
    return { ok: true, over, reservation: { holds }, grantedMicros: own.granted, globalSpent: global.spent };
  } catch {
    if (holds.length) await settleSpend({ holds }, 0);
    return enforce ? refused(null, 0) : { ok: true, over: null, reservation: { holds: [] }, grantedMicros: amount, globalSpent: 0 };
  }
}

/** Releases the holds and books what the question cost against each. Returns Ask's spend today after it. */
export async function settleSpend(reservation: Reservation, actualMicros: number): Promise<number | null> {
  let global: number | null = null;
  await Promise.all(
    reservation.holds.map(async (h) => {
      const { data } = await supabaseAdmin()
        .rpc("ask_spend_settle", { p_key: h.key, p_day: h.day, p_reserved: h.amount, p_actual: actualMicros })
        .then((r) => r, () => ({ data: null }));
      if (h.key === "global" && data !== null && data !== undefined) global = Number(data);
    }),
  );
  return global;
}

/* --------------------------------------------------------------- logging */

export interface QuestionLog {
  userId: string | null;
  guest: boolean;
  plan: AskPlan;
  source: "live" | "bench";
  config: AskConfig;
  result: AskRunResult | null;
  /** Set when the question never reached the model (a cap stopped it). */
  blocked?: boolean;
  guard: string | null;
  questionChars: number;
}

/** Logs one question and its calls. Best effort: a logging failure never touches the answer. Returns the row id. */
export async function logQuestion(q: QuestionLog): Promise<string | null> {
  try {
    const r = q.result;
    const sum = (f: (c: AskRunResult["calls"][number]) => number) => (r ? r.calls.reduce((s, c) => s + f(c), 0) : 0);
    const { data, error } = await supabaseAdmin()
      .from("ask_questions")
      .insert({
        finished_at: new Date().toISOString(),
        user_id: q.userId,
        guest: q.guest,
        tier: q.plan,
        source: q.source,
        config_label: q.config.label,
        calls: r?.calls.length ?? 0,
        input_tokens: sum((c) => c.input),
        cache_write_tokens: sum((c) => c.cacheWrite),
        cache_read_tokens: sum((c) => c.cacheRead),
        output_tokens: sum((c) => c.output),
        cost_micros: r?.costMicros ?? 0,
        outcome: q.blocked ? "blocked" : (r?.outcome ?? "error"),
        guard: q.guard,
        ms: r?.ms ?? 0,
        question_chars: q.questionChars,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    const id = data.id as string;
    if (r?.calls.length) {
      await supabaseAdmin()
        .from("ask_calls")
        .insert(
          r.calls.map((c) => ({
            question_id: id,
            round: c.round,
            kind: c.kind,
            model: c.model,
            input_tokens: c.input,
            cache_write_tokens: c.cacheWrite,
            cache_read_tokens: c.cacheRead,
            output_tokens: c.output,
            cost_micros: c.costMicros,
            stop_reason: c.stopReason,
            aborted: c.aborted,
            error: c.error,
            ms: c.ms,
          })),
        );
    }
    return id;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- alerts */

const ALERT_TO = () => process.env.ASK_ALERT_EMAIL?.trim() || process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";

/** Sends an alert unless the same one went out within `everyMs`. */
async function alertOnce(key: string, everyMs: number, subject: string, lines: string[]): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const cutoff = new Date(Date.now() - everyMs).toISOString();
    const { data: claimed } = await admin.from("ask_alerts").update({ sent_at: new Date().toISOString() }).eq("key", key).lt("sent_at", cutoff).select("key");
    if (!claimed?.length) {
      const { error } = await admin.from("ask_alerts").insert({ key });
      if (error) return; // sent recently (the row exists and is fresh)
    }
    await sendEmail({
      to: ALERT_TO(),
      subject: `[Ask KiqStat] ${subject}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`,
    });
  } catch {
    // Alerts are best effort.
  }
}

const HOUR = 3_600_000;

/**
 * After each question: a billing failure (out of credit, key refused), a run
 * of failures, or Ask's daily spend passing 50%, 80% and 100% of its budget.
 */
export async function checkAlerts(input: {
  result: AskRunResult | null;
  config: AskConfig;
  globalSpentAfter: number | null;
  blockedBy: "subject" | "budget" | null;
}): Promise<void> {
  const { result, config } = input;
  if (result?.billing) {
    await alertOnce("billing", HOUR, "Anthropic refused the request: credit or key", [
      "Ask KiqStat's last question failed because Anthropic refused the request for billing or authentication.",
      `Error: ${result.error ?? "unknown"}`,
      "Users see “Ask KiqStat is unavailable” and their question isn't counted. Top up or check the key in the Anthropic console.",
    ]);
  } else if (result?.outcome === "error") {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await supabaseAdmin()
      .from("ask_questions")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "error")
      .gte("created_at", since)
      .then((r) => r, () => ({ count: 0 }));
    if ((count ?? 0) >= 5) {
      await alertOnce("errors", HOUR, `${count} questions failed in 15 minutes`, [
        `${count} Ask KiqStat questions failed in the last 15 minutes.`,
        `Last error: ${result.error ?? "unknown"}`,
      ]);
    }
  }

  const spent = input.globalSpentAfter;
  if (spent !== null && config.dailyBudgetMicros > 0) {
    const share = spent / config.dailyBudgetMicros;
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    for (const pct of [100, 80, 50]) {
      if (share * 100 >= pct) {
        await alertOnce(`budget:${pct}:${day}`, 24 * HOUR, `Daily AI budget ${pct}% used`, [
          `Ask KiqStat has spent $${microsToUsd(spent).toFixed(3)} today, ${Math.round(share * 100)}% of its $${microsToUsd(config.dailyBudgetMicros).toFixed(2)} daily budget.`,
          config.guard === "enforce"
            ? pct >= 100
              ? "New questions are paused until midnight, Lagos time."
              : "Questions stop for everyone at 100%."
            : "The guard is observing only, so questions continue past 100%.",
        ]);
        break;
      }
    }
  }
  if (input.blockedBy === "budget" && config.guard === "enforce") {
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    await alertOnce(`budget:blocked:${day}`, 24 * HOUR, "Daily AI budget reached: questions paused", [
      "Ask KiqStat reached its daily budget and is turning questions away until midnight, Lagos time.",
    ]);
  }
}
