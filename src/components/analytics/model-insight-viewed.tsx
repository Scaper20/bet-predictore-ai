"use client";

import { useEffect } from "react";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { trackClient } from "@/lib/mixpanel/client";
import { accuracyBucket } from "@/lib/mixpanel/events";

/**
 * model_performance_viewed: fires once per match page view where the model's
 * numbers are on screen. Renders nothing.
 *
 * accuracy_score_bucket is the model's own 0-100 confidence in the pick shown
 * (high 70+, medium 50-69, low under 50), or "unrated" when the page has no
 * publishable pick. It waits for the account lookup so the tier is the real one.
 */
export function ModelInsightViewed({
  matchId,
  live,
  confidence,
  league,
}: {
  matchId: string;
  live: boolean;
  confidence: number | null | undefined;
  league: string;
}) {
  const { entitlement, loading } = useEntitlement();
  const tier = entitlement.tier;
  useEffect(() => {
    if (loading) return;
    trackClient("model_performance_viewed", {
      insight_type: live ? "live_insight" : "pre_match_prediction",
      accuracy_score_bucket: accuracyBucket(confidence),
      current_tier: tier,
      region_league: league,
    });
    // Once per match opened, not on every tier or live-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, loading]);
  return null;
}
