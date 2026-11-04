import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { cycleOfPlan, lagosDay, passCapMicros, passQuestions, type AskConfig, type AskPlan } from "@/lib/ask/config";
import { dailyBucket, type SpendBucket } from "@/lib/ask/ledger";

/**
 * Which bucket a question's money comes out of, and for a pass, how many
 * questions it allows over its whole window.
 *
 *   guest, free    the account's (or browser's) day, at its plan's cap
 *   pro, vip       the account's day, at the cap for the billing cycle of
 *                  its latest payment (a yearly day is worth less)
 *   pass           the pass itself: one bucket for its whole window, at its
 *                  offer's cap (offers.ask_cap_usd, 0089) or a share of what
 *                  was paid
 *
 * Lookups that fail fall back to the plan's daily cap: the global budget and
 * the request ceiling still hold, and a pass never gets more than that day.
 */
export interface AskBucket {
  bucket: SpendBucket;
  /** For a pass: questions allowed over the whole pass, and since when they count. */
  pass: { id: string; limit: number; since: string; until: string } | null;
}

export async function askBucketFor(input: { plan: AskPlan; subject: string; userId: string | null; config: AskConfig }): Promise<AskBucket> {
  const { plan, subject, userId, config } = input;
  const fallback: AskBucket = { bucket: dailyBucket(subject, config.dailyCapMicros[plan]), pass: null };
  if (!userId || plan === "guest" || plan === "free") return fallback;
  const admin = supabaseAdmin();

  if (plan === "pass") {
    const now = new Date().toISOString();
    const { data: pass } = await admin
      .from("passes")
      .select("id, offer_id, starts_at, expires_at, amount_kobo")
      .eq("user_id", userId)
      .lte("starts_at", now)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    if (!pass) return fallback;
    let offerCap: number | null = null;
    if (pass.offer_id) {
      const { data: offer } = await admin
        .from("offers")
        .select("ask_cap_usd")
        .eq("id", pass.offer_id)
        .maybeSingle()
        .then((r) => r, () => ({ data: null }));
      offerCap = offer?.ask_cap_usd === null || offer?.ask_cap_usd === undefined ? null : Number(offer.ask_cap_usd);
    }
    const starts = String(pass.starts_at);
    const hours = (Date.parse(String(pass.expires_at)) - Date.parse(starts)) / 3_600_000;
    return {
      bucket: { key: `pass:${pass.id}`, capMicros: passCapMicros(config, offerCap, Number(pass.amount_kobo)), day: lagosDay(starts) },
      pass: { id: String(pass.id), limit: passQuestions(config, hours), since: starts, until: String(pass.expires_at) },
    };
  }

  const { data: payment } = await admin
    .from("payments")
    .select("plan")
    .eq("user_id", userId)
    .eq("status", "success")
    .like("plan", `${plan}:%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  return { bucket: dailyBucket(subject, config.cycleCapMicros[plan][cycleOfPlan(payment?.plan as string | undefined)]), pass: null };
}

/** Questions a pass has used: every question logged since it started that wasn't handed back. */
export async function passQuestionsUsed(userId: string, since: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from("ask_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "live")
    .in("outcome", ["answered", "aborted"])
    .gte("created_at", since)
    .then((r) => r, () => ({ count: null }));
  return count ?? 0;
}
