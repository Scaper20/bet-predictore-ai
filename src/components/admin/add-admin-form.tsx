"use client";

import { useActionState, useEffect, useRef } from "react";
import { addAdmin, type TeamActionState } from "@/app/actions/admin/team";
import { Button, Field, Input } from "@/components/ui/primitives";

const initialState: TeamActionState = { error: null, message: null };

export function AddAdminForm() {
  const [state, formAction, pending] = useActionState(addAdmin, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[16rem] flex-1">
        <Field label="Add an admin by email" htmlFor="addAdminEmail" hint="They must already have a regular account on the site.">
          <Input id="addAdminEmail" name="email" type="email" required autoComplete="off" />
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Adding…" : "Grant access"}
      </Button>
      {state.error && <p className="w-full text-sm text-rose">{state.error}</p>}
      {state.message && <p className="w-full text-sm text-brand">{state.message}</p>}
    </form>
  );
}
