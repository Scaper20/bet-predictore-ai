"use client";

import { useActionState } from "react";
import { setSwitch, type SwitchActionState } from "@/app/actions/admin/switches";
import { Button, Spinner } from "@/components/ui/primitives";
import type { SwitchKey } from "@/lib/switches";

const initialState: SwitchActionState = { error: null, message: null };

/** One on/off button for an operator switch, with an optional confirm before turning it on. */
export function SwitchForm({
  switchKey,
  enabled,
  onLabel,
  offLabel,
  confirmOn,
  disabled = false,
}: {
  switchKey: SwitchKey;
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  confirmOn?: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(setSwitch, initialState);
  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(e) => {
        if (!enabled && confirmOn && !window.confirm(confirmOn)) e.preventDefault();
      }}
    >
      <input type="hidden" name="key" value={switchKey} />
      <Button
        type="submit"
        name="intent"
        value={enabled ? "off" : "on"}
        variant={enabled ? "danger" : "primary"}
        disabled={pending || (disabled && !enabled)}
      >
        {pending && <Spinner className="size-3.5" />}
        {enabled ? offLabel : onLabel}
      </Button>
      {state.error && <p className="text-xs text-rose">{state.error}</p>}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}
