import "server-only";

import { getEntitlement } from "@/lib/entitlements";
import { freeViewer } from "@/lib/service";
import { isPaidTier, PAID_VIEWER, type Viewer } from "@/lib/access";

/** Who is looking, for access.ts: paid, or free with today's free picks. */
export async function getViewer(): Promise<Viewer> {
  const entitlement = await getEntitlement();
  return viewerForTier(entitlement.tier);
}

/** The same, for a caller that already has the tier. */
export async function viewerForTier(tier: string): Promise<Viewer> {
  return isPaidTier(tier) ? PAID_VIEWER : freeViewer();
}
