import "server-only";

import { cookies } from "next/headers";
import { refresh } from "next/cache";

/**
 * Called by the sign-in, sign-up and sign-out actions just before they
 * redirect, so the open app updates at once instead of after a reload.
 *
 * - bx_auth is the client-readable "is there a session" hint (proxy.ts keeps
 *   it on every request). The proxy runs before the action changes the
 *   session, and a server action's redirect can render the next page in the
 *   same response, so without setting it here the hint stayed on the old
 *   value until some later request. EntitlementProvider watches this cookie
 *   and re-reads the account the moment it flips.
 * - refresh() drops this visitor's client router cache, so pages already
 *   visited are fetched again rather than shown as they were. It touches only
 *   this browser: the server's cached pages carry no personal data and stay.
 *
 * Only a hint, never an authorisation (see use-auth-hint.ts).
 */
export async function markAuthChange(signedIn: boolean): Promise<void> {
  (await cookies()).set("bx_auth", signedIn ? "1" : "0", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  refresh();
}
