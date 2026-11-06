import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { fetchSubscription, listReversedCharges, listSuccessfulCharges, type PaystackCharge } from "@/lib/paystack/client";
import { tierFromPlanCode } from "@/lib/paystack/plan-codes";
import { cycleFromInterval, renewedPeriodEnd } from "@/lib/paystack/renewal";
import { recordCommission } from "@/lib/partner-commission";
import { classifySubscription, type SubscriptionFinding } from "@/lib/paystack/subscription-classify";

/**
 * Daily check of every Paystack card subscription against Paystack itself
 * (CTO review, 4 Nov 2026, item 1.5).
 *
 * The webhook is the only way a renewal reaches us, and its renewal fields
 * were never checked against a live payload. In October a VIP member's period
 * ended on 24 Oct with no renewal recorded and no alert. This check closes
 * that gap from the other side: it asks Paystack, once a day, what it holds.
 *
 * It changes data in two cases only, both backed by Paystack's own records:
 *   - a successful renewal charge we never recorded: the payment is stored,
 *     the paid-through date moves on one cycle and the partner commission is
 *     booked, exactly as the webhook would have;
 *   - Paystack has ended the subscription and our paid period is over: our row
 *     is marked cancelled, so reports stop counting it as active.
 * Everything else is reported to the support inbox. Set
 * PAYSTACK_SUB_CHECK=report to change nothing and only report.
 */

const PACE_MS = 250;

export interface SubscriptionCheckRun {
  checked: number;
  healed: number;
  tidied: number;
  findings: SubscriptionFinding[];
  errors: number;
}

export async function checkPaystackSubscriptions(now = new Date()): Promise<SubscriptionCheckRun> {
  const admin = supabaseAdmin();
  const heal = process.env.PAYSTACK_SUB_CHECK?.trim() !== "report";
  const { data: subs } = await admin
    .from("subscriptions")
    .select("user_id, tier, status, current_period_end, paystack_subscription_code")
    .not("paystack_subscription_code", "is", null)
    .in("tier", ["pro", "vip"]);

  const run: SubscriptionCheckRun = { checked: 0, healed: 0, tidied: 0, findings: [], errors: 0 };

  for (const sub of subs ?? []) {
    try {
      const ps = await fetchSubscription(sub.paystack_subscription_code as string);
      const end = sub.current_period_end ? new Date(sub.current_period_end as string) : null;
      // Look back to a week before our period end, so a renewal charged on the day is caught.
      const from = new Date((end ?? now).getTime() - 7 * 86_400_000).toISOString();
      const charges = ps.customer?.id ? await listSuccessfulCharges(ps.customer.id, from) : [];
      // Only worth asking when our period is over and no renewal came through: a reversed charge explains why.
      const lapsed = !end || end.getTime() < now.getTime();
      const reversed = lapsed && !charges.length && ps.customer?.id ? await listReversedCharges(ps.customer.id, from).catch(() => []) : [];
      const refs = charges.map((c) => c.reference);
      const { data: known } = refs.length
        ? await admin.from("payments").select("paystack_reference").in("paystack_reference", refs)
        : { data: [] as { paystack_reference: string }[] };

      const finding = classifySubscription({
        ours: { userId: sub.user_id as string, tier: sub.tier as string, status: sub.status as string, periodEnd: end },
        paystack: { status: ps.status, nextPaymentDate: ps.next_payment_date, planAmount: ps.plan?.amount ?? null },
        charges,
        reversed,
        knownReferences: new Set((known ?? []).map((k) => k.paystack_reference as string)),
        now,
      });
      run.checked++;
      if (finding.kind === "ok") continue;

      if (heal && finding.kind === "missed_renewal") {
        const healed = await recordMissedRenewals(sub.user_id as string, end, finding.unseen, ps.plan?.plan_code, ps.plan?.interval, now);
        run.healed += healed;
        finding.action = `recorded ${healed} renewal charge(s) and extended the plan`;
      } else if (heal && finding.kind === "ended") {
        await admin.from("subscriptions").update({ status: "cancelled", updated_at: now.toISOString() }).eq("user_id", sub.user_id);
        run.tidied++;
        finding.action = "marked cancelled to match Paystack";
      }
      run.findings.push(finding);
    } catch (err) {
      run.errors++;
      console.error("paystack subscription check failed for", sub.user_id, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  if (run.findings.length || run.errors) await reportFindings(run, now);
  return run;
}

async function recordMissedRenewals(
  userId: string,
  currentEnd: Date | null,
  charges: PaystackCharge[],
  planCode: string | undefined,
  interval: string | undefined,
  now: Date,
): Promise<number> {
  const admin = supabaseAdmin();
  const tier = tierFromPlanCode(planCode);
  const cycle = cycleFromInterval(interval);
  if (!tier || !cycle) return 0; // An unknown plan: report only, never guess a period.

  let end = currentEnd;
  let recorded = 0;
  // Oldest first, so each charge extends from the period before it.
  for (const c of [...charges].sort((a, b) => Date.parse(a.paid_at ?? "") - Date.parse(b.paid_at ?? ""))) {
    const paidAt = c.paid_at ? new Date(c.paid_at) : now;
    const { error } = await admin.from("payments").insert({
      user_id: userId,
      paystack_reference: c.reference,
      amount_kobo: c.amount,
      plan: `${tier}:${cycle}`,
      status: "success",
      provider: "paystack",
      raw_event: { source: "subscription-check", charge: c },
    });
    if (error) continue; // Unique reference: the webhook got there first.
    end = renewedPeriodEnd(end, paidAt, cycle);
    recorded++;
    await recordCommission({
      userId,
      reference: c.reference,
      provider: "paystack",
      currency: c.currency ?? "NGN",
      grossMinor: c.amount,
      feeMinor: typeof c.fees === "number" ? c.fees : null,
      paidAt,
    });
  }
  if (recorded && end) {
    await admin
      .from("subscriptions")
      .update({ status: "active", current_period_end: end.toISOString(), updated_at: now.toISOString() })
      .eq("user_id", userId);
  }
  return recorded;
}

async function reportFindings(run: SubscriptionCheckRun, now: Date) {
  const to = process.env.ASK_ALERT_EMAIL?.trim() || process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";
  const day = now.toISOString().slice(0, 10);
  const rows = run.findings
    .map((f) => `<li><b>${f.kind}</b> · user ${f.userId} · ${escapeHtml(f.detail)}${f.action ? ` · <i>${f.action}</i>` : ""}</li>`)
    .join("");
  await sendEmail({
    to,
    idempotencyKey: `paystack-sub-check:${day}`,
    subject: `Paystack subscription check: ${run.findings.length} to look at${run.errors ? `, ${run.errors} errors` : ""}`,
    html: `<p>Checked ${run.checked} card subscriptions against Paystack on ${day}.</p><ul>${rows}</ul>${
      run.errors ? `<p>${run.errors} could not be read from Paystack; see the function logs.</p>` : ""
    }`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
