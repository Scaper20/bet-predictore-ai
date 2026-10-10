import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { grantFlutterwavePayment } from "@/lib/flutterwave/grant";

// Node's crypto; excluded from Proxy's matcher like the Paystack webhook (src/proxy.ts).
export const runtime = "nodejs";

/**
 * Flutterwave webhook. Flutterwave sends the secret hash set in its
 * dashboard (Settings → Webhooks) in a `verif-hash` header; anything without
 * it is refused. The body is only a hint: grantFlutterwavePayment re-reads
 * the transaction from Flutterwave by our reference before granting, so a
 * forged or replayed body can't buy access. Always 200 once authenticated,
 * since Flutterwave counts anything else as a failed delivery and retries.
 */
function hashMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 500 });
  if (!hashMatches(request.headers.get("verif-hash"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { event?: string; data?: { tx_ref?: unknown }; txRef?: unknown }
    | null;
  // v3 deliveries carry data.tx_ref; accounts left on the legacy webhook
  // format send txRef at the top level. The grant checks the status itself,
  // so the event name doesn't need to be trusted or matched.
  const raw = body?.data?.tx_ref ?? body?.txRef;
  const txRef = typeof raw === "string" ? raw : undefined;

  // Only our own checkouts carry this prefix; anything else on the account
  // (payment links made in the dashboard, transfers) isn't ours to grant.
  if (txRef?.startsWith("betrix_fw_")) {
    await grantFlutterwavePayment(txRef).catch(() => undefined);
  }
  return NextResponse.json({ received: true });
}
