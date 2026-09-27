import type { Tier, Entitlement } from "@/lib/entitlements";

const RANK: Record<Tier, number> = { free: 0, pass: 1, pro: 2, vip: 3 };

/** Highest-ranked tier among a set of currently-live gifts, or null if
 * there are none. An admin gifting the same person twice (or a second
 * gift landing before the first expires) is the only way to have more
 * than one live row — always resolve to whichever gives the most. */
export function bestGiftTier(gifts: { tier: Tier }[]): Tier | null {
  if (gifts.length === 0) return null;
  return gifts.reduce<Tier>((best, g) => (RANK[g.tier] > RANK[best] ? g.tier : best), gifts[0].tier);
}

/**
 * The tier/status actually granted once a live gift is folded in — the
 * higher of what's paid for and what's been gifted. A gift never lowers
 * access, and never overrides a real subscription that already beats it
 * (e.g. a paying VIP gifted a Pro trial keeps VIP, and the gift is simply
 * moot until/unless the real subscription lapses first).
 */
export function effectiveEntitlement(
  base: Pick<Entitlement, "tier" | "status">,
  giftTier: Tier | null,
): Pick<Entitlement, "tier" | "status"> {
  if (giftTier && RANK[giftTier] > RANK[base.tier]) {
    return { tier: giftTier, status: "active" };
  }
  return base;
}
