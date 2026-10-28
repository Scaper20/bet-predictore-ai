import { NextResponse } from "next/server";
import { getEntitlement, meets } from "@/lib/entitlements";
import { markVipChatOpened, vipChatMember, vipChatSettings } from "@/lib/vip-chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only way to the VIP chat's invite link: checks the plan and the saved
 * number on every visit, stamps the visit for the admin roster, then sends
 * the member on to WhatsApp. Anyone else goes back to /vip, which says what
 * is missing. The link itself never appears in a page.
 */
export async function GET(request: Request) {
  const back = () => NextResponse.redirect(new URL("/vip", request.url), { headers: { "Cache-Control": "private, no-store" } });

  const ent = await getEntitlement();
  if (!ent.userId) return NextResponse.redirect(new URL("/account/login?next=/vip", request.url));
  // A day pass is VIP on the site only, not a seat in the chat.
  if (!meets(ent.tier, "vip") || ent.dayPassOnly) return back();

  const [member, settings] = await Promise.all([vipChatMember(ent.userId), vipChatSettings()]);
  if (!member) return back();
  if (!settings.inviteUrl) return back();

  await markVipChatOpened(ent.userId, member);
  return NextResponse.redirect(settings.inviteUrl, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
