"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateProfile, type AccountActionState } from "@/app/actions/account";
import { Button, Field, Input } from "@/components/ui/primitives";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";

const initialState: AccountActionState = { error: null, message: null };

export function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const { refresh } = useEntitlement();
  const wasPending = useRef(false);

  // The header's account menu holds its own copy of displayName (via
  // EntitlementProvider, fetched once on mount) — revalidatePath("/account")
  // in the server action invalidates this page's server render, but does
  // nothing for that separate client-side fetch, so without this the menu
  // keeps showing the old name until the next sign-in or full reload.
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) void refresh();
    wasPending.current = pending;
  }, [pending, state.error, refresh]);

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
