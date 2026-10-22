"use client";

import { useActionState } from "react";
import { setVipInvite, type VipInviteState } from "@/app/actions/admin/vip-chat";
import { Button, Field, Input, Spinner } from "@/components/ui/primitives";

const initial: VipInviteState = { error: null, message: null };

export function VipInviteForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(setVipInvite, initial);
  return (
    <form action={action} className="space-y-3">
      <Field label="Group invite link" htmlFor="vip-invite" hint="Leave empty to hide the join button.">
        <Input id="vip-invite" name="invite" type="url" defaultValue={current ?? ""} placeholder="https://chat.whatsapp.com/…" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-3.5" />}
        Save link
      </Button>
      {state.error && <p className="text-xs text-rose">{state.error}</p>}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}
