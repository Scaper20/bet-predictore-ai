"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { submitFeedback, type FeedbackActionState } from "@/app/actions/feedback";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: FeedbackActionState = { error: null, ok: false };

/**
 * The NPS score and comment, shown inside the support chat. It used to be a
 * tab on the screen edge of every page; it now lives where people already go
 * to talk to us.
 */
export function FeedbackForm({ onDone }: { onDone?: () => void }) {
  const pathname = usePathname();
  const [state, formAction, pending] = useActionState(submitFeedback, initialState);

  if (state.ok) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-ink-muted">Thanks, that helps.</p>
        {onDone && (
          <button type="button" onClick={onDone} className="mt-3 text-xs font-semibold text-brand hover:underline">
            Back to chat
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="pagePath" value={pathname} />

      <fieldset>
        <legend className="mb-2 text-xs text-ink-muted">How likely are you to recommend KiqStat?</legend>
        <div className="grid grid-cols-11 gap-0.5">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="score" value={n} className="peer sr-only" />
              <span className="grid h-7 place-items-center rounded text-[10px] font-medium text-ink-muted peer-checked:bg-brand peer-checked:text-brand-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-surface-2">
                {n}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-dim">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-xs text-ink-muted">One thing we could do better? (optional)</span>
        <textarea
          name="comment"
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50"
        />
      </label>

      {state.error && <p className="text-xs text-rose">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full py-2 text-xs">
        {pending ? <Spinner className="size-3.5" /> : null}
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
