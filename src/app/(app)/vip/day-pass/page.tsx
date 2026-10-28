import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEntitlement } from "@/lib/entitlements";
import { dayPassState } from "@/lib/day-pass-server";
import { DAY_PASS_PATH, DAY_PASS_PRICE_NAIRA } from "@/lib/day-pass";
import { planById } from "@/lib/pricing";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/primitives";
import { DayPassCheckout } from "@/components/day-pass/day-pass-checkout";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = { title: "VIP day pass", robots: { index: false, follow: false } };

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * The day pass's own checkout step. Signing in comes first (the offer
 * sends signed-out visitors through sign-up with this page as `next`), so
 * a payment always lands on an account.
 */
export default async function DayPassPage() {
  const ent = await getEntitlement();
  if (!ent.userId) redirect(`/account/sign-up?next=${encodeURIComponent(DAY_PASS_PATH)}`);
  const state = await dayPassState(ent);
  const monthly = planById("vip").price.monthly ?? 0;

  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-shell p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--color-gold)_22%,transparent),transparent_70%)]" />
        <div className="relative">
          {state.state === "offer" && (
            <>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">New member offer</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">VIP for 24 hours</h1>
              <div className="mt-4 flex items-baseline gap-2.5">
                <span className="font-display text-5xl font-extrabold tracking-tight">{naira(DAY_PASS_PRICE_NAIRA)}</span>
                {monthly > 0 && <span className="text-sm text-ink-dim line-through">{naira(monthly)}/mo</span>}
              </div>
              <p className="mt-2 text-sm text-ink-muted">Starts the moment you pay. Doesn&apos;t renew.</p>
              <DayPassCheckout deadline={state.deadline} />
              <p className="mt-4 text-xs leading-relaxed text-ink-dim">
                Every VIP feature on the site for 24 hours. The members&apos; WhatsApp chat comes with the{" "}
                <Link href="/pricing" className="underline underline-offset-2">VIP plan</Link>.
              </p>
            </>
          )}
          {state.state === "active" && (
            <>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">Day pass on</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">You&apos;re VIP</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Until{" "}
                {new Date(state.until).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })} WAT.
              </p>
              <ButtonLink href={sportPath("predictions")} className="mt-6 w-full">See today&apos;s picks</ButtonLink>
            </>
          )}
          {state.state === "none" && (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight">This offer has closed</h1>
              <p className="mt-2 text-sm text-ink-muted">The day pass is for new members, in their first 24 hours, once.</p>
              <ButtonLink href="/pricing" className="mt-6 w-full">See plans</ButtonLink>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
