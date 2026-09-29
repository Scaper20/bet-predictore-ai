"use client";

import { useActionState } from "react";
import { disconnectMail, type MailActionState } from "@/app/actions/admin/mail";
import { Button, ButtonLink, Spinner } from "@/components/ui/primitives";

const initialState: MailActionState = { error: null, message: null };

export function MailConnectCard({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(disconnectMail, initialState);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-ink">Connected as {email}</p>
        <p className="text-xs text-ink-dim">Send-only — this can never read what&apos;s already in that inbox.</p>
      </div>
      <form action={formAction}>
        <Button type="submit" variant="ghost" disabled={pending} className="px-3 py-1.5 text-xs">
          {pending && <Spinner className="size-3.5" />}
          {pending ? "Disconnecting…" : "Disconnect"}
        </Button>
      </form>
      {state.error && <p className="w-full text-xs text-rose">{state.error}</p>}
    </div>
  );
}

export function MailConnectPrompt() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line px-4 py-4">
      <p className="text-sm text-ink-muted">Connect your Google account to send mail from here.</p>
      <ButtonLink href="/api/admin/mail/connect" variant="secondary" className="px-4 py-2 text-sm">
        Connect Google account
      </ButtonLink>
    </div>
  );
}
