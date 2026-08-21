import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSubscriptionManageLink } from "@/lib/paystack/client";

export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("paystack_subscription_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.paystack_subscription_code) {
    return NextResponse.json({ error: "No manageable subscription found." }, { status: 400 });
  }

  try {
    const result = await getSubscriptionManageLink(sub.paystack_subscription_code);
    return NextResponse.json({ link: result.link });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't reach Paystack." },
      { status: 502 },
    );
  }
}
