"use client";

import { useActionState, useState } from "react";
import { removeAdmin, type TeamActionState } from "@/app/actions/admin/team";
import { Spinner } from "@/components/ui/primitives";

const initialState: TeamActionState = { error: null, message: null };

export function RemoveAdminButton({ targetId, targetEmail }: { targetId: string; targetEmail: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(removeAdmin, initialState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-rose underline underline-offset-2 hover:text-rose"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="targetEmail" value={targetEmail} />
      <span className="text-xs text-ink-dim">Confirm?</span>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose hover:text-rose"
      >
        {pending && <Spinner className="size-3" />}
        {pending ? "Removing…" : "Yes, remove"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-ink-dim hover:text-ink">
        Cancel
      </button>
      {state.error && <span className="text-xs text-rose">{state.error}</span>}
    </form>
  );
}
