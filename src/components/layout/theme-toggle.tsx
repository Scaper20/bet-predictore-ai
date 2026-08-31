"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { setTheme as setThemeAction } from "@/app/actions/theme";

type Theme = "dark" | "light";

const COOKIE = "theme";

function readCookieTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const match = document.cookie.match(/(?:^|; )theme=(dark|light)/);
  return match?.[1] === "light" ? "light" : "dark";
}

// Nothing outside this component mutates the cookie while it's mounted, so
// there is nothing to subscribe to — this pair exists purely to give
// useSyncExternalStore a hydration-safe way to read the cookie once: the
// server snapshot matches layout.tsx's static "dark" default, and the real
// value is read only after hydration, avoiding a mismatch warning.
function subscribeNoop() {
  return () => {};
}
function getServerSnapshotTheme(): Theme {
  return "dark";
}

function applyThemeLocally(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Mount reads the current theme from the cookie set by the beforeInteractive
 * script in layout.tsx (see that file for why theme isn't read via cookies()
 * server-side — it would force the whole app out of static rendering).
 */
export function ThemeToggle() {
  const initialTheme = useSyncExternalStore(subscribeNoop, readCookieTheme, getServerSnapshotTheme);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyThemeLocally(next); // instant repaint, no round trip
    startTransition(() => {
      setThemeAction(next); // persists server-side + syncs profiles.theme_preference if signed in
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
