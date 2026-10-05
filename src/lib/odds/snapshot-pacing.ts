import { QUOTA_RESERVE } from "./budget";

const HOUR = 60 * 60 * 1000;

/**
 * Whether a stored Odds API board is due a refresh.
 *
 * The free plan is 500 credits a month and a board costs one. Refreshing all
 * twenty boards on a fixed timer would spend the month in days, so what is
 * left (less the reserve) is spread evenly over the days left in the month,
 * never more often than every three hours, and only for competitions with
 * games coming up.
 */
export function oddsApiBoardDue(args: {
  boards: number;
  remaining: number | null;
  lastFetched: number | null;
  hasUpcoming: boolean;
  now?: number;
}): boolean {
  const now = args.now ?? Date.now();
  if (!args.hasUpcoming) return false;
  const age = args.lastFetched === null ? Number.POSITIVE_INFINITY : now - args.lastFetched;
  if (args.remaining === null) return age >= 12 * HOUR;

  const spendable = args.remaining - QUOTA_RESERVE;
  if (spendable < 1) return false;

  const d = new Date(now);
  const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const msLeft = Math.max(HOUR, monthEnd - now);
  const refreshesPerBoard = Math.max(1, Math.floor(spendable / Math.max(1, args.boards)));
  const interval = Math.max(3 * HOUR, msLeft / refreshesPerBoard);
  return age >= interval;
}
