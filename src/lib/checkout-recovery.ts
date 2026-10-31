import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { unfinishedCheckoutEmail } from "@/lib/email-templates";

/**
 * A follow-up email for people who opened checkout and left.
 *
 * Most unpaid checkouts carry no error from the payment provider at all:
 * the person reached the payment page and closed it. One plain reminder
 * the next day brings some of them back, and costs nothing.
 *
 * Rules, all of them conservative:
 *  - only attempts between MIN_AGE and the lookback, so a checkout still in
 *    progress is never chased;
 *  - never anyone who paid since, or who has a live paid plan;
 *  - at most one reminder per person in REMIND_EVERY_DAYS (checkout_reminders,
 *    migration 0056), whatever plan they tried.
 *
 * Run daily from the expire-pending-payments cron, after stale checkouts are
 * marked failed.
 */

const MIN_AGE_HOURS = 2;
const REMIND_EVERY_DAYS = 30;
/** Resend's default limit is 2 requests a second. */
const PACE_MS = 550;

export interface ReminderRun {
  candidates: number;
  sent: number;
}

export async function sendCheckoutReminders(lookbackHours = 48, now = new Date()): Promise<ReminderRun> {
  const admin = supabaseAdmin();
  const from = new Date(now.getTime() - lookbackHours * 3600_000).toISOString();
  const to = new Date(now.getTime() - MIN_AGE_HOURS * 3600_000).toISOString();

  const { data: attempts, error } = await admin
    .from("payments")
    .select("user_id, plan, provider, created_at")
    .in("status", ["pending", "failed"])
    .gte("created_at", from)
    .lte("created_at", to)
    .not("user_id", "is", null)
    // A missed offer isn't chased with a plan email; the offer itself is still there while it lasts.
    .not("plan", "like", "offer:%")
    .order("created_at", { ascending: false });
  if (error || !attempts?.length) return { candidates: 0, sent: 0 };

  // Latest attempt per person decides the plan named in the email.
  const latest = new Map<string, { plan: string; provider: string; at: string }>();
  for (const a of attempts) {
    if (!latest.has(a.user_id)) latest.set(a.user_id, { plan: a.plan, provider: a.provider, at: a.created_at });
  }
  const ids = [...latest.keys()];

  const [{ data: paid }, { data: subs }, { data: reminded }] = await Promise.all([
    admin.from("payments").select("user_id, created_at").eq("status", "success").in("user_id", ids),
    admin.from("subscriptions").select("user_id, tier, status, current_period_end").in("user_id", ids),
    admin
      .from("checkout_reminders")
      .select("user_id, sent_at")
      .in("user_id", ids)
      .gte("sent_at", new Date(now.getTime() - REMIND_EVERY_DAYS * 86_400_000).toISOString()),
  ]);

  const skip = new Set<string>((reminded ?? []).map((r) => r.user_id));
  for (const p of paid ?? []) {
    if (p.created_at >= (latest.get(p.user_id)?.at ?? "")) skip.add(p.user_id);
  }
  for (const s of subs ?? []) {
    const live =
      (s.tier === "pro" || s.tier === "vip") &&
      s.status !== "none" &&
      (!s.current_period_end || Date.parse(s.current_period_end) > now.getTime());
    if (live) skip.add(s.user_id);
  }

  let sent = 0;
  const due = ids.filter((id) => !skip.has(id));
  for (const id of due) {
    const attempt = latest.get(id)!;
    const tier = attempt.plan.startsWith("vip") ? "vip" : "pro";
    const { data: user } = await admin.auth.admin.getUserById(id).catch(() => ({ data: { user: null } }));
    const email = user?.user?.email;
    if (!email) continue;

    // Recorded first, so a crash mid-run can never send the same person two.
    const { error: markError } = await admin
      .from("checkout_reminders")
      .upsert({ user_id: id, plan: attempt.plan, sent_at: now.toISOString() }, { onConflict: "user_id" });
    if (markError) continue;

    await sendEmail({ to: email, ...unfinishedCheckoutEmail({ tier, nigeria: attempt.provider === "paystack" }) });
    sent++;
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  return { candidates: due.length, sent };
}
