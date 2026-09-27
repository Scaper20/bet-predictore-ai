"use client";

import { useActionState } from "react";
import { regenerateWhatsappDigest, type WhatsappDigestActionState } from "@/app/actions/admin/whatsapp-digest";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: WhatsappDigestActionState = { error: null };

export function RegenerateDigestButton() {
  const [state, formAction, pending] = useActionState(regenerateWhatsappDigest, initialState);

  return (
    <form action={formAction}>
      <Button type="submit" variant="secondary" disabled={pending} className="px-4 py-2 text-xs">
        {pending && <Spinner className="size-3.5" />}
        {pending ? "Regenerating…" : "Regenerate for today"}
      </Button>
      {state.error && <p className="mt-2 text-xs text-rose">{state.error}</p>}
    </form>
  );
}
