import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { planEndingEmail } from "@/lib/email-templates";

/**
 * "Your plan ends in a few days", for members who paid once.
 *
 * A pay-once Pro or VIP plan is a prepaid month with nothing renewing, so
 * unlike a card subscription it ends without anyone being asked. One email,
 * REMIND_DAYS before the end, says so plainly and links to renew. Run daily
 * from the expire-pending-payments cron.
 *
 * Who is left out: card subscriptions (Paystack bills and tells them),
 * cancelled plans (they chose to stop), gifts and anyone with no email. A
 * reminder is recorded before it is sent (renewal_reminders, 0097), so a crash
 * can never send the same person two, and removed again if the send fails so
 * tomorrow's run tries once more.
 */

export const REMIND_DAYS = 3;
/** Providers whose plans do not renew themselves. */
const PREPAID = new Set(["paystack_once", "flutterwave"]);
const PACE_MS = 300;

export interface SubRow {
  user_id: string;
  tier: string;
  status: string;
  provider: string | null;
  current_period_end: string | null;
}

export interface Reminder {
  userId: string;
  tier: "pro" | "vip";
  periodEnd: string;
  /** Paystack pay-once members can switch to card auto-renew; Flutterwave members can't. */
  canAutoRenew: boolean;
}

/** Which subscriptions are due a reminder now. Pure, so it can be tested without a database. */
export function dueReminders(subs: readonly SubRow[], now = new Date(), days = REMIND_DAYS): Reminder[] {
  const from = now.getTime();
  const to = from + days * 86_400_000;
  return subs.flatMap((s) => {
    if (s.tier !== "pro" && s.tier !== "vip") return [];
    if (s.status !== "active") return [];
    if (!s.provider || !PREPAID.has(s.provider)) return [];
    const end = s.current_period_end ? Date.parse(s.current_period_end) : NaN;
    if (!Number.isFinite(end) || end <= from || end > to) return [];
    return [{ userId: s.user_id, tier: s.tier, periodEnd: new Date(end).toISOString(), canAutoRenew: s.provider === "paystack_once" }];
  });
}

export interface RenewalRun {
  candidates: number;
  sent: number;
}

export async function sendRenewalReminders(now = new Date()): Promise<RenewalRun> {
  const admin = supabaseAdmin();
  const horizon = new Date(now.getTime() + REMIND_DAYS * 86_400_000).toISOString();
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, tier, status, provider, current_period_end")
    .in("tier", ["pro", "vip"])
    .eq("status", "active")
    .in("provider", [...PREPAID])
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", horizon);
  if (error || !subs?.length) return { candidates: 0, sent: 0 };

  const due = dueReminders(subs as SubRow[], now);
  if (due.length === 0) return { candidates: 0, sent: 0 };

  const { data: profiles } = await admin.from("profiles").select("id, email").in("id", due.map((d) => d.userId));
  const emailOf = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  let sent = 0;
  for (const r of due) {
    const email = emailOf.get(r.userId);
    if (!email) continue;

    // Recorded first; a row that already exists means this period was handled.
    const { data: claimed, error: claimError } = await admin
      .from("renewal_reminders")
      .upsert({ user_id: r.userId, period_end: r.periodEnd, tier: r.tier }, { onConflict: "user_id,period_end", ignoreDuplicates: true })
      .select("user_id");
    if (claimError || !claimed?.length) continue;

    const result = await sendEmail({
      to: email,
      idempotencyKey: `renewal:${r.userId}:${r.periodEnd}`,
      ...planEndingEmail({ tier: r.tier, endsAt: r.periodEnd, canAutoRenew: r.canAutoRenew }),
    });
    if (result.ok) sent++;
    else await admin.from("renewal_reminders").delete().eq("user_id", r.userId).eq("period_end", r.periodEnd);
    await new Promise((res) => setTimeout(res, PACE_MS));
  }
  return { candidates: due.length, sent };
}
