import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { offerBySlug, offerStateFor, startOfferCheckout } from "@/lib/offers-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Where this visitor stands with the popup offers (lib/offers.ts): an offer, a running pass, or neither. */
export async function GET() {
  const ent = await getEntitlement();
  return NextResponse.json(await offerStateFor(ent), { headers: NO_STORE });
}

/**
 * Starts an offer's checkout: { slug, r? }, where r is the campaign
 * recipient an email offer's link carries. Eligibility is checked again on
 * the server (offers-server.ts eligibility); the webhook or the callback
 * page grants the pass.
 */
export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as { slug?: unknown; r?: unknown };
  const slug = typeof body.slug === "string" && /^[a-z0-9-]{2,40}$/.test(body.slug) ? body.slug : null;
  if (!slug) return NextResponse.json({ error: "Unknown offer." }, { status: 400, headers: NO_STORE });
  const [ent, offer] = await Promise.all([getEntitlement(), offerBySlug(slug)]);
  if (!offer) return NextResponse.json({ error: "This offer has closed." }, { status: 404, headers: NO_STORE });
  const result = await startOfferCheckout(offer, ent, typeof body.r === "string" ? body.r : null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  return NextResponse.json({ authorization_url: result.url }, { headers: NO_STORE });
}
