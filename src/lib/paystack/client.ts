import "server-only";

const PAYSTACK_API = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set.");
  return key;
}

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    // A stalled Paystack call would otherwise hold checkout (and the webhook
    // handler's verification) until the function's time limit.
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });

  const body = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !body.status) {
    throw new Error(`Paystack request failed: ${body.message ?? res.statusText}`);
  }
  return body.data;
}

export interface InitializeTransactionParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  /** Omitted for one-off passes — only Pro/VIP are recurring Paystack Plans. */
  planCode?: string;
  metadata: Record<string, string>;
}

export interface InitializeTransactionResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export function initializeTransaction(params: InitializeTransactionParams) {
  return paystackFetch<InitializeTransactionResult>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      plan: params.planCode,
      metadata: params.metadata,
    }),
  });
}

export interface VerifyTransactionResult {
  status: "success" | "failed" | "abandoned";
  reference: string;
  amount: number;
  /** The fee Paystack charged, in kobo, when it reports one. */
  fees?: number | null;
  currency?: string;
  customer: { email: string; customer_code: string };
  plan?: string;
  metadata: Record<string, string> | null;
}

export function verifyTransaction(reference: string) {
  return paystackFetch<VerifyTransactionResult>(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
}

export interface SubscriptionManageLinkResult {
  link: string;
}

/**
 * A Paystack-hosted page where the customer can update their card or cancel
 * the subscription themselves — this is the entire "cancel subscription" /
 * "add or update card" feature: redirect there rather than us ever touching
 * card data or a cancellation token. Confirmed to exist via a live web
 * search at implementation time (direct paystack.com doc fetches 403 from
 * this environment, same limitation noted in the webhook's CONFIDENCE NOTE)
 * — log `result` on first real use and confirm the `link` key name before
 * leaning on this further.
 */
export function getSubscriptionManageLink(subscriptionCode: string) {
  return paystackFetch<SubscriptionManageLinkResult>(
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`,
    { method: "GET" },
  );
}

export interface PaystackPlan {
  plan_code: string;
  /** Kobo. */
  amount: number;
  interval: string;
}

/** A plan as Paystack holds it: what a card subscription on it is really charged. */
export function fetchPlan(planCode: string) {
  return paystackFetch<PaystackPlan>(`/plan/${encodeURIComponent(planCode)}`, { method: "GET", signal: AbortSignal.timeout(6_000) });
}

export interface PaystackSubscription {
  subscription_code: string;
  /** active | non-renewing | attention | completed | cancelled */
  status: string;
  next_payment_date: string | null;
  customer: { id: number; customer_code: string; email: string };
  plan: { plan_code: string; interval: string; amount: number };
}

/** One card subscription as Paystack holds it. Read-only; used by the daily subscription check. */
export function fetchSubscription(code: string) {
  return paystackFetch<PaystackSubscription>(`/subscription/${encodeURIComponent(code)}`, {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
  });
}

export interface PaystackCharge {
  reference: string;
  /** Kobo. */
  amount: number;
  status: string;
  paid_at: string | null;
  currency?: string;
  fees?: number | null;
}

/** A customer's charges the card issuer reversed since `from` (ISO): Paystack took the money, then it went back. Read-only. */
export function listReversedCharges(customerId: number, from: string) {
  const q = new URLSearchParams({ customer: String(customerId), status: "reversed", from, perPage: "50" });
  return paystackFetch<PaystackCharge[]>(`/transaction?${q}`, { method: "GET", signal: AbortSignal.timeout(8_000) });
}

/** A customer's successful charges since `from` (ISO), newest first. Read-only. */
export function listSuccessfulCharges(customerId: number, from: string) {
  const q = new URLSearchParams({ customer: String(customerId), status: "success", from, perPage: "50" });
  return paystackFetch<PaystackCharge[]>(`/transaction?${q}`, { method: "GET", signal: AbortSignal.timeout(8_000) });
}
