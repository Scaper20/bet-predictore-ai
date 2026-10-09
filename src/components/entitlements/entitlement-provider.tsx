"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Entitlement, Tier } from "@/lib/entitlements";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearSlip } from "@/lib/slip";
import { AUTH_HINT_EVENT, readAuthHintCookie } from "@/components/entitlements/use-auth-hint";

const EntitlementContext = createContext<{
  entitlement: Entitlement;
  loading: boolean;
  refresh: () => Promise<void>;
}>({
  entitlement: { tier: "free", status: "none", signedIn: false, email: null, displayName: null, userId: null },
  loading: true,
  refresh: async () => {},
});

/**
 * Fetches the current user's tier (via /api/entitlements) and shares it with
 * every component under it, and re-reads it whenever the session changes.
 *
 * Two signals, because sign-in and sign-out run as server actions: the
 * browser's Supabase client never hears about a session the server changed,
 * so onAuthStateChange alone left the header showing the old state until a
 * full reload (and the installed app has no reload button). The other is the
 * bx_auth cookie, which the auth actions set (lib/auth-hint-server.ts): it is
 * checked on every navigation and whenever the app comes back into view, and
 * a change triggers a fresh read at once.
 */
export function EntitlementProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Entitlement;
}) {
  const [entitlement, setEntitlement] = useState<Entitlement>(
    initial ?? { tier: "free", status: "none", signedIn: false, email: null, displayName: null, userId: null }
  );
  const [loading, setLoading] = useState(!initial);
  const pathname = usePathname();
  // undefined: not read yet. null: read, and no cookie (a first visit).
  const lastHint = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/entitlements", { cache: "no-store" });
      if (res.ok) {
        const data: Entitlement = await res.json();
        setEntitlement(data);
      }
    } catch {
      // Fail closed — stays on current state
    } finally {
      setLoading(false);
    }
  }, []);

  // The session flipped since we last looked (a sign-in or sign-out, here or
  // in another tab): re-read the account and tell the header.
  const checkHint = useCallback(() => {
    const hint = readAuthHintCookie();
    if (lastHint.current === undefined) {
      lastHint.current = hint;
      return;
    }
    if (hint === lastHint.current) return;
    const wasSignedIn = lastHint.current === "1";
    lastHint.current = hint;
    if (wasSignedIn && hint === "0") clearSlip();
    window.dispatchEvent(new Event(AUTH_HINT_EVENT));
    void refresh();
  }, [refresh]);

  useEffect(() => {
    checkHint();
  }, [pathname, checkHint]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") checkHint();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkHint);
    window.addEventListener("pageshow", checkHint);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkHint);
      window.removeEventListener("pageshow", checkHint);
    };
  }, [checkHint]);

  useEffect(() => {
    let cancelled = false;

    // Initial fetch if not server-provided
    if (!initial) {
      fetch("/api/entitlements", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: Entitlement) => {
          if (!cancelled) setEntitlement(data);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    // Subscribe to client-side auth state changes for instant UI synchronization
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const supabase = supabaseBrowser();
      const authRes = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          clearSlip();
        }
        if (!cancelled) {
          fetch("/api/entitlements", { cache: "no-store" })
            .then((r) => r.json())
            .then((data: Entitlement) => {
              if (!cancelled) setEntitlement(data);
            })
            .catch(() => {});
        }
      });
      subscription = authRes.data.subscription;
    } catch {
      // If Supabase client is unconfigured, fallback gracefully
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [initial]);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  return useContext(EntitlementContext);
}

const RANK: Record<Tier, number> = { free: 0, pass: 1, pro: 2, vip: 3 };
export function meetsTier(actual: Tier, required: Tier): boolean {
  return RANK[actual] >= RANK[required];
}

