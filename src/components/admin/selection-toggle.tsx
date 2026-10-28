"use client";

import { useActionState } from "react";
import { setSelection, type SelectionActionState } from "@/app/actions/admin/selections";
import type { Surface } from "@/lib/model/selections";

const initial: SelectionActionState = { error: null, message: null };

/**
 * One selection on one surface: a switch showing whether it is published
 * now, and whether that is the owner's call or the rules' default. Flipping
 * it stores the owner's call; "Default" hands it back to the rules.
 */
export function SelectionToggle({
  market,
  surface,
  on,
  manual,
  disabled,
  disabledNote,
  label,
}: {
  market: string;
  surface: Surface;
  /** Published now on this surface. */
  on: boolean;
  /** The owner's switch, not the default. */
  manual: boolean;
  disabled?: boolean;
  disabledNote?: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(setSelection, initial);
  if (disabled) return <span className="text-[11px] text-ink-dim" title={disabledNote}>n/a</span>;
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="surface" value={surface} />
      <span className="inline-flex items-center gap-2">
        {manual && (
          <button type="submit" name="value" value="default" disabled={pending} className="text-[10.5px] text-ink-dim underline-offset-2 hover:text-ink hover:underline">
            Default
          </button>
        )}
        <button
          type="submit"
          name="value"
          value={on ? "off" : "on"}
          disabled={pending}
          role="switch"
          aria-checked={on}
          aria-label={`${on ? "Retract" : "Publish"} ${label}`}
          onClick={(e) => {
            if (!on && !window.confirm(`Publish ${label} ${surface === "headline" ? "as a headline pick" : "in Code Hub codes"}?`)) e.preventDefault();
          }}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-brand" : "bg-surface-3"} ${manual ? "ring-1 ring-amber/60 ring-offset-1 ring-offset-canvas" : ""}`}
        >
          <span className={`absolute top-0.5 size-4 rounded-full bg-canvas transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </span>
      {state.error && <span className="max-w-[14rem] text-right text-[10.5px] text-rose">{state.error}</span>}
      {state.message && <span className="max-w-[14rem] text-right text-[10.5px] text-brand">{state.message}</span>}
    </form>
  );
}
