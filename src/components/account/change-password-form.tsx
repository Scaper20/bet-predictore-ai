"use client";

import { useActionState } from "react";
import { changePassword, type AccountActionState } from "@/app/actions/account";
import { Button, Field, Input } from "@/components/ui/primitives";

const initialState: AccountActionState = { error: null, message: null };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Current password" htmlFor="currentPassword">
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
        <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
      </Field>

      {state.error && <p className="text-sm text-rose">{state.error}</p>}
      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
