"use client";

import { useActionState } from "react";
import { setDataLayer, setSourceEnabled, type DataLayerActionState } from "@/app/actions/admin/data-layer";
import { Button, Spinner } from "@/components/ui/primitives";

const initial: DataLayerActionState = { error: null, message: null };

const OPTIONS = [
  { value: "live", label: "Live APIs", hint: "Pages call the provider APIs while they render, as before." },
  { value: "db_fallback", label: "Database, with fallback", hint: "Pages read the scheduled tables; an empty table falls back to the APIs." },
  { value: "db", label: "Database only", hint: "Pages read the scheduled tables only. No sports API call at page view." },
] as const;

export function DataLayerForm({ mode }: { mode: string }) {
  const [state, action, pending] = useActionState(setDataLayer, initial);
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "db" && !window.confirm("Read only from the database? Leagues whose jobs haven't run will show no games.")) {
          e.preventDefault();
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="submit"
            name="mode"
            value={o.value}
            disabled={pending || o.value === mode}
            className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${
              o.value === mode ? "border-brand/50 bg-brand/8" : "border-line hover:bg-surface-2"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              {o.label}
              {o.value === mode && <span className="text-[10px] font-bold uppercase tracking-wider text-brand">Current</span>}
            </span>
            <span className="mt-1 block text-xs leading-snug text-ink-dim">{o.hint}</span>
          </button>
        ))}
      </div>
      {pending && <Spinner className="size-3.5" />}
      {state.error && <p className="text-xs text-rose">{state.error}</p>}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}

export function SourceToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(setSourceEnabled, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="source" value={id} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <Button type="submit" variant="secondary" disabled={pending} className="!px-3 !py-1.5 text-xs">
        {pending && <Spinner className="size-3" />}
        {enabled ? "Disable" : "Enable"}
      </Button>
      {state.error && <span className="text-xs text-rose">{state.error}</span>}
    </form>
  );
}
