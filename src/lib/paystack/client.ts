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
  /** Omitted for the one-off Weekend Pass — only Pro/VIP are recurring Paystack Plans. */
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
