import "server-only";

/**
 * Flutterwave v3, the two calls BetriX needs: start a hosted checkout
 * (Flutterwave Standard) and verify a transaction by our own reference.
 * Checked against developer.flutterwave.com (Standard, verify_by_reference,
 * webhooks) in October 2026.
 */

const FLW_API = "https://api.flutterwave.com/v3";

function secretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error("FLUTTERWAVE_SECRET_KEY is not set.");
  return key;
}

/**
 * Only a v3 secret key (FLWSECK-..., or FLWSECK_TEST-... in test mode) works
 * here. v4 credentials (a client ID and secret for OAuth) can't call the v3
 * hosted checkout, and v4 has no hosted checkout of its own yet, so with any
 * other key Flutterwave stays off and everyone pays through Paystack rather
 * than reaching a checkout that fails.
 */
export function flutterwaveConfigured(): boolean {
  return /^FLWSECK(_TEST)?-/.test(process.env.FLUTTERWAVE_SECRET_KEY ?? "");
}

async function flwFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FLW_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    // A stalled call would otherwise hold checkout or the webhook until the
    // function's time limit (same reason as paystack/client.ts).
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: T };
  if (!res.ok || body.status !== "success" || body.data === undefined) {
    throw new Error(`Flutterwave request failed: ${body.message ?? res.statusText}`);
  }
  return body.data;
}

export interface PaymentLinkParams {
  txRef: string;
  /** Major units of `currency`. */
  amount: number;
  currency: string;
  redirectUrl: string;
  email: string;
  name?: string;
  /** Flutterwave payment_options, e.g. "card,mpesa". */
  methods?: string;
  meta: Record<string, string>;
  description: string;
}

/** A hosted Flutterwave checkout page for one payment. */
export async function createPaymentLink(p: PaymentLinkParams): Promise<string> {
  const data = await flwFetch<{ link: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: p.txRef,
      amount: p.amount,
      currency: p.currency,
      redirect_url: p.redirectUrl,
      payment_options: p.methods,
      customer: { email: p.email, ...(p.name ? { name: p.name } : {}) },
      meta: p.meta,
      customizations: { title: "BetriX", description: p.description },
    }),
  });
  return data.link;
}

export interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string; name?: string };
  meta?: Record<string, unknown> | null;
}

/** The transaction behind one of our references, as Flutterwave records it. */
export function verifyByReference(txRef: string): Promise<FlutterwaveTransaction> {
  return flwFetch<FlutterwaveTransaction>(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
    method: "GET",
  });
}
