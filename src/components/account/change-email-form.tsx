"use client";

import { useActionState } from "react";
import { changeEmail, type AccountActionState } from "@/app/actions/account";
import { Button, Field, Input } from "@/components/ui/primitives";

const initialState: AccountActionState = { error: null, message: null };

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(changeEmail, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-xs text-ink-dim">
        Currently: <span className="text-ink-muted">{currentEmail}</span>
      </p>

      <Field label="New email" htmlFor="newEmail">
        <Input id="newEmail" name="newEmail" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password" htmlFor="emailPassword" hint="Confirms it's really you.">
        <Input id="emailPassword" name="password" type="password" required autoComplete="current-password" />
      </Field>

      {state.error && <p className="text-sm text-rose">{state.error}</p>}
      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Updating…" : "Change email"}
      </Button>
    </form>
  );
}
