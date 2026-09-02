"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Entitlement, Tier } from "@/lib/entitlements";

const EntitlementContext = createContext<{ entitlement: Entitlement; loading: boolean }>({
  entitlement: { tier: "free", status: "none", signedIn: false },
  loading: true,
});

/**
 * Fetches the current user's tier once (via /api/entitlements) and shares it
 * with every <Gate> under it, so a page with several gated widgets makes one
 * request instead of one per widget.
 *
 * `initial`, when passed from a server-rendered parent that already resolved
 * the tier server-side, skips that fetch entirely — prefer that path;
 * this provider's own fetch is the fallback for client-only trees.
 */
export function EntitlementProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Entitlement;
}) {
  const [entitlement, setEntitlement] = useState<Entitlement>(initial ?? { tier: "free", status: "none", signedIn: false });
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/entitlements")
      .then((r) => r.json())
      .then((data: Entitlement) => {
        if (!cancelled) setEntitlement(data);
      })
      .catch(() => {
        // Fail closed — stays on the free default.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading }}>{children}</EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  return useContext(EntitlementContext);
}

const RANK: Record<Tier, number> = { free: 0, pass: 1, pro: 2, vip: 3 };
export function meetsTier(actual: Tier, required: Tier): boolean {
  return RANK[actual] >= RANK[required];
}
