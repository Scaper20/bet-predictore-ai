import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { ExternalButtonLink } from "@/components/ui/primitives";
import { containerClass } from "@/components/ui/container";

/** Renders nothing until NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL is set — see
 * that file for why. */
export function WhatsAppPromo() {
  if (!WHATSAPP_COMMUNITY_URL) return null;

  return (
    <section className={`${containerClass()} py-6 sm:py-8`}>
      <div className="card relative flex flex-col items-start gap-6 overflow-hidden p-6 sm:flex-row sm:items-center sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(480px 220px at 85% 15%, color-mix(in oklab, var(--color-brand) 10%, transparent), transparent)" }}
        />

        <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl border border-brand/25 bg-brand/12 text-brand">
          <WhatsAppIcon className="size-7" />
        </div>

        <div className="relative min-w-0 flex-1">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand">New</span>
          <h2 className="font-display mt-1 text-2xl font-extrabold leading-tight text-ink">
            Get today&rsquo;s value picks on WhatsApp
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            Join the community — one message a day, before kickoff, to everyone at once. Only
            picks that clear our sample-size bar. Free, leave anytime.
          </p>
        </div>

        <ExternalButtonLink
          href={WHATSAPP_COMMUNITY_URL}
          className="relative w-full shrink-0 gap-2 sm:w-auto"
          variant="primary"
        >
          <WhatsAppIcon className="size-[18px]" />
          Join the WhatsApp community
        </ExternalButtonLink>
      </div>
    </section>
  );
}
