"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addAdmin, setAdminRoles, type TeamActionState } from "@/app/actions/admin/team";
import { ROLES, ROLE_IDS, type Role } from "@/lib/admin-access";
import { Button, Field, Input, Spinner } from "@/components/ui/primitives";

const initialState: TeamActionState = { error: null, message: null };

/** Role chips that work as checkboxes. A person holds at least one. */
function RolePicker({ value, onChange, name = "roles", compact = false }: { value: Role[]; onChange: (r: Role[]) => void; name?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-2"}`} role="group" aria-label="Roles">
      {ROLE_IDS.map((r) => {
        const on = value.includes(r);
        return (
          <label
            key={r}
            title={ROLES[r].description}
            className={`cursor-pointer select-none rounded-md border font-medium transition-colors ${
              compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
            } ${on ? (r === "owner" ? "border-gold/40 bg-gold/10 text-gold" : "border-brand/40 bg-brand/10 text-brand") : "border-line text-ink-muted hover:border-line-strong hover:text-ink"}`}
          >
            <input
              type="checkbox"
              name={name}
              value={r}
              checked={on}
              onChange={() => onChange(on ? value.filter((x) => x !== r) : ROLE_IDS.filter((x) => x === r || value.includes(x)))}
              className="sr-only"
            />
            {ROLES[r].label}
          </label>
        );
      })}
    </div>
  );
}

export function AddMemberForm() {
  const [state, formAction, pending] = useActionState(addAdmin, initialState);
  const [roles, setRoles] = useState<Role[]>(["support"]);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <Field label="Email" htmlFor="addAdminEmail" hint="They must already have an account on the site.">
        <Input id="addAdminEmail" name="email" type="email" required autoComplete="off" placeholder="teammate@kiqstat.app" />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Role</p>
        <RolePicker value={roles} onChange={setRoles} />
        <p className="mt-2 text-xs text-ink-dim">
          {roles.length ? roles.map((r) => ROLES[r].description).join(" ") : "Pick at least one role."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || roles.length === 0}>
          {pending && <Spinner className="size-3.5" />}
          {pending ? "Adding…" : "Grant access"}
        </Button>
        {state.error && <p className="text-sm text-rose">{state.error}</p>}
        {state.message && <p className="text-sm text-brand">{state.message}</p>}
      </div>
    </form>
  );
}

export function RoleEditor({ targetId, targetEmail, roles: initial }: { targetId: string; targetEmail: string; roles: Role[] }) {
  const [state, formAction, pending] = useActionState(setAdminRoles, initialState);
  const [roles, setRoles] = useState<Role[]>(initial);
  const dirty = roles.join() !== initial.join();
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="targetEmail" value={targetEmail} />
      <RolePicker value={roles} onChange={setRoles} compact />
      {dirty && (
        <>
          <button
            type="submit"
            disabled={pending || roles.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-ink hover:bg-brand-strong disabled:opacity-50"
          >
            {pending && <Spinner className="size-3" />} Save
          </button>
          <button type="button" onClick={() => setRoles(initial)} className="text-[11px] text-ink-dim hover:text-ink">
            Cancel
          </button>
        </>
      )}
      {state.error && <span className="w-full text-xs text-rose">{state.error}</span>}
      {!dirty && state.message && <span className="text-xs text-brand">{state.message}</span>}
    </form>
  );
}
