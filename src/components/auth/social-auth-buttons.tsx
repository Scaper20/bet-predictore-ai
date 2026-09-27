"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/primitives";

type OAuthProvider = "google" | "twitter";

const PROVIDERS: { id: OAuthProvider; label: string; icon: React.ReactNode }[] = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z" />
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
        <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z" />
        <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z" />
      </svg>
    ),
  },
  {
    id: "twitter",
    label: "X",
    icon: (
      <svg className="size-4 fill-current text-ink" viewBox="0 0 24 24" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

/**
 * Real OAuth, unlike the placeholder buttons this replaced (they spun for
 * 1.5s and did nothing — no provider was ever configured). Each of these
 * only works once its provider is actually enabled in the Supabase
 * dashboard (Authentication > Sign In / Providers) with real credentials
 * from Google Cloud Console / the X Developer Portal — clicking one before
 * that returns "Unsupported provider" from Supabase, shown below the row
 * rather than failing silently. Apple deliberately isn't offered — it needs
 * a paid Apple Developer Program membership that hasn't been set up.
 *
 * signInWithOAuth() redirects the browser itself on success (it never
 * resolves — the page navigates away), so `loading` only ever gets cleared
 * on the error path.
 */
export function SocialAuthButtons({ next }: { next: string }) {
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(provider: OAuthProvider) {
    setError(null);
    setLoading(provider);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleClick(p.id)}
            disabled={loading !== null}
            aria-label={`Continue with ${p.label}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-3 disabled:opacity-50"
          >
            {loading === p.id ? <Spinner className="size-4" /> : p.icon}
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-rose">{error}</p>}

      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <span className="relative bg-surface px-3 text-[11px] font-semibold tracking-wider text-ink-dim uppercase">
          or continue with email
        </span>
      </div>
    </div>
  );
}
