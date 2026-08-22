"use client";

import { useEffect, useState } from "react";
import type { Match } from "@/lib/types";
import type { AsianHandicapLine } from "@/lib/model/poisson";
import { AsianHandicapPanel } from "./market-panels";
import { GatedPanelSkeleton, GatedPanelUnavailable } from "./gated-panel-states";

interface ApiMatchDetail {
  match: Match;
  prediction: { asianHandicap: AsianHandicapLine[] };
  entitlement: { tier: "free" | "pass" | "pro" | "vip" };
}

/**
 * Fetches its own Asian Handicap data from /api/match/[id] instead of
 * receiving it as a server-passed prop. The page that renders this stays
 * ISR-cached (see match/[id]/page.tsx) precisely because it never computes
 * these values into its own render for a given viewer — this component's
 * fetch, scoped to the browser's own session cookie, is what the real
 * per-viewer entitlement check now happens against (the API route redacts
 * server-side; this isn't just a nicer loading state).
 */
export function AsianHandicapClient({ matchId }: { matchId: string }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [data, setData] = useState<ApiMatchDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match/${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: ApiMatchDetail) => {
        if (!cancelled) {
          setData(json);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (state === "loading") return <GatedPanelSkeleton title="Asian handicap" rows={4} />;
  if (state === "error" || !data) return <GatedPanelUnavailable label="Asian handicap lines" />;
  // Trust the server's answer, not the fact that Gate already let this
  // mount — a lapsed entitlement between page load and this fetch should
  // still see nothing here, not a stale "unlocked" view.
  if (data.entitlement.tier === "free") return null;

  return <AsianHandicapPanel asianHandicap={data.prediction.asianHandicap} match={data.match} />;
}
