/**
 * Which signed-in users are on a paid plan right now, so a push follows the
 * same free/paid line as the pages (lib/access.ts). Mirrors
 * entitlements.ts's resolveSubscriptionTier: a pass until it expires, Pro
 * and VIP through the period already paid for.
 */
export function paidUserIds(
  rows: { user_id: string; tier: string; status: string; current_period_end: string | null; pass_expires_at: string | null }[],
  now = new Date(),
): Set<string> {
  const paid = new Set<string>();
  for (const r of rows) {
    if (r.status === "none") continue;
    if (r.tier === "pass") {
      if (r.pass_expires_at && new Date(r.pass_expires_at) > now) paid.add(r.user_id);
    } else if (r.tier === "pro" || r.tier === "vip") {
      if (r.current_period_end ? new Date(r.current_period_end) > now : r.status === "active") paid.add(r.user_id);
    }
  }
  return paid;
}
