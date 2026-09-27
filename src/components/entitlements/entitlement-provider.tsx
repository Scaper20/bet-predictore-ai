"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Entitlement, Tier } from "@/lib/entitlements";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearSlip } from "@/lib/slip";

const EntitlementContext = createContext<{
  entitlement: Entitlement;
  loading: boolean;
  refresh: () => Promise<void>;
}>({
  entitlement: { tier: "free", status: "none", signedIn: false, email: null },
  loading: true,
  refresh: async () => {},
});

/**
 * Fetches the current user's tier (via /api/entitlements) and shares it with
 * every component under it. Automatically listens for Supabase auth state changes
 * (sign in, sign out, token refresh) to update context and UI in real time.
 */
export function EntitlementProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Entitlement;
}) {
  const [entitlement, setEntitlement] = useState<Entitlement>(
    initial ?? { tier: "free", status: "none", signedIn: false, email: null }
  );
  const [loading, setLoading] = useState(!initial);

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

