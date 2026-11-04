import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { ExternalButtonLink } from "@/components/ui/primitives";
import { containerClass } from "@/components/ui/container";

/**
 * The free WhatsApp community, open to anyone. Renders only when the invite
 * link is set (lib/whatsapp-community.ts).
 */
export function WhatsAppPromo() {
  if (!WHATSAPP_COMMUNITY_URL) return null;

  return (
    <section className={`${containerClass()} py-6 sm:py-8`}>
      <div className="grid gap-4">
        {(
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
      </div>
    </section>
  );
}
