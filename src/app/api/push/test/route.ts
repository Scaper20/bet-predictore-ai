import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAllowedPushEndpoint } from "@/lib/push/subscription";
import { readJson, rejectCrossSite } from "@/lib/push/request";
import { pushConfigured, sendPush } from "@/lib/push/send";
import { TEST_PAYLOAD } from "@/lib/push/messages";

export const dynamic = "force-dynamic";

/**
 * Sends one test notification to this device, so someone who just switched
 * notifications on can see it working. Once a minute at most per device —
 * push_claim_test enforces it and hands back the stored keys only when the
 * device is subscribed and the minute is up.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  if (!supabaseConfigured || !pushConfigured) {
    return NextResponse.json({ error: "Notifications are not set up on this site yet." }, { status: 503 });
  }

  const body = await readJson(request);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .rpc("push_claim_test", { p_endpoint: endpoint })
    .maybeSingle<{ p256dh: string; auth: string }>();
  if (error) {
    return NextResponse.json({ error: "Couldn't send a test just now." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Give it a minute before sending another." }, { status: 429 });
  }

  let reason: string | null = null;
  const outcome = await sendPush({ endpoint, ...data }, TEST_PAYLOAD, { ttl: 300, topic: "test", urgency: "high" }, (r) => {
    reason = r;
  });
  if (outcome === "failed" && reason) {
    // Kept on the row (0042) so a device that never hears from us shows why.
    await supabase
      .from("push_subscriptions")
      .update({ last_error: reason, last_error_at: new Date().toISOString() })
      .eq("endpoint", endpoint);
  }
  if (outcome === "gone") {
    await supabase.rpc("push_unsubscribe", { p_endpoint: endpoint });
    return NextResponse.json({ error: "This device's subscription has expired. Turn notifications off and on again." }, { status: 410 });
  }
  if (outcome === "failed") {
    return NextResponse.json({ error: "The push service didn't accept it. Try again shortly." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
