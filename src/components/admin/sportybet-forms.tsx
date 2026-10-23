"use client";

import { useActionState, type ReactNode } from "react";
import {
  judgeLink,
  linkFixture,
  runSync,
  runVerify,
  unlinkFixture,
  type SportyBetActionState,
} from "@/app/actions/admin/sportybet";
import { Button, Spinner } from "@/components/ui/primitives";

const initial: SportyBetActionState = { error: null, message: null };

const ACTIONS = { link: linkFixture, judge: judgeLink, sync: runSync, verify: runVerify, unlink: unlinkFixture } as const;

/** One small form for one of the SportyBet matching actions, with its result inline. */
export function SportyBetForm({
  action,
  fields,
  children,
  variant = "secondary",
  className = "",
}: {
  action: keyof typeof ACTIONS;
  fields: Record<string, string>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(ACTIONS[action], initial);
  return (
    <form action={formAction} className={`space-y-1 ${className}`}>
      {Object.entries(fields).map(([name, value]) =>
        name === "intent" ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      <Button
        type="submit"
        name={fields.intent ? "intent" : undefined}
        value={fields.intent}
        variant={variant}
        disabled={pending}
        className="px-3 py-1.5 text-xs"
      >
        {pending && <Spinner className="size-3" />}
        {children}
      </Button>
      {state.error && <p className="text-[11px] text-rose">{state.error}</p>}
      {state.message && <p className="text-[11px] text-brand">{state.message}</p>}
    </form>
  );
}
