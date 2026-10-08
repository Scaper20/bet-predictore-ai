"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/actions/password-reset";
import { Button, Spinner } from "@/components/ui/primitives";
import { FormError } from "@/components/auth/form-error";

const initialState: ForgotPasswordState = { error: null, sent: false, email: "" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.sent) {
    return (
      <div className="space-y-4 text-sm text-ink-muted" role="status">
        <div className="rounded-lg border border-brand/30 bg-brand/10 p-4 text-ink">
          If an account exists for <strong className="break-all">{state.email}</strong>, a link to reset its password is
          on its way.
        </div>
        <p>
          The link works once and expires within the hour. Nothing after a few minutes? Check your spam folder, then
          ask again.
        </p>
        <p>
          <Link href="/account/login" className="font-medium text-brand hover:underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <FormError message={state.error} />}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-muted">Email address</span>
        <input
          type="email"
          name="email"
          defaultValue={state.email}
          required
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand focus:ring-1 focus:ring-brand/50"
        />
      </label>

      <Button type="submit" disabled={pending} className="mt-2 w-full font-semibold">
        {pending ? (
          <>
            <Spinner className="size-4 text-brand-ink" />
            Sending…
          </>
        ) : (
          "Send reset link"
        )}
      </Button>

      <p className="pt-2 text-center text-xs text-ink-muted">
        Remembered it?{" "}
        <Link href="/account/login" className="font-medium text-brand hover:underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
