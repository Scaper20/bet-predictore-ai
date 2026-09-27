"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/primitives";

type OAuthProvider = "google" | "apple" | "twitter";

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
    id: "apple",
    label: "Apple",
    icon: (
      <svg className="size-5 fill-current text-ink" viewBox="0 0 24 24" aria-hidden>
        <path d="M16.365 1.43c0 1.14-.468 2.207-1.216 3.002-.833.878-2.147 1.554-3.216 1.47-.132-1.106.443-2.264 1.19-3.018.85-.86 2.32-1.51 3.242-1.454zM20.6 17.23c-.5 1.155-.74 1.674-1.38 2.688-.9 1.42-2.17 3.19-3.744 3.204-1.4.014-1.762-.912-3.667-.902-1.905.01-2.303.917-3.703.903-1.575-.015-2.777-1.62-3.677-3.038-2.527-3.985-2.793-8.66-1.233-11.15C4.63 7.055 6.394 6.04 8.043 6.04c1.679 0 2.735.926 4.124.926 1.347 0 2.166-.928 4.126-.928 1.469 0 3.024.8 4.134 2.183-3.633 1.99-3.043 7.174.173 9.009z" />
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
 * from Google Cloud Console / Apple Developer / the X Developer Portal —
 * clicking one before that returns "Unsupported provider" from Supabase,
 * shown below the row rather than failing silently.
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
      <div className="grid grid-cols-3 gap-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleClick(p.id)}
            disabled={loading !== null}
            aria-label={`Continue with ${p.label}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 py-2.5 text-ink transition-colors hover:border-line-strong hover:bg-surface-3 disabled:opacity-50"
          >
            {loading === p.id ? <Spinner className="size-4" /> : p.icon}
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
