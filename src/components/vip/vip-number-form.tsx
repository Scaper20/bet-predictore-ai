"use client";

import { useActionState } from "react";
import { saveVipNumber, type VipNumberState } from "@/app/actions/vip-chat";
import { Button, Field, Input, Spinner } from "@/components/ui/primitives";

const initial: VipNumberState = { status: "idle", message: null };

/** The WhatsApp number a VIP member joins the chat with. */
export function VipNumberForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(saveVipNumber, initial);

  return (
    <form action={action} className="space-y-3">
      <Field
        label="Your WhatsApp number"
        htmlFor="vip-number"
        hint="Join with this number: we let in requests from VIP members' numbers only."
      >
        <Input
          id="vip-number"
          name="number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          defaultValue={current ?? ""}
          placeholder="0803 123 4567"
        />
      </Field>
      <Button type="submit" variant={current ? "secondary" : "primary"} disabled={pending} className="w-full sm:w-auto">
        {pending && <Spinner className="size-3.5" />}
        {current ? "Change number" : "Save number"}
      </Button>
      {state.status === "error" && <p className="text-xs text-rose">{state.message}</p>}
    </form>
  );
}
