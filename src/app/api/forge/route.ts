import { getEntitlement, meets } from "@/lib/entitlements";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPreferences } from "@/lib/preferences";
import { leagueByCode } from "@/lib/leagues";
import { claimGuest, guestIdentity, guestUsed, refundGuest } from "@/lib/ask/guest";
import { buildForgeSlip } from "@/lib/forge-feed";
import { FORGE_FREE_DAILY, FORGE_GUEST_TOTAL, FORGE_PAID_DAILY, marketsForPlan, parseForgeRequest } from "@/lib/forge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FEATURE = "forge";
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, setCookie?: string | null) {
  const headers = new Headers(NO_STORE);
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return Response.json(body, { status, headers });
}

/** Allowance and the user's own leagues, for the settings panel. */
export async function GET(request: Request) {
  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  let used: number | null = null;
  let setCookie: string | null = null;
  let myLeagues: { code: string; name: string }[] = [];

  if (entitlement.userId) {
    const [{ data }, prefs] = await Promise.all([
      supabaseAdmin().rpc("feature_used_today", { p_user: entitlement.userId, p_feature: FEATURE }),
      getPreferences().catch(() => null),
    ]);
    used = typeof data === "number" ? data : null;
    myLeagues = (prefs?.leagues ?? []).flatMap((code) => {
      const def = leagueByCode(code);
      return def ? [{ code, name: def.shortName }] : [];
    });
  } else {
    const guest = guestIdentity(request, FEATURE);
    setCookie = guest.setCookie;
    used = await guestUsed(guest);
  }

  return json(
    {
      signedIn: entitlement.signedIn,
      paid,
      used,
      limit: entitlement.signedIn ? (paid ? null : FORGE_FREE_DAILY) : FORGE_GUEST_TOTAL,
      myLeagues,
    },
    200,
    setCookie,
  );
}

/** Builds one slip. Counts against the allowance only if a slip comes back. */
export async function POST(request: Request) {
  const { settings, state } = parseForgeRequest(await request.json().catch(() => null));
  const entitlement = await getEntitlement();
  const paid = meets(entitlement.tier, "pass");
  const unavailable = { error: "Forge isn't available right now. Try again shortly.", code: "unavailable" };

  let used: number;
  let limit: number | null;
  let refund: () => Promise<void>;
  let setCookie: string | null = null;
  let leagueCodes: string[] | null = null;

  if (entitlement.userId) {
    const userId = entitlement.userId;
    const supabase = supabaseAdmin();
    const cap = paid ? FORGE_PAID_DAILY : FORGE_FREE_DAILY;
    const { data, error } = await supabase.rpc("feature_claim", { p_user: userId, p_feature: FEATURE, p_limit: cap });
    const row = Array.isArray(data) ? (data[0] as { allowed: boolean; used: number } | undefined) : undefined;
    if (error || !row) return json(unavailable, 503);
    if (!row.allowed) {
      return json(
        {
          error: paid
            ? "You've hit today's fair-use limit for Forge. Try again tomorrow."
            : `That's your ${FORGE_FREE_DAILY} free slips for today. Pro makes Forge unlimited.`,
          code: "limit",
        },
        429,
      );
    }
    used = row.used;
    limit = paid ? null : FORGE_FREE_DAILY;
    refund = async () => {
      await supabase.rpc("feature_refund", { p_user: userId, p_feature: FEATURE }).then(
        () => undefined,
        () => undefined,
      );
    };
    if (settings.leagues === "mine") {
      const prefs = await getPreferences().catch(() => null);
      leagueCodes = prefs?.leagues.length ? prefs.leagues : null;
    }
  } else {
    const guest = guestIdentity(request, FEATURE);
    setCookie = guest.setCookie;
    const claim = await claimGuest(guest, FORGE_GUEST_TOTAL);
    if (!claim) return json(unavailable, 503, setCookie);
    if (!claim.allowed) {
      return json(
        {
          error: `You've used your ${FORGE_GUEST_TOTAL} free slips. Create a free account for ${FORGE_FREE_DAILY} a day.`,
          code: "guest_limit",
        },
        429,
        setCookie,
      );
    }
    used = claim.used;
    limit = FORGE_GUEST_TOTAL;
    refund = () => refundGuest(guest);
  }

  if (settings.leagues !== "all" && settings.leagues !== "mine") {
    leagueCodes = leagueByCode(settings.leagues) ? [settings.leagues] : null;
  }

  try {
    // Free plan: 1X2 only, enforced here whatever the request asks for.
    const planSettings = { ...settings, markets: marketsForPlan(settings.markets, paid) };
    const result = await buildForgeSlip(planSettings, state, { allowHandicap: paid, leagueCodes });
    if (result.legs.length === 0) {
      await refund();
      return json(
        {
          error:
            result.scanned === 0
              ? "No modelled games kick off in that window. Try a later window or all leagues."
              : "Nothing on the card fits those settings. Try more markets, a different style or a wider window.",
          code: "empty",
        },
        200,
        setCookie,
      );
    }
    return json({ ...result, used, limit }, 200, setCookie);
  } catch {
    await refund();
    return json(unavailable, 503, setCookie);
  }
}
