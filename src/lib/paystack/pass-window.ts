import type { PassLength } from "@/lib/pricing";

/**
 * Weekend Pass expiry rule, confirmed by the owner: access runs Friday
 * through Monday inclusive (covers Monday Night Football-style fixtures,
 * not just the Sat/Sun slate). A Pass always expires at the end of the
 * current-or-next Monday, 23:59:59 WAT, regardless of which day it's bought
 * on — a Tuesday purchase covers the upcoming Fri-Mon in full; a Saturday
 * purchase covers only the remaining Sat-Mon, not a fresh 4 days.
 */

const WAT_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1 year-round, no DST.
const HOUR = 60 * 60 * 1000;

export function computeWeekendPassExpiry(purchaseDate: Date): Date {
  const wat = new Date(purchaseDate.getTime() + WAT_OFFSET_MS);
  const day = wat.getUTCDay(); // 0 = Sunday .. 6 = Saturday, in WAT wall-clock terms
  const daysUntilMonday = (1 - day + 7) % 7;

  const mondayEndWat = new Date(
    Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate() + daysUntilMonday, 23, 59, 59, 999)
  );

  return new Date(mondayEndWat.getTime() - WAT_OFFSET_MS);
}

/**
 * When a pass bought now runs out. Day and Week passes run from the moment of
 * purchase (24 hours, 7 days); the Weekend pass keeps its Fri–Mon rule.
 *
 * A pass bought while another is still running never shortens it: the later
 * of the two expiries wins, so a Day pass bought mid-Week does not cut the
 * week short.
 */
export function computePassExpiry(length: PassLength, purchaseDate: Date, current?: Date | null): Date {
  const next =
    length === "day"
      ? new Date(purchaseDate.getTime() + 24 * HOUR)
      : length === "week"
        ? new Date(purchaseDate.getTime() + 7 * 24 * HOUR)
        : computeWeekendPassExpiry(purchaseDate);
  return current && current > next ? current : next;
}
