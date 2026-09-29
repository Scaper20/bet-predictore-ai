import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { buildAuthUrl, isMailAdmin, mailOAuthConfigured } from "@/lib/admin-mail";

export const dynamic = "force-dynamic";

/** Read on the callback to reject a code exchange that didn't originate from this same browser round trip. */
export const OAUTH_STATE_COOKIE = "admin_mail_oauth_state";

export async function GET(request: NextRequest) {
  const gate = await checkAdmin();
  if (!gate.ok || !isMailAdmin(gate.identity.email) || !mailOAuthConfigured()) {
    return NextResponse.redirect(new URL("/admin/mail", request.url));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
