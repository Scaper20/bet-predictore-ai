import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're offline",
  robots: { index: false, follow: false },
};

// Precached by the service worker at install, so it has to be a plain static
// document: no data fetching, and nothing that needs JavaScript to work.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="font-display text-4xl font-extrabold">
        Betri<span className="text-brand">X</span>
      </span>
      <h1 className="font-display text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        BetriX needs a connection for live scores and fresh predictions. Pages you opened recently
        still work offline. Everything else will load as soon as you&apos;re back online.
      </p>
      {/* A full page load, not <Link>: retrying has to go back through the
          network (and the service worker), not fetch an RSC payload that
          fails the same way offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/football/predictions"
        className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-ink"
      >
        Try again
      </a>
    </main>
  );
}
