"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useOverlay } from "@/components/ui/use-overlay";
import { useClaimsPriorityPopup, usePriorityPopupActive } from "@/components/ui/popup-priority";
import { Spinner } from "@/components/ui/primitives";
import { OPEN_OFFER_EVENT, TOUR_CLOSED_EVENT, tourDone, tourStartsOn } from "@/lib/tour";
import { FIRST_SEEN_COOKIE, firstSeenFrom, formatLeft, naira, offerPath, tierName, type OfferState, type PublicOffer } from "@/lib/offers";

/**
 * The popup offers (lib/offers.ts): the new-visitor one, or the free
 * members' one, whichever /api/offers says applies, with the copy and price
 * set in /admin/offers.
 *
 * Two pieces. A sheet that opens once per offer by itself: straight after
 * the walkthrough, whether it was finished or skipped, or a few seconds
 * into the visit on a page where the walkthrough doesn't run. And a small
 * chip that keeps the offer one tap away while it lasts, then turns into the
 * pass's own clock once bought.
 *
 * Only asks the server when there can be something to show: a signed-in
 * visitor, or a browser whose first visit was recent (a returning visitor's
 * cookie reads "0", so it never asks).
 */

const SHOWN_KEY = (slug: string) => `kiqstat.offer.shown.${slug}`;
const CHIP_HIDDEN_KEY = "kiqstat.offer.chip";
const AUTO_DELAY_MS = 6000;
/** Where neither the sheet nor the chip belong. */
const QUIET = [/^\/account/, /^\/onboarding/, /^\/admin/, /^\/pricing/, /^\/offer\//, /^\/auth/];
/** How long after a first visit a signed-out browser keeps asking. */
const ASK_FOR_MS = 14 * 86_400_000;

/** "VIP 24h", "VIP 3d". */
const shortName = (o: PublicOffer) => `${tierName(o.tier)} ${o.hours < 48 ? `${o.hours}h` : `${Math.round(o.hours / 24)}d`}`;

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

/** Whether this browser's first visit was recent enough that a new-visitor offer may still be open. */
function recentVisitor(): boolean {
  const raw = document.cookie.match(new RegExp(`(?:^|; )${FIRST_SEEN_COOKIE}=([^;]*)`))?.[1];
  const seen = firstSeenFrom(raw);
  return seen !== null && Date.now() - seen < ASK_FOR_MS;
}

const noSubscribe = () => () => {};

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function OfferPopup() {
  const pathname = usePathname();
  const { entitlement, loading } = useEntitlement();
  const priorityHeld = usePriorityPopupActive();
  const [state, setState] = useState<OfferState>({ state: "none" });
  const [open, setOpen] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);
  const hiddenBefore = useSyncExternalStore(noSubscribe, () => storage("session")?.getItem(CHIP_HIDDEN_KEY) === "1", () => true);
  const chipHidden = hiddenNow || hiddenBefore;
  const recent = useSyncExternalStore(noSubscribe, recentVisitor, () => false);
  const quiet = QUIET.some((re) => re.test(pathname));

  useEffect(() => {
    if (loading || (!entitlement.signedIn && !recent)) return;
    let cancelled = false;
    fetch("/api/offers", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<OfferState>) : { state: "none" as const }))
      .then((s) => !cancelled && setState(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, entitlement.signedIn, entitlement.tier, recent]);

  const offer = state.state === "offer";
  const slug = state.state === "offer" ? state.offer.slug : "";
  const show = useCallback(() => {
    storage("local")?.setItem(SHOWN_KEY(slug), "1");
    setOpen(true);
  }, [slug]);

  // Lets the walkthrough's last step name the offer that follows it.
  useEffect(() => {
    if (offer) document.documentElement.dataset.offer = "offer";
    else delete document.documentElement.dataset.offer;
  }, [offer]);

  // Opens by itself once: after the walkthrough closes, or a few seconds in where it won't run.
  useEffect(() => {
    if (!offer || quiet || storage("local")?.getItem(SHOWN_KEY(slug)) === "1") return;
    const afterTour = () => window.setTimeout(show, 350);
    window.addEventListener(TOUR_CLOSED_EVENT, afterTour);
    let timer: number | undefined;
    if (tourDone() || !tourStartsOn(pathname)) {
      timer = window.setTimeout(() => {
        if (!priorityHeld) show();
      }, AUTO_DELAY_MS);
    }
    return () => {
      window.removeEventListener(TOUR_CLOSED_EVENT, afterTour);
      window.clearTimeout(timer);
    };
    // priorityHeld is read when the timer fires; another popup showing just means the chip carries it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, slug, quiet, pathname, show]);

  // Anything (the walkthrough's last step, a banner) can ask for it.
  useEffect(() => {
    const onOpen = () => offer && setOpen(true);
    window.addEventListener(OPEN_OFFER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_OFFER_EVENT, onOpen);
  }, [offer]);

  const now = useNow(state.state !== "none");
  const endsAt = state.state === "offer" ? (state.deadline ? Date.parse(state.deadline) : null) : state.state === "active" ? Date.parse(state.until) : 0;
  const left = endsAt === null ? null : endsAt - now;
  const live = state.state !== "none" && (left === null || left > 0);

  if (!live) return null;
  return (
    <>
      {!quiet && !chipHidden && !open && !priorityHeld && (
        <Chip
          state={state}
          left={left}
          onOpen={() => setOpen(true)}
          onHide={() => {
            storage("session")?.setItem(CHIP_HIDDEN_KEY, "1");
            setHiddenNow(true);
          }}
        />
      )}
      {open && state.state === "offer" && <Sheet offer={state.offer} signedIn={state.signedIn} left={left} onClose={() => setOpen(false)} />}
    </>
  );
}

function Chip({ state, left, onOpen, onHide }: { state: OfferState; left: number | null; onOpen: () => void; onHide: () => void }) {
  const body =
    state.state === "active" ? (
      <>
        <Star />
        <span className="text-xs font-semibold text-ink">{tierName(state.tier)} on</span>
        {left !== null && <span className="tnum font-mono text-[11px] text-gold">{formatLeft(left)} left</span>}
      </>
    ) : state.state === "offer" ? (
      <>
        <Star />
        <span className="text-xs font-semibold text-ink">
          {shortName(state.offer)} · {naira(state.offer.priceNaira)}
        </span>
        {left !== null && <span className="tnum font-mono text-[11px] text-gold">{formatLeft(left)}</span>}
      </>
    ) : null;
  return (
    <div className="fixed left-1/2 z-40 -translate-x-1/2 lift-above-bottom-nav animate-rise">
      <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/40 bg-shell/95 py-1 pl-1 pr-1.5 shadow-2xl backdrop-blur-md">
        {state.state === "active" ? (
          <Link href="/account" className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2">
            {body}
          </Link>
        ) : (
          <button type="button" onClick={onOpen} className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2" aria-haspopup="dialog">
            {body}
          </button>
        )}
        <button type="button" onClick={onHide} aria-label="Hide" className="grid size-6 place-items-center rounded-full text-ink-dim hover:bg-surface-2 hover:text-ink">
          <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Star() {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-gold text-[11px] font-black text-gold-ink" aria-hidden>
      ★
    </span>
  );
}

function Sheet({ offer, signedIn, left, onClose }: { offer: PublicOffer; signedIn: boolean; left: number | null; onClose: () => void }) {
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(true, onClose);
  useClaimsPriorityPopup(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: offer.slug }),
      });
      const data = (await res.json()) as { authorization_url?: string; error?: string };
      if (data.authorization_url) {
        window.location.assign(data.authorization_url);
        return;
      }
      setError(data.error ?? "Couldn't start checkout. Try again.");
    } catch {
      setError("Couldn't start checkout. Try again.");
    }
    setPending(false);
  }

  const cta = `${offer.cta} · ${naira(offer.priceNaira)}`;
  const eyebrow = offer.audience === "new_visitors" ? "New here" : "Members' offer";
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-overlay-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-line bg-shell shadow-2xl animate-sheet-in sm:rounded-3xl"
      >
        {/* Gold wash and a fine dot grain behind the header. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--color-gold)_26%,transparent),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-40 [background-image:radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

        <div className="relative px-6 pb-6 pt-5 sm:px-7">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-surface-2 text-ink-dim hover:text-ink"
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <p className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
            {eyebrow}
            {left !== null && (
              <>
                {" "}· ends in <span className="tnum">{formatLeft(left)}</span>
              </>
            )}
          </p>
          <h2 id="offer-title" className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
            {offer.headline}
          </h2>
          {offer.subline && <p className="mt-1 text-sm text-ink-muted">{offer.subline}</p>}

          <div className="mt-5 flex items-baseline gap-2.5">
            <span className="font-display text-5xl font-extrabold tracking-tight text-ink">{naira(offer.priceNaira)}</span>
            {offer.compareNaira && <span className="text-sm text-ink-dim line-through decoration-ink-dim/60">{naira(offer.compareNaira)}/mo</span>}
          </div>

          <ul className="mt-5 space-y-2.5">
            {offer.perks.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold/15 text-gold" aria-hidden>
                  <svg viewBox="0 0 12 12" className="size-2.5">
                    <path d="M2.5 6.2l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-ink">{p}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-2">
            {signedIn ? (
              <button
                type="button"
                onClick={checkout}
                disabled={pending}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-bold text-gold-ink transition-colors hover:bg-gold-strong disabled:opacity-70"
              >
                {pending ? <Spinner className="size-4" /> : null}
                {pending ? "Opening checkout…" : cta}
              </button>
            ) : (
              <Link
                href={`/account/sign-up?next=${encodeURIComponent(offerPath(offer.slug))}`}
                onClick={onClose}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gold px-4 text-sm font-bold text-gold-ink transition-colors hover:bg-gold-strong"
              >
                {cta}
              </Link>
            )}
            {error && <p className="text-center text-xs text-rose">{error}</p>}
            <button type="button" onClick={onClose} className="min-h-10 w-full text-xs font-medium text-ink-dim hover:text-ink">
              Not now
            </button>
          </div>
          <p className="text-center text-[11px] text-ink-dim">
            {signedIn ? "Transfer, OPay, PalmPay, USSD or card." : "Takes a free account. 20 seconds."} Once per account.
          </p>
        </div>
      </div>
    </div>
  );
}
