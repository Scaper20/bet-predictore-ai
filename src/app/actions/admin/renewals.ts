"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { checkPaystackSubscriptions } from "@/lib/paystack/subscription-check";
import { recoverUnconfirmedPayments } from "@/lib/paystack/recover-payments";

export type CheckPaystackState = { error: string | null; message: string | null; lines: string[] };

/**
 * Manual run of the two daily Paystack checks (api/cron/expire-pending-payments)
 * from /admin/renewals: "I don't want to wait for tomorrow morning". It asks
 * Paystack about every card subscription and every unconfirmed checkout, and
 * records what Paystack confirms and we missed. It never charges or refunds.
 */
export async function checkWithPaystack(_prev: CheckPaystackState): Promise<CheckPaystackState> {
  const gate = await checkPermission("finance.manage");
  if (!gate.ok) return { error: gate.error, message: null, lines: [] };

  try {
    const subs = await checkPaystackSubscriptions();
    const recovery = await recoverUnconfirmedPayments();
    await logAdminAction(gate.identity, "renewals.paystack_check", undefined, {
      checked: subs.checked,
      healed: subs.healed,
      tidied: subs.tidied,
      findings: subs.findings.length,
      recovered: recovery.granted.length,
      cardPaid: recovery.cardPaid.length,
    });
    revalidatePath("/admin/renewals");
    revalidatePath("/admin/payments");

    const lines = [
      ...subs.findings.map((f) => `${f.kind.replace(/_/g, " ")}: ${f.detail}${f.action ? ` (${f.action})` : ""}`),
      ...recovery.cardPaid.map((c) => `card plan paid but not set up: ${c.plan}, ${c.reference}`),
    ].slice(0, 10);
    return {
      error: null,
      message:
        `Checked ${subs.checked} card subscription${subs.checked === 1 ? "" : "s"} and ${recovery.checked} unconfirmed checkout${recovery.checked === 1 ? "" : "s"} with Paystack. ` +
        `${subs.healed} renewal${subs.healed === 1 ? "" : "s"} recorded, ${recovery.granted.length} payment${recovery.granted.length === 1 ? "" : "s"} granted, ${subs.findings.length} to look at` +
        `${subs.errors + recovery.errors ? `, ${subs.errors + recovery.errors} could not be read` : ""}.`,
      lines,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The Paystack check failed.", message: null, lines: [] };
  }
}
