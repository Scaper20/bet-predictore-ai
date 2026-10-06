import "server-only";

import { getEntitlement } from "@/lib/entitlements";
import { freeStrongPickId } from "@/lib/service";
import { isPaidTier, type Viewer } from "@/lib/access";

/** Who is looking, for access.ts: paid or not, and today's free Strong pick. */
export async function getViewer(): Promise<Viewer> {
  const entitlement = await getEntitlement();
  if (isPaidTier(entitlement.tier)) return { paid: true, freeStrongId: null };
  return { paid: false, freeStrongId: await freeStrongPickId() };
}

/** The same, for a caller that already has the tier. */
export async function viewerForTier(tier: string): Promise<Viewer> {
  if (isPaidTier(tier)) return { paid: true, freeStrongId: null };
  return { paid: false, freeStrongId: await freeStrongPickId() };
}
