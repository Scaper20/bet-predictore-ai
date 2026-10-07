"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ViewedPrediction } from "@/lib/access";
import { percent } from "@/lib/format";
import { BttsPanel, CorrectScorePanel, DoubleChancePanel, GoalsPanel, HalvesPanel } from "@/components/match/market-panels";
import { LockedPreview } from "@/components/entitlements/account-gate";
import { ProTag } from "@/components/entitlements/locked-pick";
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

/**
 * The headline pick. `children` is the server-rendered locked version; once
 * the viewer's own view says the pick is open, the real one replaces it.
 */
export function PickUnlock({ children }: { children: ReactNode }) {
  const { prediction } = useMatchAccess();
  const pick = prediction?.topPick;
  if (!prediction || prediction.locked.pick || !pick) return <>{children}</>;
  return (
    <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <p className="font-display text-2xl font-bold text-ink sm:text-3xl">{pick.label}</p>
      <p className="tnum font-display text-3xl font-extrabold text-brand sm:text-4xl">{percent(pick.probability, 1)}</p>
    </div>
  );
}

/** The goals facts under the pick: locked chips until the markets are open. */
export function FactsUnlock() {
  const { prediction } = useMatchAccess();
  if (!prediction || prediction.locked.markets) {
    return (
      <Link
        href={UPGRADE_HREF}
        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-ink-muted transition-colors hover:border-violet/40"
      >
        <span>
          <span className="font-semibold text-ink">xG, over 2.5 and both teams to score</span> are Pro
        </span>
        <ProTag />
      </Link>
    );
  }
  const m = prediction.markets;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Fact label="xG" value={`${m.expectedGoals.home.toFixed(1)} – ${m.expectedGoals.away.toFixed(1)}`} />
      <Fact label="Over 2.5" value={percent(m.over["2.5"])} hot={m.over["2.5"] >= 0.6} />
      <Fact label="Both score" value={percent(m.bttsYes)} hot={m.bttsYes >= 0.6} />
    </div>
  );
}

function Fact({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${hot ? "border-brand/25 bg-brand/[0.06]" : "border-line bg-surface"}`}>
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className={`tnum mt-1 font-display text-lg font-bold sm:text-xl ${hot ? "text-brand" : "text-ink"}`}>{value}</p>
    </div>
  );
}

/** Every market beyond 1X2: open for Pro, a blurred preview for everyone else. */
export function ProMarkets() {
  const { state, prediction } = useMatchAccess();
  if (state === "loading") return <GatedPanelSkeleton rows={6} />;
  if (!prediction || prediction.locked.markets) {
    return (
      <LockedPreview>
        <span className="rounded-full bg-violet/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-violet">
          Pro
        </span>
        <p className="mt-2 font-display text-lg font-bold leading-snug text-ink">
          Goals, both teams to score, double chance, correct score, halves and Asian handicap
        </p>
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
      <GoalsPanel prediction={prediction} />
      <div className="grid gap-5 sm:grid-cols-2">
        <BttsPanel prediction={prediction} />
        <DoubleChancePanel prediction={prediction} />
      </div>
      <CorrectScorePanel prediction={prediction} />
      <HalvesPanel prediction={prediction} />
      <AsianHandicapClient matchId={prediction.match.id} />
    </div>
  );
}
