import type { Metadata } from "next";
import Link from "next/link";
import { getOutreachOverview } from "@/app/actions/admin/outreach";
import { OutreachCampaignPanel } from "@/components/admin/outreach-campaign-panel";
import { Badge, ButtonLink } from "@/components/ui/primitives";
import type { CampaignType, VipChatCampaign } from "@/lib/outreach";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "Outreach" };

const preview = (campaign: CampaignType, tier?: string) =>
  `/admin/outreach/preview?campaign=${campaign}${tier ? `&tier=${tier}` : ""}`;

/** The VIP chat launch, in the order to send it. */
const VIP_CHAT: { type: VipChatCampaign; label: string; description: string; previews: { label: string; href: string }[] }[] = [
  {
    type: "vip_chat_launch",
    label: "1 · VIP chat launch: Pro and VIP",
    description:
      "Everyone on a live Pro or VIP plan, paid or gifted. VIP members are invited to join; Pro members hear what VIP now adds. Both carry the Strong picks' live 30-day record.",
    previews: [
      { label: "Preview VIP version", href: preview("vip_chat_launch", "vip") },
      { label: "Preview Pro version", href: preview("vip_chat_launch", "pro") },
    ],
  },
  {
    type: "vip_chat_reminder",
    label: "2 · VIP chat reminder: VIP only",
    description:
      "VIP members who haven't opened the chat yet. Send a few days after the launch; anyone who joins in the meantime is skipped, even if already queued.",
    previews: [{ label: "Preview", href: preview("vip_chat_reminder") }],
  },
  {
    type: "vip_chat_free",
    label: "3 · VIP chat for free users",
    description:
      "Everyone not on a live paid plan: the daily Strong picks and 2 to 10 combos in the VIP chat, the 30-day record and the latest winning picks, linking to /vip.",
    previews: [{ label: "Preview", href: preview("vip_chat_free") }],
  },
];

const CAMPAIGNS: { type: CampaignType; label: string; description: string }[] = [
  {
    type: "warm_checkin",
    label: "Founder check-in",
    description: "A personal note from Scaper to every user — no ask, just a check-in and an open invite to reply.",
  },
  {
    type: "survey_subscribed",
    label: "Subscriber survey",
    description: "For anyone currently on Pass/Pro/VIP — thanks them by plan, then a ~3-minute survey.",
  },
  {
    type: "survey_free",
    label: "Free-user survey",
    description: "For everyone else — what's stopping them from subscribing, what would change that.",
  },
  {
    type: "announce_whatsapp",
    label: "WhatsApp community launch",
    description: "One-off announcement pointing at the new WhatsApp community. Won't queue until the community link is configured.",
  },
  {
    type: "announce_rebrand",
    label: "BetriX is now KiqStat",
    description: "One-off note to everyone: the new name and address, nothing else changes, and why we renamed.",
  },
  {
    type: "announce_pay_once",
    label: "Pay by transfer, OPay or PalmPay",
    description:
      "For everyone not on a paid plan: Pro and VIP can now be paid once by bank transfer, OPay, PalmPay, USSD or card, with nothing renewing. Links straight to Plan & billing.",
  },
  {
    type: "checkout_reminder",
    label: "Unfinished checkout",
    description:
      "For people who opened checkout and never paid: what their plan unlocks, the latest winning picks, and a link back. Skips anyone reminded in the last 30 days. Queue again any time to pick up new people.",
  },
];

export default async function AdminOutreachPage() {
  await requirePermission("outreach.manage");
  const overview = await getOutreachOverview();

  if ("error" in overview) {
    return <p className="text-sm text-rose">{overview.error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Growth</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Outreach</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            One-time emails to the whole user base — a personal check-in, plus segmented surveys. Every send is from
            Scaper personally, carries an unsubscribe link, and skips anyone who&rsquo;s opted out. Nothing here sends
            automatically: queue a campaign, then send it in batches whenever you&rsquo;re ready.
          </p>
        </div>
        <ButtonLink href="/admin/outreach/responses" variant="secondary" className="shrink-0">
          View survey responses
        </ButtonLink>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{overview.segments.subscribed} subscribed</Badge>
        <Badge tone="neutral">{overview.segments.free} free</Badge>
        <Badge tone="neutral">{overview.segments.optedOut} opted out</Badge>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">VIP chat launch</h2>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted">
            Three emails, in this order. Set the group&rsquo;s invite link in{" "}
            <Link href="/admin/vip-chat" className="text-brand underline underline-offset-2">VIP chat</Link> before sending the
            first, or VIP members will find no join button. Preview each before queuing.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {VIP_CHAT.map((c) => (
            <OutreachCampaignPanel
              key={c.type}
              campaign={c.type}
              label={c.label}
              description={c.description}
              initialProgress={overview.progress[c.type]}
              audience={overview.audience[c.type]}
              previews={c.previews}
            />
          ))}
        </div>
      </section>

      <h2 className="pt-2 text-sm font-semibold text-ink">Other campaigns</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPAIGNS.map((c) => (
          <OutreachCampaignPanel
            key={c.type}
            campaign={c.type}
            label={c.label}
            description={c.description}
            initialProgress={overview.progress[c.type]}
          />
        ))}
      </div>
    </div>
  );
}
