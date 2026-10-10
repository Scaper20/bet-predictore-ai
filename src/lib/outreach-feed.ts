import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { warmCheckInEmail, subscriberSurveyEmail, freeSurveyEmail, whatsappCommunityAnnouncementEmail } from "@/lib/email-templates";
import { classifySegment, type CampaignType } from "@/lib/outreach";
import { SITE_URL } from "@/lib/site-url";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";
import type { Tier } from "@/lib/entitlements";

/** "Scaper, KiqStat <support@…>" — falls back the same way the WhatsApp
 * digest's notify email does if SUPPORT_INBOX_EMAIL isn't set. */
function outreachFrom(): string {
  const address = process.env.SUPPORT_INBOX_EMAIL ?? "support@kiqstat.app";
  return `Scaper, KiqStat <${address}>`;
}

/** Sends land one at a time with this gap between them — conservative
 * enough to sit under Resend's default rate limit regardless of plan.
 * Tune down if the account is confirmed to allow more. Kept small partly
 * because the caller (src/app/actions/admin/outreach.ts) can't extend its
 * own function timeout past Vercel's default — see BATCH_SIZE there. */
const SEND_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SegmentCounts {
  subscribed: number;
  free: number;
  optedOut: number;
}

/** Rough counts for the admin panel — not scoped per campaign, just "how
 * many people would each segment currently reach." */
export async function segmentCounts(): Promise<SegmentCounts> {
  const admin = supabaseAdmin();
  const [{ count: optedOut }, { data: subs }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_out", true),
    admin.from("subscriptions").select("user_id, tier, status"),
  ]);

  const subscribedIds = new Set(
    (subs ?? []).filter((s) => classifySegment({ tier: s.tier as string, status: s.status as string }) === "subscribed").map((s) => s.user_id as string),
  );

  const { count: total } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("marketing_opt_out", false);

  return {
    subscribed: subscribedIds.size,
    free: Math.max(0, (total ?? 0) - subscribedIds.size),
    optedOut: optedOut ?? 0,
  };
}

export interface CampaignProgress {
  pending: number;
  sent: number;
  failed: number;
}

export async function campaignProgress(campaign: CampaignType): Promise<CampaignProgress> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("email_campaign_recipients").select("status").eq("campaign", campaign);
  const rows = data ?? [];
  return {
    pending: rows.filter((r) => r.status === "pending").length,
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };
}

/**
 * Queues every currently-eligible, non-opted-out user for `campaign` who
 * isn't already queued for it (the unique (campaign, user_id) index makes
 * this safe to click more than once — it only ever adds newly-eligible
 * people, never duplicates). Survey campaigns also get a matching
 * survey_responses row with the token their email link will carry.
 */
export async function enqueueCampaign(campaign: CampaignType): Promise<{ enqueued: number; error?: string }> {
  if (campaign === "announce_whatsapp" && !WHATSAPP_COMMUNITY_URL) {
    return { enqueued: 0, error: "Set NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL before announcing this — there's no link to send yet." };
  }

  const admin = supabaseAdmin();

  const [{ data: profiles }, { data: subs }] = await Promise.all([
    admin.from("profiles").select("id, email").eq("marketing_opt_out", false).not("email", "is", null),
    admin.from("subscriptions").select("user_id, tier, status"),
  ]);

  const subByUser = new Map((subs ?? []).map((s) => [s.user_id as string, { tier: s.tier as string, status: s.status as string }]));

  const wantSegment = campaign === "survey_subscribed" ? "subscribed" : campaign === "survey_free" ? "free" : null;

  const candidates = (profiles ?? []).filter((p) => {
    if (!wantSegment) return true; // warm_checkin goes to everyone eligible
    return classifySegment(subByUser.get(p.id as string) ?? null) === wantSegment;
  });
  if (candidates.length === 0) return { enqueued: 0 };

  const rows = candidates.map((p) => ({
    campaign,
    user_id: p.id as string,
    email: p.email as string,
    tier: subByUser.get(p.id as string)?.tier ?? "free",
  }));

  const { data: inserted, error } = await admin
    .from("email_campaign_recipients")
    .upsert(rows, { onConflict: "campaign,user_id", ignoreDuplicates: true })
    .select("user_id");
  if (error) return { enqueued: 0 };

  if (campaign === "survey_subscribed" || campaign === "survey_free") {
    const surveyRows = (inserted ?? []).map((r) => ({ survey: campaign, user_id: r.user_id as string }));
    if (surveyRows.length > 0) {
      await admin.from("survey_responses").upsert(surveyRows, { onConflict: "survey,user_id", ignoreDuplicates: true });
    }
  }

  return { enqueued: (inserted ?? []).length };
}

interface PendingRecipient {
  id: string;
  user_id: string;
  email: string;
  tier: string | null;
}

async function buildCampaignEmail(
  admin: ReturnType<typeof supabaseAdmin>,
  campaign: CampaignType,
  recipient: PendingRecipient,
  unsubscribeUrl: string,
): Promise<{ subject: string; html: string } | null> {
  if (campaign === "warm_checkin") {
    return warmCheckInEmail({ unsubscribeUrl });
  }

  if (campaign === "announce_whatsapp") {
    // enqueueCampaign already refuses to queue this campaign at all while
    // unset, but a batch can sit pending for a while — re-check at send
    // time too, in case it got unset in between.
    if (!WHATSAPP_COMMUNITY_URL) return null;
    return whatsappCommunityAnnouncementEmail({ communityUrl: WHATSAPP_COMMUNITY_URL, unsubscribeUrl });
  }

  const { data: survey } = await admin
    .from("survey_responses")
    .select("token")
    .eq("survey", campaign)
    .eq("user_id", recipient.user_id)
    .maybeSingle();
  if (!survey) return null; // enqueue always creates this row first — missing means something's wrong, skip rather than send a dead link

  const surveyUrl = `${SITE_URL}/survey/${survey.token as string}`;

  if (campaign !== "survey_subscribed") return freeSurveyEmail({ surveyUrl, unsubscribeUrl });

  // enqueueCampaign only ever queues subscribed-segment users for this
  // campaign, so the snapshot tier should always be paid — this guard is
  // just to keep the type honest, not a real branch we expect to hit.
  const paidTier: Extract<Tier, "pass" | "pro" | "vip"> =
    recipient.tier === "pass" || recipient.tier === "pro" || recipient.tier === "vip" ? recipient.tier : "pro";
  return subscriberSurveyEmail({ tier: paidTier, surveyUrl, unsubscribeUrl });
}

export interface BatchResult {
  sent: number;
  failed: number;
  remaining: number;
}

/** Sends up to `batchSize` pending recipients for `campaign`, one at a time
 * with a throttling delay, marking each sent/failed as it goes. Meant to be
 * called repeatedly (the admin panel auto-drains it) rather than in one
 * huge sweep — keeps each call well inside a serverless function's time
 * budget regardless of how large the segment is. */
export async function sendNextBatch(campaign: CampaignType, batchSize: number): Promise<BatchResult> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("email_campaign_recipients")
    .select("id, user_id, email, tier")
    .eq("campaign", campaign)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  const batch = (data ?? []) as PendingRecipient[];
  let sent = 0;
  let failed = 0;

  for (const recipient of batch) {
    const unsubscribeUrl = `${SITE_URL}/unsubscribe/${recipient.id}`;
    try {
      const email = await buildCampaignEmail(admin, campaign, recipient, unsubscribeUrl);
      if (!email) throw new Error("No content to send (missing survey row).");

      await sendEmail({ to: recipient.email, subject: email.subject, html: email.html, from: outreachFrom() });
      await admin
        .from("email_campaign_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", recipient.id);
      sent += 1;
    } catch (err) {
      await admin
        .from("email_campaign_recipients")
        .update({ status: "failed", error: err instanceof Error ? err.message : "Unknown error" })
        .eq("id", recipient.id);
      failed += 1;
    }
    await sleep(SEND_DELAY_MS);
  }

  const { pending: remaining } = await campaignProgress(campaign);
  return { sent, failed, remaining };
}

export interface SurveyRow {
  survey: "survey_subscribed" | "survey_free";
  userId: string;
  answers: Record<string, string> | null;
  submittedAt: string | null;
}

export async function resolveSurveyByToken(token: string): Promise<SurveyRow | null> {
  // Public, ungated page — unlike every admin-side function in this file,
  // nothing upstream already checked supabaseConfigured (checkAdmin()
  // normally does that before code even reaches here).
  if (!supabaseConfigured) return null;

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("survey_responses")
    .select("survey, user_id, answers, submitted_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  return {
    survey: data.survey as SurveyRow["survey"],
    userId: data.user_id as string,
    answers: (data.answers as Record<string, string> | null) ?? null,
    submittedAt: (data.submitted_at as string | null) ?? null,
  };
}

/** No-ops (returns ok) if this token was already submitted — a resubmit
 * from a stale tab or a double-click should never overwrite a real answer
 * with a blank retry. */
export async function submitSurveyResponse(
  token: string,
  answers: Record<string, string>,
): Promise<{ error: string | null }> {
  if (!supabaseConfigured) return { error: "This survey link isn't valid." };

  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("survey_responses")
    .select("id, submitted_at")
    .eq("token", token)
    .maybeSingle();
  if (!existing) return { error: "This survey link isn't valid." };
  if (existing.submitted_at) return { error: null };

  const { error } = await admin
    .from("survey_responses")
    .update({ answers, submitted_at: new Date().toISOString() })
    .eq("id", existing.id as string);
  return { error: error ? "Couldn't save your answers. Try again." : null };
}

export async function unsubscribeRecipient(recipientId: string): Promise<{ error: string | null }> {
  if (!supabaseConfigured) return { error: "This unsubscribe link isn't valid." };

  const admin = supabaseAdmin();
  const { data: recipient } = await admin
    .from("email_campaign_recipients")
    .select("user_id")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) return { error: "This unsubscribe link isn't valid." };

  const { error } = await admin
    .from("profiles")
    .update({ marketing_opt_out: true })
    .eq("id", recipient.user_id as string);
  return { error: error ? "Couldn't process that. Try again." : null };
}
