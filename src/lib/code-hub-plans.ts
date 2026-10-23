/**
 * Booking-code allowances per plan, in one place so the pricing rework only
 * changes numbers here.
 *
 * A member's own codes (from the slip, Forge, a tracked combo or a match
 * page) are a paid perk, sold as a weekly allowance. Booking itself now costs
 * nothing (it goes straight to SportyBet), so the allowance is a product
 * choice, not a cost guard: weekly rather than monthly so one heavy weekend
 * cannot spend a member's whole month. Free and day-pass users get none.
 *
 * "A week" is rolling: each code frees its slot seven days after it was
 * given. A code the member already holds for the same picks is handed back
 * again without using another slot.
 */

import type { Tier } from "@/lib/entitlements";

export const GENERATOR_ALLOWANCE: { tier: Extract<Tier, "pro" | "vip">; label: string; perWeek: number }[] = [
  { tier: "pro", label: "Pro", perWeek: 2 },
  { tier: "vip", label: "VIP", perWeek: 6 },
];

export const ALLOWANCE_WINDOW_MS = 7 * 86_400_000;

/** Codes a plan may get in any seven days. */
export function weeklyCodeAllowance(tier: Tier): number {
  return GENERATOR_ALLOWANCE.find((a) => a.tier === tier)?.perWeek ?? 0;
}

export interface AllowanceState {
  allowance: number;
  used: number;
  remaining: number;
  /** When the oldest code in the window frees its slot (epoch ms), if the allowance is spent. */
  nextFreeAt: number | null;
}

/**
 * Where a member stands, from the times their distinct codes were first given.
 * Pure, so the rolling window is tested without a database.
 */
export function allowanceState(tier: Tier, givenAt: readonly number[], now = Date.now()): AllowanceState {
  const allowance = weeklyCodeAllowance(tier);
  const inWindow = givenAt.filter((t) => t > now - ALLOWANCE_WINDOW_MS).sort((a, b) => a - b);
  const used = inWindow.length;
  const remaining = Math.max(0, allowance - used);
  return {
    allowance,
    used,
    remaining,
    nextFreeAt: remaining === 0 && allowance > 0 && inWindow.length ? inWindow[used - allowance] + ALLOWANCE_WINDOW_MS : null,
  };
}
