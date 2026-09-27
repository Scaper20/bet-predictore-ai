"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { expireStalePendingPayments } from "@/lib/payments-feed";

export type ExpirePaymentsState = { error: string | null; message: string | null };

/**
 * Manual trigger for /admin/payments — same sweep the daily cron runs
 * (api/cron/expire-pending-payments), for "I don't want to wait for
 * tonight's run" or right after noticing a pile of stale pendings.
 */
export async function expireStalePayments(_prev: ExpirePaymentsState): Promise<ExpirePaymentsState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const { expired } = await expireStalePendingPayments();
  if (expired > 0) {
    await logAdminAction(gate.identity, "payments.expired_stale", undefined, { expired });
  }

  revalidatePath("/admin/payments");
  return {
    error: null,
    message:
      expired > 0
        ? `Marked ${expired} stale pending payment${expired === 1 ? "" : "s"} as failed.`
        : "No stale pending payments — nothing older than 24h.",
  };
}
