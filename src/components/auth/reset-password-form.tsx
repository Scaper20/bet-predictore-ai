"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { resetPassword, type ResetPasswordState } from "@/app/actions/password-reset";
import { Button, Spinner } from "@/components/ui/primitives";
import { FormError } from "@/components/auth/form-error";

const initialState: ResetPasswordState = { error: null, expired: false };

const INPUT =
  "w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand focus:ring-1 focus:ring-brand/50";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);
  const [show, setShow] = useState(false);

  if (state.expired) return <ExpiredLink message={state.error} />;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <FormError message={state.error} />}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-muted">New password</span>
        <input
          type={show ? "text" : "password"}
          name="password"
          required
          minLength={8}
          maxLength={72}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          className={INPUT}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-muted">Confirm new password</span>
        <input
          type={show ? "text" : "password"}
          name="confirmPassword"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className={INPUT}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-brand" />
        Show passwords
      </label>

      <Button type="submit" disabled={pending} className="mt-2 w-full font-semibold">
        {pending ? (
          <>
            <Spinner className="size-4 text-brand-ink" />
            Saving…
          </>
        ) : (
          "Save new password"
        )}
      </Button>
    </form>
  );
}

export function ExpiredLink({ message }: { message?: string | null }) {
  return (
    <div className="space-y-4 text-sm text-ink-muted">
      <FormError message={message ?? "This reset link isn't valid."} />
      <p>Reset links work once and expire within the hour. Ask for a fresh one and use the newest email.</p>
      <Link
        href="/account/forgot-password"
        className="inline-block font-medium text-brand hover:underline underline-offset-2"
      >
        Send a new reset link
      </Link>
    </div>
  );
}
