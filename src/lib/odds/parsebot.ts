import "server-only";

import { switchOn } from "@/lib/switches";
import { ALLOWED_ENDPOINTS, CREDIT_COST, capsFrom, liveEnabled, type ParsebotEndpoint } from "./parsebot-budget";

/**
 * The one way the app talks to parse.bot.
 *
 * Every call goes through three gates, in order, and any one of them failing
 * means no request is sent and the caller gets null:
 *
 * 1. The kill switch: the admin toggle at /admin/parsebot, plus the key, and
 *    PARSEBOT_LIVE not set to "off". It is off until the credits are bought.
 * 2. The allow-list. Only the endpoints the product needs can be called.
 * 3. The ledger. The credits are reserved in public.parsebot_calls against
 *    the daily and 30-day caps before the request goes out. If the ledger
 *    cannot be reached, the call is refused: failing closed costs a missing
 *    price; failing open could cost the plan.
 */

const SCRAPER = "8ffd9f0c-6174-43af-80dc-4898f47f074b";
const BASE = `https://api.parse.bot/scraper/${SCRAPER}`;

/**
 * Pinned rather than following the live canonical.
 *
 * parse.bot's own guidance: an unversioned canonical follows whatever the
 * scraper's author publishes next, and is explicitly not stable. A silent
 * change to the response shape would surface as prices quietly disappearing,
 * so the version moves when someone chooses to move it.
 */
const SNAPSHOT_VERSION = "15";

/** Longest a single call may take, body included. */
const FETCH_TIMEOUT_MS = 8_000;

/** True when live calls are switched on. Cheap: the switch is cached for a few seconds. */
export async function parsebotLive(): Promise<boolean> {
  return liveEnabled(process.env, await switchOn("parsebot_live"));
}

async function reserve(endpoint: ParsebotEndpoint, note?: string): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const caps = capsFrom(process.env);
    const { data, error } = await supabaseAdmin().rpc("parsebot_reserve", {
      p_endpoint: endpoint,
      p_credits: CREDIT_COST[endpoint],
      p_daily_cap: caps.daily,
      p_window_cap: caps.window,
    });
    if (error || typeof data !== "number") return null;
    if (note) await supabaseAdmin().from("parsebot_calls").update({ note }).eq("id", data);
    return data;
  } catch {
    return null;
  }
}

async function settle(id: number, ok: boolean): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    await supabaseAdmin().from("parsebot_calls").update({ ok }).eq("id", id);
  } catch {
    // The credits are already counted; the outcome is only for the record.
  }
}

/**
 * Calls one parse.bot endpoint, or returns null without calling it.
 *
 * GET endpoints take `query`; POST endpoints take `body`, sent as JSON. The
 * response body is returned as parsed, unwrapped from parse.bot's `data`
 * envelope when there is one.
 */
export async function parsebotCall<T>(
  endpoint: ParsebotEndpoint,
  init: { query?: Record<string, string | number | undefined>; body?: unknown; note?: string } = {},
): Promise<T | null> {
  if (!(await parsebotLive())) return null;
  if (!ALLOWED_ENDPOINTS.includes(endpoint)) return null;
  const key = process.env.PARSEBOT_API_KEY!.trim();

  const id = await reserve(endpoint, init.note);
  if (id === null) return null;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString();
  const post = init.body !== undefined;

  const response = await fetch(`${BASE}/${endpoint}${qs ? `?${qs}` : ""}`, {
    method: post ? "POST" : "GET",
    headers: {
      "X-API-Key": key,
      "API-Snapshot-Version": SNAPSHOT_VERSION,
      ...(post ? { "Content-Type": "application/json" } : {}),
    },
    body: post ? JSON.stringify(init.body) : undefined,
    // Bounded: a stalled call used to hold every caller sharing its promise
    // until the function's 60-second limit, which took Forge down in October.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => null);

  const parsed = response?.ok ? ((await response.json().catch(() => null)) as unknown) : null;
  await settle(id, parsed !== null);
  if (parsed === null || typeof parsed !== "object") return null;
  const enveloped = (parsed as { data?: unknown }).data;
  return (enveloped && typeof enveloped === "object" ? enveloped : parsed) as T;
}
