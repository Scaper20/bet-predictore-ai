"use client";

import { useActionState } from "react";
import { updateProfile, type AccountActionState } from "@/app/actions/account";
import { Button, Field, Input } from "@/components/ui/primitives";

const initialState: AccountActionState = { error: null, message: null };

export function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Display name" htmlFor="displayName" hint="Shown on your account — never on public pages.">
        <Input id="displayName" name="displayName" defaultValue={initialDisplayName} maxLength={80} />
      </Field>

      {state.error && <p className="text-sm text-rose">{state.error}</p>}
      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
