import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { APP_TIMEZONE } from "@/lib/format";
import { ASK_GUEST_TOTAL } from "@/lib/ask/request";

/**
 * Free tries for visitors without an account — Ask KiqStat's questions,
 * Forge's slips — per browser, ever, then the feature asks them to sign up.
 * Enforced here, not in the browser — see migration 0027 for the table and
 * why the network cap is generous. Each feature counts under its own scope.
 */

export const GUEST_COOKIE = "bx_ask_guest";
/** Per network address per day. Carrier-grade NAT puts many phones behind one. */
const IP_DAILY = 40;
/** Lifetime counts are stored against this fixed day. */
const LIFETIME = "1970-01-01";

const hash = (kind: string, value: string) =>
  createHash("sha256")
    .update(`betrix-ask:${process.env.ASK_GUEST_SALT ?? ""}:${kind}:${value}`)
    .digest("hex");

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export interface GuestIdentity {
  deviceKey: string;
  ipKey: string;
  /** Set-Cookie value to send when this browser had no id yet. */
  setCookie: string | null;
}

export function guestIdentity(request: Request, scope = "ask"): GuestIdentity {
  const existing = readCookie(request, GUEST_COOKIE);
  const id = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    deviceKey: hash(`${scope}:device`, id),
    ipKey: hash(`${scope}:ip`, clientIp(request)),
    setCookie: id === existing ? null : `${GUEST_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  };
}

type Claim = { allowed: boolean; used: number };

async function claim(key: string, day: string, limit: number): Promise<Claim | null> {
  const { data, error } = await supabaseAdmin().rpc("ask_guest_claim", { p_key: key, p_day: day, p_limit: limit });
  const row = Array.isArray(data) ? (data[0] as Claim | undefined) : undefined;
  return error || !row ? null : row;
}

async function refundKey(key: string, day: string) {
  await supabaseAdmin()
    .rpc("ask_guest_refund", { p_key: key, p_day: day })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Claims one guest question. `null` means the allowance couldn't be checked
 * (not configured, database down) — the caller treats that as unavailable,
 * never as unlimited.
 */
export async function claimGuest(
  g: GuestIdentity,
  total = ASK_GUEST_TOTAL,
): Promise<{ allowed: boolean; used: number } | null> {
  try {
    const device = await claim(g.deviceKey, LIFETIME, total);
    if (!device) return null;
    if (!device.allowed) return { allowed: false, used: device.used };
    const network = await claim(g.ipKey, today(), IP_DAILY);
    if (!network) {
      await refundKey(g.deviceKey, LIFETIME);
      return null;
    }
    if (!network.allowed) {
      await refundKey(g.deviceKey, LIFETIME);
      return { allowed: false, used: total };
    }
    return device;
  } catch {
    return null;
  }
}

export async function refundGuest(g: GuestIdentity) {
  try {
    await Promise.all([refundKey(g.deviceKey, LIFETIME), refundKey(g.ipKey, today())]);
  } catch {
    // Best effort.
  }
}

export async function guestUsed(g: GuestIdentity): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc("ask_guest_used", { p_key: g.deviceKey, p_day: LIFETIME });
    return error || typeof data !== "number" ? null : data;
  } catch {
    return null;
  }
}
