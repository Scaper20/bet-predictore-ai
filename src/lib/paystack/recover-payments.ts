import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { verifyTransaction } from "@/lib/paystack/client";
import { grantPaystackOnce, isOncePlan, type OnceOutcome } from "@/lib/paystack/once";
import { grantPass } from "@/lib/offers-server";
import { isOfferPlan } from "@/lib/offers";

/**
 * Asks Paystack about every checkout we never heard back on, before it is
 * written off (CTO review, 4 Nov 2026).
 *
 * From 10 Oct 2026 Paystack's webhooks stopped reaching us: every address but
 * www.kiqstat.app answers with a redirect, and Paystack does not follow one.
 * The only confirmation left was the page the customer returns to after
 * paying. Anyone who closed the tab first stayed "pending", and the daily
 * sweep then marked them "failed" without asking Paystack.
 *
 * This runs before that sweep. For each Paystack checkout still pending or
 * written off unread (no Paystack record stored on the row) in the last
 * LOOKBACK_DAYS:
 *   - pay-once Pro/VIP and passes: grantPaystackOnce / grantPass, which
 *     re-read the transaction from Paystack and grant at most once;
 *   - card-plan first charges: read from Paystack and, if paid, reported for a
 *     person to set up (their subscription comes from subscription.create);
 *   - anything Paystack calls abandoned past a day, or failed, is recorded as
 *     failed with Paystack's answer stored, so it is not asked about again.
 */

const LOOKBACK_DAYS = 45;
const MAX_PER_RUN = 80;
const PACE_MS = 200;

export interface RecoveryRun {
  checked: number;
  granted: { reference: string; plan: string }[];
  cardPaid: { reference: string; plan: string; userId: string }[];
  closed: number;
  errors: number;
}

export async function recoverUnconfirmedPayments(now = new Date()): Promise<RecoveryRun> {
  const admin = supabaseAdmin();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const settled = new Date(now.getTime() - 30 * 60_000).toISOString(); // leave live checkouts alone
  const { data: rows } = await admin
    .from("payments")
    .select("id, user_id, plan, paystack_reference, created_at")
    .eq("provider", "paystack")
    .in("status", ["pending", "failed"])
    .is("raw_event", null)
    .gte("created_at", since)
    .lt("created_at", settled)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  const run: RecoveryRun = { checked: 0, granted: [], cardPaid: [], closed: 0, errors: 0 };
  const dayAgo = now.getTime() - 86_400_000;

  for (const row of rows ?? []) {
    const reference = row.paystack_reference as string;
    const plan = String(row.plan);
    try {
      run.checked++;
      if (isOncePlan(plan) || isOfferPlan(plan)) {
        const outcome: OnceOutcome = isOncePlan(plan) ? await grantPaystackOnce(reference) : await grantPass(reference);
        if (outcome === "granted") run.granted.push({ reference, plan });
        else if (outcome === "pending" && Date.parse(row.created_at as string) < dayAgo) {
          // Paystack says abandoned (or could not be read): write it off, noting that we asked.
          await markClosed(row.id as string, { recovery: "abandoned-or-unreadable", at: now.toISOString() });
          run.closed++;
        } else if (outcome === "failed") run.closed++;
      } else {
        const tx = await verifyTransaction(reference);
        if (tx.status === "success") {
          run.cardPaid.push({ reference, plan, userId: row.user_id as string });
          await admin.from("payments").update({ raw_event: { recovery: "card-paid-needs-review", tx } }).eq("id", row.id);
        } else if (tx.status === "failed" || Date.parse(row.created_at as string) < dayAgo) {
          await markClosed(row.id as string, { recovery: tx.status, tx });
          run.closed++;
        }
      }
    } catch (err) {
      run.errors++;
      console.error("payment recovery failed for", reference, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  if (run.granted.length || run.cardPaid.length) await report(run, now);
  return run;
}

async function markClosed(id: string, rawEvent: Record<string, unknown>) {
  await supabaseAdmin().from("payments").update({ status: "failed", raw_event: rawEvent }).eq("id", id).neq("status", "success");
}

async function report(run: RecoveryRun, now: Date) {
  const to = process.env.ASK_ALERT_EMAIL?.trim() || process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";
  const li = (xs: { reference: string; plan: string }[]) => xs.map((x) => `<li>${x.plan} · ${x.reference}</li>`).join("");
  await sendEmail({
    to,
    idempotencyKey: `payment-recovery:${now.toISOString().slice(0, 13)}`,
    subject: `Payment recovery: ${run.granted.length} granted, ${run.cardPaid.length} card plan(s) to set up`,
    html:
      `<p>Paystack confirmed these payments that we had not recorded.</p>` +
      (run.granted.length ? `<p><b>Granted now</b> (pay-once plans and passes):</p><ul>${li(run.granted)}</ul>` : "") +
      (run.cardPaid.length
        ? `<p><b>Card plans paid but not set up</b>: give access in /admin and check the subscription in Paystack:</p><ul>${li(run.cardPaid)}</ul>`
        : ""),
  });
}
