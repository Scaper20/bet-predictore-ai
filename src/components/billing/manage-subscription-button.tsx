"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** Redirects to Paystack's hosted subscription-management page — covers both
 * "update card" and "cancel" in one flow; see paystack/client.ts. */
export function ManageSubscriptionButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manage() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/billing/manage", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't open the subscription manager.");
      window.location.assign(body.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the subscription manager.");
      setPending(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" onClick={manage} disabled={pending}>
        {pending ? "Opening…" : "Manage subscription"}
      </Button>
      {error && <p className="mt-2 text-sm text-rose">{error}</p>}
    </div>
  );
}
