"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ViewedPrediction } from "@/lib/access";
import { HalvesPanel } from "@/components/match/market-panels";
import { HalfExtrasPanel } from "@/components/match/stat-panels";
import { LockedPreview } from "@/components/entitlements/account-gate";
import { GatedPanelSkeleton } from "@/components/match/gated-panel-states";
import { AsianHandicapClient } from "@/components/match/asian-handicap-client";

/**
 * What this viewer may see on a match page, fetched once.
 *
 * The page itself is cached and shared, so it is rendered with the free view
 * (lib/access.ts): 1X2 open, every other market and a non-1X2 or Strong pick
 * locked. This asks the entitlement-checked /api/match/[id] for the viewer's
 * own view and every locked section on the page reads it from here, so a
 * paid viewer's unlocked numbers come from the server only after it has
 * checked their plan.
 */
interface Access {
  state: "loading" | "ready" | "error";
  prediction: ViewedPrediction | null;
}

const MatchAccessContext = createContext<Access>({ state: "loading", prediction: null });

export function MatchAccessProvider({ matchId, children }: { matchId: string; children: ReactNode }) {
  const [access, setAccess] = useState<Access>({ state: "loading", prediction: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match/${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { prediction: ViewedPrediction }) => {
        if (!cancelled) setAccess({ state: "ready", prediction: json.prediction });
      })
      .catch(() => {
        if (!cancelled) setAccess({ state: "error", prediction: null });
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  return <MatchAccessContext.Provider value={access}>{children}</MatchAccessContext.Provider>;
}

export function useMatchAccess(): Access {
  return useContext(MatchAccessContext);
}

const UPGRADE_HREF = "/account/billing?plan=pro";

/** The Pro extras: half-time markets and Asian handicap; a teaser for everyone else. */
export function ProMarkets() {
  const { state, prediction } = useMatchAccess();
  if (state === "loading") return <GatedPanelSkeleton rows={4} />;
  if (!prediction || !prediction.markets.halves) {
    return (
      <LockedPreview>
        <span className="rounded-full bg-violet/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-violet">
          Pro
        </span>
        <p className="mt-2 font-display text-lg font-bold leading-snug text-ink">Half-time markets, half-by-half goals and Asian handicap</p>
        <Link
          href={UPGRADE_HREF}
          className="glow-brand mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-strong"
        >
          Unlock with Pro <span aria-hidden>→</span>
        </Link>
      </LockedPreview>
    );
  }
  return (
    <div className="space-y-5">
      <HalvesPanel prediction={prediction} />
      <HalfExtrasPanel prediction={prediction} />
      <AsianHandicapClient matchId={prediction.match.id} />
    </div>
  );
}
