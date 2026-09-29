"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMail, type MailActionState } from "@/app/actions/admin/mail";
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives";

const initialState: MailActionState = { error: null, message: null };

export function MailComposeForm({ selfEmail, supportEmail }: { selfEmail: string; supportEmail: string }) {
  const [state, formAction, pending] = useActionState(sendMail, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <Field label="From" htmlFor="mailFrom">
        <Select id="mailFrom" name="from" defaultValue="self">
          <option value="self">{selfEmail}</option>
          <option value="support">{supportEmail}</option>
        </Select>
      </Field>

      <Field label="To" htmlFor="mailTo">
        <Input id="mailTo" name="to" type="email" required autoComplete="off" />
      </Field>

      <Field label="Subject" htmlFor="mailSubject">
        <Input id="mailSubject" name="subject" type="text" required autoComplete="off" />
      </Field>

      <Field label="Message" htmlFor="mailBody">
        <Textarea id="mailBody" name="body" required rows={10} />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner className="size-3.5" />}
          {pending ? "Sending…" : "Send"}
        </Button>
        {state.error && <p className="text-sm text-rose">{state.error}</p>}
        {state.message && <p className="text-sm text-brand">{state.message}</p>}
      </div>
    </form>
  );
}
