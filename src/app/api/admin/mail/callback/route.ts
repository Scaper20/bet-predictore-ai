import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { exchangeCodeForConnection, isMailAdmin, saveConnection } from "@/lib/admin-mail";
import { OAUTH_STATE_COOKIE } from "../connect/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const to = (query: string) => NextResponse.redirect(new URL(`/admin/mail?${query}`, url.origin));

  const gate = await checkAdmin();
  if (!gate.ok || !isMailAdmin(gate.identity.email)) return to("error=forbidden");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  // Missing/mismatched state means this request didn't originate from the
  // connect link this browser was just sent to — refuse rather than exchange
  // a code on the caller's behalf without that proof.
  if (!code || !state || !cookieState || state !== cookieState) {
    return to("error=invalid_state");
  }

  const connection = await exchangeCodeForConnection(code);
  if (!connection) return to("error=exchange_failed");

  await saveConnection(gate.identity.id, connection.email, connection.refreshToken);
  await logAdminAction(gate.identity, "mail.connected", connection.email);

  const res = to("connected=1");
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
