"use client";

import { openTour } from "@/lib/tour";

/** Replays the walkthrough (components/tour/tour-overlay.tsx). */
export function TourButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={openTour} className={className}>
      Take the 30-second tour
    </button>
  );
}
