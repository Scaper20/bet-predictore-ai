"use client";

import { useActionState } from "react";
import { expireStalePayments, type ExpirePaymentsState } from "@/app/actions/admin/payments";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: ExpirePaymentsState = { error: null, message: null };

export function ExpirePaymentsButton() {
  const [state, formAction, pending] = useActionState(expireStalePayments, initialState);

  return (
    <form action={formAction}>
      <Button type="submit" variant="secondary" disabled={pending} className="px-4 py-2 text-xs">
        {pending && <Spinner className="size-3.5" />}
        {pending ? "Checking…" : "Expire stale pending (24h+)"}
      </Button>
      {state.error && <p className="mt-2 text-xs text-rose">{state.error}</p>}
      {state.message && <p className="mt-2 text-xs text-brand">{state.message}</p>}
    </form>
  );
}
