/**
 * Named kickoff windows in Lagos time — "today", "tonight", "the weekend" —
 * shared by Ask BetriX and Forge so both mean the same thing by them.
 */

import { APP_TIMEZONE, appDayBounds } from "@/lib/format";

export const KICKOFF_WINDOWS = ["live", "today", "tonight", "tomorrow", "weekend", "next_3_days", "next_7_days"] as const;
export type KickoffWindow = (typeof KICKOFF_WINDOWS)[number];

export const isKickoffWindow = (v: unknown): v is KickoffWindow =>
  typeof v === "string" && (KICKOFF_WINDOWS as readonly string[]).includes(v);

/** [start, end) in epoch ms. "Today" reaches back three hours so games in play still count. */
export function windowFor(when: KickoffWindow, now = new Date()): [number, number] {
  const today = appDayBounds(now);
  switch (when) {
    case "live":
    case "today":
      return [now.getTime() - 3 * 3600_000, today.end.getTime()];
    case "tonight": {
      const evening = today.start.getTime() + 16 * 3600_000; // 16:00 WAT
      return [Math.max(now.getTime(), evening), today.end.getTime() + 4 * 3600_000];
    }
    case "tomorrow": {
      const t = appDayBounds(now, 1);
      return [t.start.getTime(), t.end.getTime()];
    }
    case "weekend": {
      const dow = new Date(now.toLocaleString("en-US", { timeZone: APP_TIMEZONE })).getDay(); // 0 Sun … 6 Sat
      const toSat = dow === 0 ? -1 : 6 - dow;
      const sat = appDayBounds(now, toSat);
      return [Math.max(now.getTime(), sat.start.getTime()), sat.start.getTime() + 2 * 86_400_000];
    }
    case "next_3_days":
      return [now.getTime(), today.start.getTime() + 3 * 86_400_000];
    default:
      return [now.getTime() - 3 * 3600_000, now.getTime() + 7 * 86_400_000];
  }
}
