"use client";

import { useActionState } from "react";
import { deleteAccount, type AccountActionState } from "@/app/actions/account";
import { Button, ButtonLink, Field, Input } from "@/components/ui/primitives";

const initialState: AccountActionState = { error: null, message: null };

export function DeleteAccountForm({ hasActiveSubscription }: { hasActiveSubscription: boolean }) {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);

  if (hasActiveSubscription) {
    return (
      <div>
        <p className="text-sm text-ink-muted">
          You have an active subscription. Cancel it before deleting your account, so it doesn&apos;t keep billing
          you after your account is gone.
        </p>
        <ButtonLink href="/account/billing" variant="secondary" className="mt-4">
          Go to billing
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-ink-muted">
        This permanently deletes your account, profile and payment history. This cannot be undone.
      </p>

      <Field label='Type "DELETE" to confirm' htmlFor="confirmation">
        <Input id="confirmation" name="confirmation" placeholder="DELETE" autoComplete="off" />
      </Field>
      <Field label="Password" htmlFor="deletePassword">
        <Input id="deletePassword" name="password" type="password" required autoComplete="current-password" />
      </Field>

      {state.error && <p className="text-sm text-rose">{state.error}</p>}

      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
