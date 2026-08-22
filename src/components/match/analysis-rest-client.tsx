"use client";

import { useEffect, useState } from "react";
import { AnalysisRest } from "./analysis-panel";
import { GatedPanelSkeleton, GatedPanelUnavailable } from "./gated-panel-states";

interface ApiAnalysis {
  analysis: { body: string[]; factors: string[] };
  entitlement: { tier: "free" | "pass" | "pro" | "vip" };
}

/** Fetches the rest of the AI-written analysis from the entitlement-checked
 * /api/match/[id] route — see analysis-panel.tsx for why this can't be a
 * server-passed prop. */
export function AnalysisRestClient({ matchId }: { matchId: string }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [data, setData] = useState<ApiAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match/${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: ApiAnalysis) => {
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

  if (state === "loading") return <GatedPanelSkeleton rows={3} />;
  if (state === "error" || !data) return <GatedPanelUnavailable label="the rest of this analysis" />;
  if (data.entitlement.tier === "free") return null;

  // index 0 is the already-shown free lead paragraph.
  const rest = data.analysis.body.slice(1);
  if (rest.length === 0 && data.analysis.factors.length === 0) return null;

  return <AnalysisRest body={rest} factors={data.analysis.factors} />;
}
