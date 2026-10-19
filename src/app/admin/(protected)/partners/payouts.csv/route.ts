import { checkAdmin, logAdminAction } from "@/lib/admin";
import { getPayoutSheet } from "@/lib/partners-feed";
import { payoutCsv } from "@/lib/partners";

export const dynamic = "force-dynamic";

/** The bank-transfer sheet for everyone due a payout now. Route handlers get no layout gating, so the gate is here. */
export async function GET() {
  const gate = await checkAdmin();
  if (!gate.ok) return new Response(gate.error, { status: gate.status });

  const lines = await getPayoutSheet();
  await logAdminAction(gate.identity, "partner.payout_sheet_exported", undefined, { lines: lines.length });

  const day = new Date().toISOString().slice(0, 10);
  return new Response(payoutCsv(lines), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kiqstat-partner-payouts-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
