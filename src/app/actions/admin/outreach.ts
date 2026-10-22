"use server";

import { checkAdmin, logAdminAction } from "@/lib/admin";
import { enqueueCampaign, sendNextBatch, campaignProgress, segmentCounts, vipChatAudienceCounts } from "@/lib/outreach-feed";
import type { CampaignType, VipChatCampaign } from "@/lib/outreach";

const CAMPAIGNS = new Set<CampaignType>([
  "warm_checkin",
  "survey_subscribed",
  "survey_free",
  "announce_whatsapp",
  "announce_rebrand",
  "checkout_reminder",
  "announce_pay_once",
  "vip_chat_launch",
  "vip_chat_reminder",
  "vip_chat_free",
]);

// A "use server" actions file can't export `maxDuration` the way a route.ts
// or page.tsx can (Next.js build fails: the whole module loses its
// exports), so this has to stay small enough to finish inside Vercel's
// default 10s function timeout on its own — BATCH_SIZE recipients at
// SEND_DELAY_MS apart (src/lib/outreach-feed.ts) plus real send latency,
// with margin. The client panel just calls it again for the next batch.
const BATCH_SIZE = 10;

export type OutreachState = {
  error: string | null;
  message: string | null;
  enqueued: number | null;
};

function isCampaign(v: FormDataEntryValue | null): v is CampaignType {
  return typeof v === "string" && CAMPAIGNS.has(v as CampaignType);
}

/** Queues everyone currently eligible for `campaign` who isn't already
 * queued for it — safe to click again later to pick up new sign-ups. */
export async function enqueueOutreach(_prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null, enqueued: null };

  const campaign = formData.get("campaign");
  if (!isCampaign(campaign)) return { error: "Invalid campaign.", message: null, enqueued: null };

  const { enqueued, error } = await enqueueCampaign(campaign);
  if (error) return { error, message: null, enqueued: null };

  await logAdminAction(gate.identity, "outreach.enqueued", campaign, { enqueued });

  return {
    error: null,
    message: enqueued > 0 ? `Queued ${enqueued} new recipient${enqueued === 1 ? "" : "s"}.` : "Nobody new to queue.",
    enqueued,
  };
}

export type BatchState = { sent: number; failed: number; remaining: number; error: string | null };

/** Sends the next small batch of pending recipients for `campaign`. The
 * client panel calls this repeatedly while `remaining > 0`. */
export async function sendOutreachBatch(_prev: BatchState, formData: FormData): Promise<BatchState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { sent: 0, failed: 0, remaining: 0, error: gate.error };

  const campaign = formData.get("campaign");
  if (!isCampaign(campaign)) return { sent: 0, failed: 0, remaining: 0, error: "Invalid campaign." };

  const result = await sendNextBatch(campaign, BATCH_SIZE);
  if (result.sent > 0 || result.failed > 0) {
    await logAdminAction(gate.identity, "outreach.batch_sent", campaign, { ...result });
  }
  return { ...result, error: null };
}

export interface OutreachOverview {
  segments: { subscribed: number; free: number; optedOut: number };
  progress: Record<CampaignType, { pending: number; sent: number; failed: number }>;
  /** Who each VIP chat campaign would reach if queued now. */
  audience: Record<VipChatCampaign, number>;
}

/** Server Component data load, not a form action — used by /admin/outreach
 * to render current counts without a client round trip on first paint. */
export async function getOutreachOverview(): Promise<OutreachOverview | { error: string }> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error };

  const all = [...CAMPAIGNS];
  const [segments, audience, ...progress] = await Promise.all([
    segmentCounts(),
    vipChatAudienceCounts(),
    ...all.map((c) => campaignProgress(c)),
  ]);

  return {
    segments,
    audience,
    progress: Object.fromEntries(all.map((c, i) => [c, progress[i]])) as OutreachOverview["progress"],
  };
}
