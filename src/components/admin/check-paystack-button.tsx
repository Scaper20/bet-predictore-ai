"use client";

import { useActionState } from "react";
import { checkWithPaystack, type CheckPaystackState } from "@/app/actions/admin/renewals";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: CheckPaystackState = { error: null, message: null, lines: [] };

export function CheckPaystackButton() {
  const [state, formAction, pending] = useActionState(checkWithPaystack, initialState);

  return (
    <form action={formAction} className="max-w-xl">
      <Button type="submit" variant="secondary" disabled={pending} className="px-4 py-2 text-xs">
        {pending && <Spinner className="size-3.5" />}
        {pending ? "Asking Paystack…" : "Check with Paystack now"}
      </Button>
      {state.error && <p className="mt-2 text-xs text-rose">{state.error}</p>}
      {state.message && <p className="mt-2 text-xs text-brand">{state.message}</p>}
      {state.lines.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
          {state.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
