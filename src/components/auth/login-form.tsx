"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, type AuthActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/primitives";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/account";
  const [state, formAction, pending] = useActionState(signIn, initialState);

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
          autoComplete="current-password"
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
        />
      </label>

      {state.error && <p className="text-sm text-rose">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-ink-dim">
        No account?{" "}
        <Link href={`/account/sign-up?next=${encodeURIComponent(next)}`} className="text-brand underline underline-offset-2">
          Create one
        </Link>
      </p>
    </form>
  );
}
