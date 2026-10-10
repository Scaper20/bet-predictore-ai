"use client";

import { kickoffDay, kickoffTime, relativeDay } from "@/lib/format";
import { useTimeZone } from "@/lib/use-visitor";

/**
 * A time in the visitor's own zone, for Server Components (which render once
 * for everyone and can't know it). Shows WAT on the server and while
 * hydrating, then the visitor's zone (lib/use-visitor.ts).
 *
 *   time     "20:00"
 *   day      "Sun, 11 Oct"
 *   relative "Today" / "Tomorrow" / "Sun, 11 Oct"
 *   dayTime  "Sun, 11 Oct · 20:00"
 *
 * `options` formats with any Intl options instead, in the visitor's zone.
 */
export function LocalTime({
  iso,
  kind = "time",
  options,
}: {
  iso: string;
  kind?: "time" | "day" | "relative" | "dayTime";
  options?: Intl.DateTimeFormatOptions;
}) {
  const tz = useTimeZone();
  const text = options
    ? new Date(iso).toLocaleString("en-NG", { ...options, timeZone: tz })
    : kind === "day"
      ? kickoffDay(iso, tz)
      : kind === "relative"
        ? relativeDay(iso, new Date(), tz)
        : kind === "dayTime"
          ? `${kickoffDay(iso, tz)} · ${kickoffTime(iso, tz)}`
          : kickoffTime(iso, tz);
  return <time dateTime={iso}>{text}</time>;
}
