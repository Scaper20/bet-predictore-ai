import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame every auth page sits in: a pitch drawn faintly behind a single
 * card, a sign-up / sign-in switch on top, and one line of small talk.
 * Words kept to the minimum; the form does the talking.
 *
 * `next` decides the strip above the card: someone on their way to an
 * offer or a plan is told that is where this goes, so the account step reads
 * as part of the checkout rather than a detour from it.
 */
export function AuthShell({
  mode,
  next,
  title,
  smallTalk,
  children,
  footer,
}: {
  mode?: "sign-up" | "login";
  next?: string;
  title: string;
  smallTalk: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  const heading = headingFor(next);
  return (
    <div className="relative isolate flex min-h-[calc(100dvh-var(--header-h))] items-start justify-center overflow-hidden px-4 py-8 sm:items-center sm:py-14">
      <AuthBackdrop />

      <div className="w-full max-w-[400px]">
        {heading && (
          <div className={`mb-3 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs ${heading.tone}`}>
            <span aria-hidden className="text-sm">{heading.icon}</span>
            <span className="font-semibold">{heading.text}</span>
          </div>
        )}

        <div className="rounded-3xl border border-line bg-shell/90 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
          {mode && (
            <nav aria-label="Account" className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
              <Link
                href={`/account/sign-up${q}`}
                aria-current={mode === "sign-up" ? "page" : undefined}
                className={`rounded-lg py-2 text-center transition-colors ${mode === "sign-up" ? "bg-shell text-ink shadow-sm" : "text-ink-dim hover:text-ink"}`}
              >
                Create account
              </Link>
              <Link
                href={`/account/login${q}`}
                aria-current={mode === "login" ? "page" : undefined}
                className={`rounded-lg py-2 text-center transition-colors ${mode === "login" ? "bg-shell text-ink shadow-sm" : "text-ink-dim hover:text-ink"}`}
              >
                Sign in
              </Link>
            </nav>
          )}

          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{smallTalk}</p>
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-xs text-ink-dim">{footer}</div>}
      </div>
    </div>
  );
}

function headingFor(next: string | undefined): { icon: string; text: string; tone: string } | null {
  const path = next?.split("?")[0];
  if (path?.startsWith("/offer/")) {
    return { icon: "★", text: "Your offer — checkout is next", tone: "border-gold/40 bg-gold/10 text-gold" };
  }
  if (path === "/account/billing") {
    const vip = next?.includes("plan=vip");
    return { icon: "→", text: `${vip ? "VIP" : "Your plan"} — checkout is next`, tone: "border-brand/30 bg-brand/10 text-brand" };
  }
  return null;
}

/**
 * A football pitch in hairlines, fading out toward the edges, over a fine
 * dot grain and a soft volt glow. Decorative only.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-canvas" />
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="absolute left-1/2 top-[-20%] h-[70%] w-[120%] -translate-x-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-brand)_14%,transparent),transparent)]" />
      <svg
        viewBox="0 0 680 1050"
        className="absolute left-1/2 top-1/2 h-[135%] w-auto -translate-x-1/2 -translate-y-1/2 text-line-strong [mask-image:radial-gradient(closest-side,black_35%,transparent)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="20" y="20" width="640" height="1010" rx="4" />
        <line x1="20" y1="525" x2="660" y2="525" />
        <circle cx="340" cy="525" r="92" />
        <circle cx="340" cy="525" r="4" fill="currentColor" />
        <rect x="138" y="20" width="404" height="166" />
        <rect x="248" y="20" width="184" height="56" />
        <path d="M268 186a92 92 0 0 0 144 0" />
        <rect x="138" y="864" width="404" height="166" />
        <rect x="248" y="974" width="184" height="56" />
        <path d="M268 864a92 92 0 0 1 144 0" />
      </svg>
    </div>
  );
}
