import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { askConfig, NAIRA_PER_USD } from "@/lib/ask/config";
import { alertOnce } from "@/lib/ask/ledger";
import { DAY_MS, evaluateWatch, type WatchQuestion } from "@/lib/ask/watch";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = 1000;

/**
 * Daily Ask watch (CTO checklist 3.4): reads the last 30 days of live Ask
 * questions and of payments, runs the rules in src/lib/ask/watch.ts, and
 * emails each new finding once a day (to ASK_ALERT_EMAIL). Same CRON_SECRET
 * gate as the other cron routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = Date.now();
  const since = new Date(now - 30 * DAY_MS).toISOString();

  const questions: WatchQuestion[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("ask_questions")
      .select("user_id, tier, created_at, cost_micros, outcome")
      .eq("source", "live")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      questions.push({
        userId: (r.user_id as string | null) ?? null,
        tier: r.tier as string,
        at: Date.parse(r.created_at as string),
        usd: Number(r.cost_micros ?? 0) / 1_000_000,
        outcome: (r.outcome as string | null) ?? null,
      });
    }
    if ((data?.length ?? 0) < PAGE || from > 50_000) break;
  }

  // Naira collected in the same 30 days (the only currency taken so far).
  let revenue = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("payments")
      .select("amount_minor, amount_kobo, currency")
      .eq("status", "success")
      .gte("created_at", since)
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      if (r.currency && r.currency !== "NGN") continue;
      revenue += Number(r.amount_minor ?? r.amount_kobo ?? 0) / 100;
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  const config = askConfig();
  const findings = evaluateWatch({
    now,
    questions,
    revenue30dNaira: revenue,
    nairaPerUsd: NAIRA_PER_USD,
    capUsd: (tier) => (config.dailyCapMicros[tier as keyof typeof config.dailyCapMicros] ?? config.dailyCapMicros.free) / 1_000_000,
  });

  for (const f of findings) {
    await alertOnce(`watch:${f.key}`, 24 * 3_600_000, f.title, [f.detail]);
  }
  return NextResponse.json({ questions: questions.length, revenueNaira: revenue, findings: findings.map((f) => ({ severity: f.severity, title: f.title })) });
}
