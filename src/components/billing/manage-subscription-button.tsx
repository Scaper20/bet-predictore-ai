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
    let res: Response;
    try {
      res = await fetch("/api/billing/manage", { method: "POST" });
    } catch {
      setError("No connection. Check your network and try again.");
      setPending(false);
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: string; link?: string } | null;
    if (!res.ok || !body?.link) {
      setError(body?.error ?? "Couldn't open the subscription manager just now. Try again shortly.");
      setPending(false);
      return;
    }
    window.location.assign(body.link);
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
