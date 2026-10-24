"use client";

import { useEffect } from "react";
import { useTrackedSlips } from "@/lib/tracked-slips";
import { PUSH_CHANGED_EVENT } from "./push";
import { syncSlips } from "./push-slips";

/**
 * Mirrors the tracked slips to the server for notifications (push-slips.ts).
 * Renders nothing. Runs when the app opens, whenever a slip is added,
 * removed or settles a leg, and when this device switches notifications on.
 */
export function TrackedSlipsPushSync() {
  const slips = useTrackedSlips();

  useEffect(() => {
    void syncSlips(slips);
    const onChange = () => void syncSlips(slips);
    window.addEventListener(PUSH_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PUSH_CHANGED_EVENT, onChange);
  }, [slips]);

  return null;
}
