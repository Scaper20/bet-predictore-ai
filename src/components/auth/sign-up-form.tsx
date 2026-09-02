"use client";

import { useState, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp, type AuthActionState } from "@/app/actions/auth";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: AuthActionState = { error: null };

export function SignUpForm({
  defaultNext = "/account",
}: { defaultNext?: string } = {}) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? defaultNext;
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);

  const isMinLength = password.length >= 8;
  const hasLetterAndNumber = /[a-zA-Z]/.test(password) && /\d/.test(password);

  const handleSocialClick = (provider: string) => {
    setSocialLoading(provider);
    setTimeout(() => {
      setSocialLoading(null);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Social Auth Options */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleSocialClick("Google")}
          disabled={pending || socialLoading !== null}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-3 disabled:opacity-50"
        >
          {socialLoading === "Google" ? (
            <Spinner className="size-4" />
          ) : (
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
          )}
          Google
        </button>

        <button
          type="button"
          onClick={() => handleSocialClick("GitHub")}
          disabled={pending || socialLoading !== null}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-3 disabled:opacity-50"
        >
          {socialLoading === "GitHub" ? (
            <Spinner className="size-4" />
          ) : (
            <svg className="size-4 fill-current text-ink" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          )}
          GitHub
        </button>
      </div>

      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <span className="relative bg-surface px-3 text-[11px] font-semibold tracking-wider text-ink-dim uppercase">
          or register with email
        </span>
      </div>

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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              autoComplete="new-password"
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

          {/* Password Validation Indicators */}
          {password.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
              <span className={`inline-flex items-center gap-1 font-medium ${isMinLength ? "text-brand" : "text-ink-dim"}`}>
                {isMinLength ? "✓" : "○"} At least 8 characters
              </span>
              <span className={`inline-flex items-center gap-1 font-medium ${hasLetterAndNumber ? "text-brand" : "text-ink-dim"}`}>
                {hasLetterAndNumber ? "✓" : "○"} Letters & numbers
              </span>
            </div>
          )}
        </label>

        <Button type="submit" disabled={pending} className="mt-2 w-full font-semibold">
          {pending ? (
            <>
              <Spinner className="size-4 text-brand-ink" />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>

        <p className="pt-2 text-center text-xs text-ink-muted">
          Already have an account?{" "}
          <Link
            href={`/account/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-brand hover:underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

