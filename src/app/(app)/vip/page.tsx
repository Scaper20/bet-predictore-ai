import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, ButtonLink, ExternalButtonLink } from "@/components/ui/primitives";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { VipNumberForm } from "@/components/vip/vip-number-form";
import { getEntitlement, meets } from "@/lib/entitlements";
import { formatWhatsAppNumber } from "@/lib/vip-chat";
import { vipChatMember, vipChatSettings } from "@/lib/vip-chat-store";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";

export const metadata: Metadata = {
  alternates: { canonical: "/vip" },
  title: "VIP chat",
  description: "KiqStat's members-only WhatsApp chat: the day's best reads before kick-off, live calls during the big games and your questions answered first.",
};

/** What the chat offers, in the order a member would care. */
const INSIDE = [
  { title: "The best reads, before kick-off", body: "The day's strongest picks posted in the chat, Pro leagues included, hours before the games." },
  { title: "Live during the big games", body: "In-play reads as the match turns, with the live win probability behind them." },
  { title: "Your questions answered first", body: "Ask about any match. VIP questions get answered before anything else, here and in support." },
  { title: "Members only", body: "Every number is checked against a live VIP plan before it is let in, and taken out when the plan ends." },
];

const COMPARE: { label: string; free: string; vip: string }[] = [
  { label: "Today's picks digest", free: "Once a day", vip: "Once a day" },
  { label: "Pro-league picks before kick-off", free: "Count only", vip: "In full" },
  { label: "Live calls during matches", free: "–", vip: "Big games" },
  { label: "Ask the team", free: "–", vip: "Answered first" },
];

export default async function VipPage() {
  const ent = await getEntitlement();
  const vip = meets(ent.tier, "vip");
  const [member, settings] = vip && ent.userId ? await Promise.all([vipChatMember(ent.userId), vipChatSettings()]) : [null, null];

  return (
    <>
      <PageHeader eyebrow="VIP chat" title="The VIP room on WhatsApp" description="A small, members-only chat for VIP." />

      <Container className="py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              {INSIDE.map((f) => (
                <div key={f.title} className="card p-5">
                  <h2 className="text-sm font-semibold text-ink">{f.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
                </div>
              ))}
            </div>

            <div className="card mt-6 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-dim sm:gap-x-8">
                <span />
                <span className="w-24 text-center">Free community</span>
                <span className="w-24 text-center text-brand">VIP chat</span>
              </div>
              {COMPARE.map((r) => (
                <div key={r.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line px-5 py-3 text-sm last:border-0 sm:gap-x-8">
                  <span className="text-ink-muted">{r.label}</span>
                  <span className="w-24 text-center text-ink-dim">{r.free}</span>
                  <span className="w-24 text-center font-medium text-ink">{r.vip}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="card order-first p-5 sm:p-6 lg:order-none lg:sticky lg:top-24">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-brand/25 bg-brand/12 text-brand">
                <WhatsAppIcon className="size-6" />
              </span>
              <div>
                <p className="font-display text-lg font-bold">VIP chat</p>
                <p className="text-xs text-ink-dim">Comes with the VIP plan</p>
              </div>
            </div>

            {!ent.signedIn ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm leading-relaxed text-ink-muted">Already VIP? Sign in to join. New here? VIP includes the chat and everything in Pro.</p>
                <ButtonLink href="/account/login?next=/vip" className="w-full">Sign in</ButtonLink>
                <ButtonLink href="/account/billing?plan=vip" variant="secondary" className="w-full">See the VIP plan</ButtonLink>
              </div>
            ) : !vip ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm leading-relaxed text-ink-muted">
                  The chat is for VIP members. Upgrade and you can join straight away, along with live win
                  probability, 100 Ask KiqStat questions a day and priority support.
                </p>
                <ButtonLink href="/account/billing?plan=vip" className="w-full">Go VIP</ButtonLink>
                {WHATSAPP_COMMUNITY_URL && (
                  <ExternalButtonLink href={WHATSAPP_COMMUNITY_URL} variant="secondary" className="w-full gap-2">
                    <WhatsAppIcon className="size-4" />
                    Join the free community instead
                  </ExternalButtonLink>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <Badge tone="brand">You&rsquo;re VIP</Badge>
                {member && (
                  <div>
                    <p className="text-xs text-ink-dim">Joining with</p>
                    <p className="tnum mt-0.5 font-mono text-base text-ink">{formatWhatsAppNumber(member.whatsappNumber)}</p>
                  </div>
                )}
                {member && settings?.inviteUrl ? (
                  <div className="space-y-2">
                    {/* The route checks the plan, then redirects to WhatsApp: the link itself is never in the page. */}
                    <ExternalButtonLink href="/api/vip-chat/join" className="w-full gap-2">
                      <WhatsAppIcon className="size-[18px]" />
                      {member.lastOpenedAt ? "Open the VIP chat" : "Join the VIP chat"}
                    </ExternalButtonLink>
                    <p className="text-xs leading-relaxed text-ink-dim">
                      Tap &ldquo;Request to join&rdquo; in WhatsApp. We approve requests from your number, usually within a few hours.
                    </p>
                  </div>
                ) : member ? (
                  <p className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">
                    The chat opens soon. Your number is saved, and the join button appears here when it does.
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted">
                    Add the WhatsApp number you&rsquo;ll join with, then the join button appears.
                  </p>
                )}
                <VipNumberForm current={member?.whatsappNumber ?? null} />
              </div>
            )}
          </aside>
        </div>
      </Container>
    </>
  );
}
