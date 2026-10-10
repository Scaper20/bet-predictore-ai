import type { Metadata } from "next";
import { getOutreachOverview } from "@/app/actions/admin/outreach";
import { OutreachCampaignPanel } from "@/components/admin/outreach-campaign-panel";
import { Badge, ButtonLink } from "@/components/ui/primitives";
import type { CampaignType } from "@/lib/outreach";

export const metadata: Metadata = { title: "Outreach" };

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
];

export default async function AdminOutreachPage() {
  const overview = await getOutreachOverview();

  if ("error" in overview) {
    return <p className="text-sm text-rose">{overview.error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Outreach</h1>
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
