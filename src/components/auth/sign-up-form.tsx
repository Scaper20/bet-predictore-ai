"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp, type AuthActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/primitives";

const initialState: AuthActionState = { error: null };

export function SignUpForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/account";
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-muted">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-muted">Password</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
        />
        <span className="mt-1 block text-[11px] text-ink-dim">At least 8 characters.</span>
      </label>

      {state.error && <p className="text-sm text-rose">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-xs text-ink-dim">
        Already have an account?{" "}
        <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="text-brand underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
