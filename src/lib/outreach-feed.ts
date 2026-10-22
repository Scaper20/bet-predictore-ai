import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import {
  warmCheckInEmail,
  subscriberSurveyEmail,
  freeSurveyEmail,
  whatsappCommunityAnnouncementEmail,
  rebrandAnnouncementEmail,
  payOnceAnnouncementEmail,
  unfinishedCheckoutEmail,
  vipChatLaunchEmail,
  vipChatReminderEmail,
  vipChatFreeEmail,
} from "@/lib/email-templates";
import { classifySegment, isVipChatCampaign, vipChatAudience, VIP_CHAT_CAMPAIGNS, type CampaignType, type VipChatCampaign } from "@/lib/outreach";
import { livePlans } from "@/lib/paid-users";
import { settledRecords } from "@/lib/performance-store";
import { strongRecordLine } from "@/lib/vip-chat";
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
  if (isVipChatCampaign(campaign)) return enqueueVipChat(admin, campaign);

  const [{ data: profiles }, { data: subs }] = await Promise.all([
    admin.from("profiles").select("id, email").eq("marketing_opt_out", false).not("email", "is", null),
    admin.from("subscriptions").select("user_id, tier, status"),
  ]);

  const subByUser = new Map((subs ?? []).map((s) => [s.user_id as string, { tier: s.tier as string, status: s.status as string }]));

  const wantSegment =
    campaign === "survey_subscribed" ? "subscribed" : campaign === "survey_free" || campaign === "announce_pay_once" ? "free" : null;

  // Checkout reminder: only people who left checkout and never paid since,
  // and who weren't reminded in the last 30 days (by this or the daily job).
  const abandoners = campaign === "checkout_reminder" ? await unfinishedCheckouts(admin) : null;

  const candidates = (profiles ?? []).filter((p) => {
    if (abandoners) return abandoners.has(p.id as string) && classifySegment(subByUser.get(p.id as string) ?? null) === "free";
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

/** Everyone a VIP chat campaign would reach right now, with the tier their email is written for. */
async function vipChatRecipients(
  admin: ReturnType<typeof supabaseAdmin>,
  campaign: VipChatCampaign,
): Promise<{ id: string; email: string; tier: "free" | "pro" | "vip" }[]> {
  const [{ data: profiles }, plans, { data: opened }] = await Promise.all([
    admin.from("profiles").select("id, email").eq("marketing_opt_out", false).not("email", "is", null),
    livePlans(admin),
    admin.from("vip_chat_members").select("user_id").not("last_opened_at", "is", null),
  ]);
  const inChat = new Set((opened ?? []).map((r) => r.user_id as string));
  return (profiles ?? []).flatMap((p) => {
    const tier = vipChatAudience(campaign, plans.get(p.id as string) ?? null, inChat.has(p.id as string));
    return tier ? [{ id: p.id as string, email: p.email as string, tier }] : [];
  });
}

async function enqueueVipChat(admin: ReturnType<typeof supabaseAdmin>, campaign: VipChatCampaign): Promise<{ enqueued: number; error?: string }> {
  const people = await vipChatRecipients(admin, campaign);
  if (people.length === 0) return { enqueued: 0 };
  const { data: inserted, error } = await admin
    .from("email_campaign_recipients")
    .upsert(
      people.map((p) => ({ campaign, user_id: p.id, email: p.email, tier: p.tier })),
      { onConflict: "campaign,user_id", ignoreDuplicates: true },
    )
    .select("user_id");
  if (error) return { enqueued: 0, error: "Couldn't queue recipients. Try again." };
  return { enqueued: (inserted ?? []).length };
}

/** How many people each VIP chat campaign would reach if queued now, opted-out users excluded. */
export async function vipChatAudienceCounts(): Promise<Record<VipChatCampaign, number>> {
  const admin = supabaseAdmin();
  const counts = await Promise.all(VIP_CHAT_CAMPAIGNS.map((c) => vipChatRecipients(admin, c).then((r) => r.length)));
  return Object.fromEntries(VIP_CHAT_CAMPAIGNS.map((c, i) => [c, counts[i]])) as Record<VipChatCampaign, number>;
}

/** The Strong picks' 30-day record for the VIP chat emails, or null when there's too little to quote. */
async function strongRecord(): Promise<string | null> {
  const settled = await settledRecords({ sinceDays: 30 }).catch(() => null);
  return settled ? strongRecordLine(settled.strong) : null;
}

function vipChatEmail(campaign: VipChatCampaign, tier: string | null, record: string | null, unsubscribeUrl: string) {
  if (campaign === "vip_chat_launch") return vipChatLaunchEmail({ tier: tier === "vip" ? "vip" : "pro", record, unsubscribeUrl });
  if (campaign === "vip_chat_reminder") return vipChatReminderEmail({ record, unsubscribeUrl });
  return vipChatFreeEmail({ record, unsubscribeUrl });
}

/**
 * An email as a recipient would get it, for the admin preview: no one is
 * queued and nothing is sent. Only the announcements, whose content doesn't
 * depend on a stored row; `tier` picks the version of the VIP chat launch.
 */
export async function previewCampaignEmail(campaign: CampaignType, tier: string | null): Promise<{ subject: string; html: string } | null> {
  const unsubscribeUrl = `${SITE_URL}/unsubscribe/preview`;
  if (isVipChatCampaign(campaign)) return vipChatEmail(campaign, tier, await strongRecord(), unsubscribeUrl);
  if (campaign === "warm_checkin") return warmCheckInEmail({ unsubscribeUrl });
  if (campaign === "announce_rebrand") return rebrandAnnouncementEmail({ unsubscribeUrl });
  if (campaign === "announce_pay_once") return payOnceAnnouncementEmail({ unsubscribeUrl });
  if (campaign === "announce_whatsapp" && WHATSAPP_COMMUNITY_URL) {
    return whatsappCommunityAnnouncementEmail({ communityUrl: WHATSAPP_COMMUNITY_URL, unsubscribeUrl });
  }
  return null;
}

/** User id → the plan of their latest unfinished checkout, for people who never paid after it. */
async function unfinishedCheckouts(admin: ReturnType<typeof supabaseAdmin>): Promise<Map<string, { plan: string; provider: string }>> {
  const [{ data: attempts }, { data: paid }, { data: reminded }] = await Promise.all([
    admin
      .from("payments")
      .select("user_id, plan, provider, created_at")
      .in("status", ["pending", "failed"])
      .lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString())
      .not("user_id", "is", null)
      .order("created_at", { ascending: false }),
    admin.from("payments").select("user_id, created_at").eq("status", "success"),
    admin.from("checkout_reminders").select("user_id").gte("sent_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);
  const latest = new Map<string, { plan: string; provider: string; at: string }>();
  for (const a of attempts ?? []) {
    if (!latest.has(a.user_id)) latest.set(a.user_id, { plan: a.plan, provider: a.provider, at: a.created_at });
  }
  for (const p of paid ?? []) if (p.created_at >= (latest.get(p.user_id)?.at ?? "~")) latest.delete(p.user_id);
  for (const r of reminded ?? []) latest.delete(r.user_id);
  return latest;
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

  if (campaign === "checkout_reminder") {
    const { data: attempt } = await admin
      .from("payments")
      .select("plan, provider")
      .eq("user_id", recipient.user_id)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!attempt) return null;
    // Logged as reminded, so the daily job doesn't send a second one.
    await admin
      .from("checkout_reminders")
      .upsert({ user_id: recipient.user_id, plan: attempt.plan, sent_at: new Date().toISOString() }, { onConflict: "user_id" });
    return unfinishedCheckoutEmail({
      tier: attempt.plan.startsWith("vip") ? "vip" : "pro",
      nigeria: attempt.provider === "paystack",
      unsubscribeUrl,
    });
  }

  if (isVipChatCampaign(campaign)) {
    if (campaign === "vip_chat_reminder") {
      // Queued before they joined: the reminder no longer applies.
      const { data: member } = await admin.from("vip_chat_members").select("last_opened_at").eq("user_id", recipient.user_id).maybeSingle();
      if (member?.last_opened_at) return null;
    }
    return vipChatEmail(campaign, recipient.tier, await strongRecord(), unsubscribeUrl);
  }

  if (campaign === "announce_rebrand") {
    return rebrandAnnouncementEmail({ unsubscribeUrl });
  }

  if (campaign === "announce_pay_once") {
    return payOnceAnnouncementEmail({ unsubscribeUrl });
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
      if (!email) throw new Error("Nothing to send anymore (no survey row or checkout, or already in the VIP chat).");

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
