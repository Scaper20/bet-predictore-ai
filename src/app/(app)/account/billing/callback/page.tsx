import type { Metadata } from "next";
import Link from "next/link";
import { verifyTransaction } from "@/lib/paystack/client";
import { ButtonLink } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Payment" };

/**
 * This page is UX feedback only — it does not itself grant any entitlement.
 * The webhook (src/app/api/billing/webhook/route.ts) is the source of truth,
 * since a user can close this tab before it ever loads. `reference` is a
 * client-supplied query param, so it's verified server-to-server against
 * Paystack rather than trusted at face value.
 */
export default async function BillingCallbackPage({
  searchParams,
}: PageProps<"/account/billing/callback">) {
  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference : undefined;

  let status: "success" | "failed" | "unknown" = "unknown";
  if (reference) {
    try {
      const result = await verifyTransaction(reference);
      status = result.status === "success" ? "success" : "failed";
    } catch {
      status = "unknown";
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      {status === "success" && (
        <>
          <h1 className="font-display text-2xl font-bold">Payment received</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your plan is being activated — this usually takes a few seconds. If it doesn&apos;t show up on your
            account shortly, contact support with your payment reference.
          </p>
        </>
      )}
      {status === "failed" && (
        <>
          <h1 className="font-display text-2xl font-bold">Payment didn&apos;t go through</h1>
          <p className="mt-2 text-sm text-ink-muted">No charge was completed. You can try again anytime.</p>
        </>
      )}
      {status === "unknown" && (
        <>
          <h1 className="font-display text-2xl font-bold">Checking your payment…</h1>
          <p className="mt-2 text-sm text-ink-muted">
            We couldn&apos;t confirm the status right now. Check your account page in a moment.
          </p>
        </>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <ButtonLink href="/account">Go to account</ButtonLink>
        <Link href="/predictions" className="inline-flex items-center px-4 text-sm text-ink-muted underline underline-offset-2">
          Back to predictions
        </Link>
      </div>
    </div>
  );
}
