import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAllowedPushEndpoint, parseSubscription, parseTopics, type PushTopics } from "@/lib/push/subscription";
import { readJson, rejectCrossSite } from "@/lib/push/request";

export const dynamic = "force-dynamic";

/**
 * This device's notification subscription.
 *
 * POST subscribes, or refreshes an existing subscription (the app calls it
 * once a session, which also re-links the row to whoever is signed in now).
 * Optional `topics` switch individual notifications on or off; topics left
 * out keep their stored value. Responds with the topics now in force.
 *
 * DELETE removes it.
 *
 * Works signed out. Both go through service-role-only functions (0044): the
 * account a row is tied to comes from the verified session cookie, never
 * from the request body, and nothing here is callable from the browser.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  if (!supabaseConfigured) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = await readJson(request);
  const subscription = parseSubscription(body?.subscription);
  if (!subscription) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const topics = parseTopics(body?.topics);

  const supabase = await supabaseServer();
  // Refreshes an expired session first, so the row goes to the right user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabaseAdmin()
    .rpc("push_sync", {
      p_user: user?.id ?? null,
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys.p256dh,
      p_auth: subscription.keys.auth,
      p_picks: topics.picks ?? null,
      p_results: topics.results ?? null,
      p_value_alerts: topics.valueAlerts ?? null,
      p_user_agent: request.headers.get("user-agent"),
    })
    .single<{ picks: boolean; results: boolean; value_alerts: boolean }>();
  if (error || !data) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  const saved: PushTopics = { picks: data.picks, results: data.results, valueAlerts: data.value_alerts };
  return NextResponse.json({ topics: saved });
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  if (!supabaseConfigured) return NextResponse.json({ ok: true });

  const body = await readJson(request);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().rpc("push_unsubscribe", { p_endpoint: endpoint });
  if (error) return NextResponse.json({ error: "Could not remove" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
