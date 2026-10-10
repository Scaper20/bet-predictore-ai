import "server-only";

import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { guestIdentity } from "@/lib/ask/guest";

/**
 * Who is loving or commenting: the signed-in account, or a guest known only
 * by a private per-browser cookie (stored as a salted hash, never raw).
 *
 * Loves and comments are open to everyone (0047_guest_social.sql). The
 * social routes write with the service role, so this is the only place an
 * identity comes from: the verified session, or the cookie the server set.
 * Never the request body.
 */
export interface SocialIdentity {
  userId: string | null;
  /** Hashed guest id; null when signed in, or when reading without one yet. */
  guestKey: string | null;
  /** Hashed network address, for the guest rate limit. */
  ipKey: string;
  /** Set-Cookie to send when this browser just got its guest id. */
  setCookie: string | null;
}

/**
 * `mint`: give a cookie-less visitor a guest id (writes). Reads pass false,
 * so merely viewing never sets a cookie.
 */
export async function socialIdentity(request: Request, mint: boolean): Promise<SocialIdentity> {
  let userId: string | null = null;
  if (supabaseConfigured) {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }
  const g = guestIdentity(request, "social");
  if (userId) return { userId, guestKey: null, ipKey: g.ipKey, setCookie: null };
  if (g.setCookie && !mint) return { userId: null, guestKey: null, ipKey: g.ipKey, setCookie: null };
  return { userId: null, guestKey: g.deviceKey, ipKey: g.ipKey, setCookie: g.setCookie };
}

const RESERVED = /kiqstat|betrix|admin|support|moderator|official|\boma\b/i;

/** A guest's nickname, or an error to show. */
export function checkNickname(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 24) return { ok: false, error: "Pick a name of 2 to 24 characters." };
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) return { ok: false, error: "Use letters, numbers, spaces, dots, dashes or underscores." };
  if (RESERVED.test(name)) return { ok: false, error: "That name is reserved. Pick another." };
  return { ok: true, name };
}

export function withCookie(response: Response, identity: SocialIdentity): Response {
  if (identity.setCookie) response.headers.append("Set-Cookie", identity.setCookie);
  return response;
}
