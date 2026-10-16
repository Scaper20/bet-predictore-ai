/**
 * Booking-code allowances per plan, in one place so the pricing rework only
 * changes numbers here.
 *
 * The generator books one code per person, two parse.bot credits each, so it
 * is sold as a weekly allowance rather than unlimited. Weekly rather than
 * monthly so one heavy weekend cannot spend a member's whole month, and so
 * the daily credit cap is never hit by a few people at once.
 */

import type { Tier } from "@/lib/entitlements";

export const GENERATOR_ALLOWANCE: { tier: Extract<Tier, "pro" | "vip">; label: string; perWeek: number }[] = [
  { tier: "pro", label: "Pro", perWeek: 2 },
  { tier: "vip", label: "VIP", perWeek: 6 },
];
