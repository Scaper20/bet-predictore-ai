"use client";

import { useActionState } from "react";
import { setMaintenance, type MaintenanceActionState } from "@/app/actions/admin/maintenance";
import { Button, Field, Spinner, Textarea } from "@/components/ui/primitives";
import { DEFAULT_MAINTENANCE_MESSAGE, MAINTENANCE_MESSAGE_MAX } from "@/lib/maintenance";

const initialState: MaintenanceActionState = { error: null, message: null };

export function MaintenanceForm({ enabled, message }: { enabled: boolean; message: string | null }) {
  const [state, formAction, pending] = useActionState(setMaintenance, initialState);

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (
          submitter?.value === "enable" &&
          !window.confirm("Block the public site? Everyone except admins will see the maintenance page.")
        ) {
          e.preventDefault();
        }
      }}
    >
      <Field
        label="Message shown to visitors"
        htmlFor="maintenance-message"
        hint={`Leave empty to use the default. Up to ${MAINTENANCE_MESSAGE_MAX} characters.`}
      >
        <Textarea
          id="maintenance-message"
          name="message"
          rows={3}
          maxLength={MAINTENANCE_MESSAGE_MAX}
          defaultValue={message ?? ""}
          placeholder={DEFAULT_MAINTENANCE_MESSAGE}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        {enabled ? (
          <Button type="submit" name="intent" value="disable" disabled={pending}>
            {pending && <Spinner className="size-3.5" />}
            Turn off — put BetriX back live
          </Button>
        ) : (
          <Button type="submit" name="intent" value="enable" variant="danger" disabled={pending}>
            {pending && <Spinner className="size-3.5" />}
            Turn on maintenance mode
          </Button>
        )}
        <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
          Save message only
        </Button>
      </div>

      {state.error && <p className="text-xs text-rose">{state.error}</p>}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}
