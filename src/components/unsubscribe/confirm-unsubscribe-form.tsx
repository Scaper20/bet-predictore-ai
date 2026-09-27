"use client";

import { useActionState } from "react";
import { confirmUnsubscribe, type UnsubscribeActionState } from "@/app/actions/unsubscribe";
import { Button } from "@/components/ui/primitives";

const initialState: UnsubscribeActionState = { error: null, done: false };

export function ConfirmUnsubscribeForm({ recipientId }: { recipientId: string }) {
  const [state, formAction, pending] = useActionState(confirmUnsubscribe, initialState);

  if (state.done) {
    return (
      <div className="card p-6 text-center sm:p-8">
        <h1 className="font-display text-lg font-bold text-ink">You&rsquo;re unsubscribed</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          You won&rsquo;t get any more one-off emails like this one. Account and billing emails are unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 text-center sm:p-8">
      <h1 className="font-display text-lg font-bold text-ink">Stop these emails?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        This only affects one-off outreach like check-ins and surveys — your account and billing emails keep coming
        either way.
      </p>
      <form action={formAction} className="mt-5">
        <input type="hidden" name="recipientId" value={recipientId} />
        {state.error && <p className="mb-3 text-sm text-rose">{state.error}</p>}
        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Unsubscribing…" : "Unsubscribe me"}
        </Button>
      </form>
    </div>
  );
}
