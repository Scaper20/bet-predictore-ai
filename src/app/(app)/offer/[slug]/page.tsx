import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEntitlement } from "@/lib/entitlements";
import { eligibility, offerBySlug } from "@/lib/offers-server";
import { durationLabel, naira, offerLive, offerPath, tierName, type Offer } from "@/lib/offers";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/primitives";
import { OfferCheckout } from "@/components/offers/offer-checkout";
import { sportPath } from "@/lib/routes";

const SLUG = /^[a-z0-9-]{2,40}$/;

/** An offer anyone may land on from search or a shared post: live, and not tied to one email. */
function publicOfferLive(o: Offer | null): o is Offer {
  return Boolean(o && o.audience !== "email" && offerLive(o));
}

export async function generateMetadata({ params }: PageProps<"/offer/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const offer = SLUG.test(slug) ? await offerBySlug(slug).catch(() => null) : null;
  if (!publicOfferLive(offer)) return { title: "Offer", robots: { index: false, follow: false } };
  const title = `${offer.headline}: ${naira(offer.priceNaira)}`;
  const description = `${tierName(offer.tier)} on KiqStat for ${durationLabel(offer.hours)} at ${naira(offer.priceNaira)}, one payment that doesn't renew. ${
    offer.subline ?? "Every pick, market and tool the plan includes."
  }`;
  return {
    title,
    description,
    alternates: { canonical: offerPath(offer.slug) },
    openGraph: { title: `${title} | KiqStat`, description, url: offerPath(offer.slug) },
    twitter: { card: "summary_large_image", title: `${title} | KiqStat`, description },
  };
}

/**
 * An offer's own checkout step, for the popups and the email links alike.
 * Signing in comes first (signed-out visitors go through sign-up with this
 * page as `next`), so a payment always lands on an account; an email offer
 * also checks its link belongs to the account (offers-server.ts eligibility).
 */
export default async function OfferPage({ params, searchParams }: PageProps<"/offer/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const recipient = typeof sp.r === "string" ? sp.r : null;
  const ent = await getEntitlement();
  const offer = SLUG.test(slug) ? await offerBySlug(slug) : null;
  if (!ent.userId) {
    // A public offer shows itself to search and shared-link visitors; paying still needs an account.
    if (!recipient && publicOfferLive(offer)) return <SignedOutOffer offer={offer} />;
    // An emailed member already has an account: sign in, not sign up.
    redirect(`/account/${recipient ? "login" : "sign-up"}?next=${encodeURIComponent(offerPath(slug, recipient ?? undefined))}`);
  }

  const check = offer ? await eligibility(offer, ent, recipient) : ({ ok: false, reason: "This offer has closed." } as const);

  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-shell p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--color-gold)_22%,transparent),transparent_70%)]"
        />
        <div className="relative">
          {ent.passOnly && ent.passUntil ? (
            <>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">Pass on</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">You&apos;re {tierName(ent.tier === "vip" ? "vip" : "pro")}</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Until{" "}
                {new Date(ent.passUntil).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })} WAT.
              </p>
              <ButtonLink href={sportPath("predictions")} className="mt-6 w-full">See today&apos;s picks</ButtonLink>
            </>
          ) : offer && check.ok ? (
            <>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">
                {tierName(offer.tier)} · {durationLabel(offer.hours)}
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{offer.headline}</h1>
              {offer.subline && <p className="mt-1 text-sm text-ink-muted">{offer.subline}</p>}
              <div className="mt-5 flex items-baseline gap-2.5">
                <span className="font-display text-5xl font-extrabold tracking-tight">{naira(offer.priceNaira)}</span>
                {offer.compareNaira && <span className="text-sm text-ink-dim line-through">{naira(offer.compareNaira)}/mo</span>}
              </div>
              {offer.perks.length > 0 && (
                <ul className="mt-5 space-y-2 text-sm text-ink">
                  {offer.perks.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <span className="text-gold" aria-hidden>✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              <OfferCheckout slug={offer.slug} recipient={recipient} deadline={check.deadline} cta={`Pay ${naira(offer.priceNaira)}`} />
              <p className="mt-4 text-xs leading-relaxed text-ink-dim">
                Starts the moment you pay and doesn&apos;t renew.
                {offer.tier === "vip" && (
                  <>
                    {" "}The members&apos; WhatsApp chat comes with the{" "}
                    <Link href="/pricing" className="underline underline-offset-2">VIP plan</Link>.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight">{check.ok ? "This offer has closed" : check.reason}</h1>
              <p className="mt-2 text-sm text-ink-muted">Plans start at a month, with the same picks.</p>
              <ButtonLink href="/pricing" className="mt-6 w-full">See plans</ButtonLink>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

/** The offer as a signed-out visitor sees it: what it is and costs, then an account to claim it. */
function SignedOutOffer({ offer }: { offer: Offer }) {
  const next = encodeURIComponent(offerPath(offer.slug));
  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-shell p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--color-gold)_22%,transparent),transparent_70%)]"
        />
        <div className="relative">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">
            {tierName(offer.tier)} · {durationLabel(offer.hours)}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{offer.headline}</h1>
          {offer.subline && <p className="mt-1 text-sm text-ink-muted">{offer.subline}</p>}
          <div className="mt-5 flex items-baseline gap-2.5">
            <span className="font-display text-5xl font-extrabold tracking-tight">{naira(offer.priceNaira)}</span>
            {offer.compareNaira && <span className="text-sm text-ink-dim line-through">{naira(offer.compareNaira)}/mo</span>}
          </div>
          {offer.perks.length > 0 && (
            <ul className="mt-5 space-y-2 text-sm text-ink">
              {offer.perks.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span className="text-gold" aria-hidden>✓</span>
                  {p}
                </li>
              ))}
            </ul>
          )}
          <ButtonLink href={`/account/sign-up?next=${next}`} className="mt-6 w-full">
            Create a free account to claim
          </ButtonLink>
          <p className="mt-3 text-center text-xs text-ink-dim">
            Have an account?{" "}
            <Link href={`/account/login?next=${next}`} className="underline underline-offset-2">Sign in</Link>
          </p>
          <p className="mt-4 text-xs leading-relaxed text-ink-dim">
            One payment, starts the moment you pay and doesn&apos;t renew. One per account; 18+.
          </p>
        </div>
      </div>
    </Container>
  );
}
