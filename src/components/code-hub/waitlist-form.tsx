"use client";

import { useActionState } from "react";
import { joinHubWaitlist, type WaitlistState } from "@/app/actions/code-hub";
import { Button, Input, Spinner } from "@/components/ui/primitives";

const initial: WaitlistState = { status: "idle", message: null };

export function WaitlistForm({ email, joined }: { email: string | null; joined: boolean }) {
  const [state, action, pending] = useActionState(joinHubWaitlist, initial);

  if (joined || state.status === "joined") {
    return (
      <p className="rounded-xl border border-brand/30 bg-brand/8 px-4 py-3 text-sm font-semibold text-ink">
        ✓ {state.message ?? "You're on the list. We'll email you the day it opens."}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="flex flex-col gap-2 sm:flex-row">
        {email ? (
          <p className="flex-1 truncate rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink-muted">{email}</p>
        ) : (
          <Input type="email" name="email" required placeholder="you@example.com" autoComplete="email" className="flex-1" aria-label="Email" />
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Spinner className="size-3.5" />}
          Join the waitlist
        </Button>
      </div>
      {state.status === "error" && <p className="text-xs text-rose">{state.message}</p>}
    </form>
  );
}
