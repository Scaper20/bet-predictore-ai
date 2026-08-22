"use client";

import { useActionState, useEffect, useRef } from "react";
import { replyToTicket, closeTicket, type TicketActionState } from "@/app/actions/admin/tickets";
import { Button } from "@/components/ui/primitives";

const initialState: TicketActionState = { error: null };

export function ReplyForm({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const [state, formAction, pending] = useActionState(replyToTicket, initialState);
  const [closeState, closeFormAction, closePending] = useActionState(closeTicket, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div className="mt-4 space-y-3">
      {!closed && (
        <form ref={formRef} action={formAction} className="flex gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <textarea
            name="body"
            required
            rows={2}
            placeholder="Reply to this user…"
            className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand/50"
          />
          <Button type="submit" disabled={pending} className="self-end">
            {pending ? "Sending…" : "Reply"}
          </Button>
        </form>
      )}
      {state.error && <p className="text-sm text-rose">{state.error}</p>}

      <form action={closeFormAction}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <button
          type="submit"
          disabled={closePending || closed}
          className="text-xs text-ink-dim underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          {closed ? "Closed" : closePending ? "Closing…" : "Close ticket"}
        </button>
      </form>
      {closeState.error && <p className="text-sm text-rose">{closeState.error}</p>}
    </div>
  );
}
