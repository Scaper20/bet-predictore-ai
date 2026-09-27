"use client";

import { useState, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, type AuthActionState } from "@/app/actions/auth";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: AuthActionState = { error: null };

export function LoginForm({
  defaultNext = "/account",
  showSignUpLink = true,
}: { defaultNext?: string; showSignUpLink?: boolean } = {}) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? defaultNext;
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        {state.error && (
          <div className="flex items-start gap-3 rounded-lg border border-rose/30 bg-rose/10 p-3 text-xs text-rose">
            <svg
              className="mt-0.5 size-4 shrink-0 fill-current"
              viewBox="0 0 20 20"
            >
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
            <div className="flex-1 font-medium">{state.error}</div>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">Email address</span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand focus:ring-1 focus:ring-brand/50"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">Password</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-lg border border-line bg-surface-2 pl-3.5 pr-10 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand focus:ring-1 focus:ring-brand/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.05 10.05 0 012.122-.063c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m-4.276-4.276a3 3 0 10-4.243-4.243m4.243 4.243L3 3l18 18" />
                </svg>
              ) : (
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </label>

        <Button type="submit" disabled={pending} className="mt-2 w-full font-semibold">
          {pending ? (
            <>
              <Spinner className="size-4 text-brand-ink" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        {showSignUpLink && (
          <p className="pt-2 text-center text-xs text-ink-muted">
            Don&apos;t have an account yet?{" "}
            <Link
              href={`/account/sign-up?next=${encodeURIComponent(next)}`}
              className="font-medium text-brand hover:underline underline-offset-2"
            >
              Create one now
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}

