import "server-only";

import { NextResponse } from "next/server";

/**
 * Guards shared by the /api/push routes, which a browser calls on its own
 * behalf, signed in or not.
 *
 * Same-origin only. The JSON content type already forces a CORS preflight
 * on any cross-site fetch (which nothing here answers), and Sec-Fetch-Site
 * covers the one shape that skips it — a cross-site form posting text/plain —
 * which would otherwise let another site tie a device to the visitor's
 * account.
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "Cross-site request" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  return null;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}
