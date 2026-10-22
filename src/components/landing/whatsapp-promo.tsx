import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { ButtonLink, ExternalButtonLink } from "@/components/ui/primitives";
import { containerClass } from "@/components/ui/container";
import { settledRecords } from "@/lib/performance-store";
import { strongRecordLine } from "@/lib/vip-chat";

/**
 * The two WhatsApp rooms side by side: the free community, open to anyone,
 * and the VIP chat, which /vip sells to everyone else and opens to VIP
 * members, pitched on the Strong picks' live 30-day record. The free card
 * renders only when NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL is set
 * (lib/whatsapp-community.ts); the VIP card always does, since /vip explains
 * itself even before the group's link is in.
 */
export async function WhatsAppPromo() {
  const settled = await settledRecords({ sinceDays: 30 }).catch(() => null);
  const record = settled ? strongRecordLine(settled.strong) : null;

  return (
    <section className={`${containerClass()} py-6 sm:py-8`}>
      <div className={`grid gap-4 ${WHATSAPP_COMMUNITY_URL ? "md:grid-cols-2" : ""}`}>
        {WHATSAPP_COMMUNITY_URL && (
          <div className="card relative flex flex-col overflow-hidden p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink">
                <WhatsAppIcon className="size-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-dim">Free</p>
                <h2 className="font-display text-xl font-extrabold leading-tight text-ink">WhatsApp community</h2>
              </div>
            </div>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-muted">
              One message a day before kick-off with today&rsquo;s picks from the free leagues. Open to everyone,
              leave anytime.
            </p>
            <ExternalButtonLink href={WHATSAPP_COMMUNITY_URL} variant="secondary" className="mt-5 w-full gap-2 sm:w-auto sm:self-start">
              <WhatsAppIcon className="size-[18px]" />
              Join free
            </ExternalButtonLink>
          </div>
        )}

        <div className="card relative flex flex-col overflow-hidden border-brand/30 p-6 sm:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(420px 200px at 90% 0%, color-mix(in oklab, var(--color-brand) 12%, transparent), transparent)" }}
          />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brand/25 bg-brand/12 text-brand">
              <WhatsAppIcon className="size-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">VIP</p>
              <h2 className="font-display text-xl font-extrabold leading-tight text-ink">VIP chat</h2>
            </div>
          </div>
          <p className="relative mt-4 text-sm leading-relaxed text-ink-muted">
            Every day before kick-off: the day&rsquo;s Strong picks, Pro leagues included, and four ready-made combos
            priced about 2, 3, 5 and 10. Plus live calls in the big games.
          </p>
          <p className="relative mt-3 flex-1 text-sm font-medium text-ink">
            {record ? <>Strong picks: {record}.</> : null}
          </p>
          <ButtonLink href="/vip" className="relative mt-5 w-full gap-2 sm:w-auto sm:self-start">
            <WhatsAppIcon className="size-[18px]" />
            See the VIP chat
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
