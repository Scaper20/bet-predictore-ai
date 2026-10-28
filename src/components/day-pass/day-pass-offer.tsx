"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useOverlay } from "@/components/ui/use-overlay";
import { useClaimsPriorityPopup, usePriorityPopupActive } from "@/components/ui/popup-priority";
import { Spinner } from "@/components/ui/primitives";
import { planById } from "@/lib/pricing";
import { OPEN_DAY_PASS_EVENT, TOUR_CLOSED_EVENT, tourDone, tourStartsOn } from "@/lib/tour";
import {
  DAY_PASS_PATH,
  DAY_PASS_PRICE_NAIRA,
  FIRST_SEEN_COOKIE,
  OFFER_HOURS,
  firstSeenFrom,
  formatLeft,
  type DayPassState,
} from "@/lib/day-pass";

/**
 * The VIP day pass offer (lib/day-pass.ts) for new visitors and members.
 *
 * Two pieces. A sheet that opens once by itself: straight after the
 * walkthrough, whether it was finished or skipped, or a few seconds into
 * the visit on a page where the walkthrough doesn't run. And a small chip
 * with the countdown that keeps the offer one tap away for the rest of its
 * 24 hours, then turns into the pass's own clock once bought.
 *
 * Signed out, the window is read from the first-visit cookie with no
 * request; signed in, from /api/billing/day-pass, which also knows the
 * account's age and whether a pass was already bought.
 */

const SHOWN_KEY = "kiqstat.daypass.shown";
const CHIP_HIDDEN_KEY = "kiqstat.daypass.chip";
const AUTO_DELAY_MS = 6000;
/** Where neither the sheet nor the chip belong. */
const QUIET = [/^\/account/, /^\/onboarding/, /^\/admin/, /^\/pricing/, /^\/vip\/day-pass/, /^\/auth/];

const VIP_MONTHLY = planById("vip").price.monthly ?? 0;
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

const PERKS = [
  { title: "Pro-league picks before kick-off", sub: "Champions League, Serie A, Bundesliga and 12 more" },
  { title: "Every Code Hub combo", sub: "2 to 20 odds, each with a SportyBet code" },
  { title: "Every prediction type", sub: "Corners, cards, shots, halves, live win probability" },
];

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function cookieDeadline(): number | null {
  const raw = document.cookie.match(new RegExp(`(?:^|; )${FIRST_SEEN_COOKIE}=([^;]*)`))?.[1];
  const seen = firstSeenFrom(raw);
  return seen ? seen + OFFER_HOURS * 3_600_000 : null;
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

export function DayPassOffer() {
  const pathname = usePathname();
  const { entitlement, loading } = useEntitlement();
  const priorityHeld = usePriorityPopupActive();
  const [fetched, setFetched] = useState<DayPassState>({ state: "none" });
  const [open, setOpen] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);
  const hiddenBefore = useSyncExternalStore(noSubscribe, () => storage("session")?.getItem(CHIP_HIDDEN_KEY) === "1", () => true);
  const chipHidden = hiddenNow || hiddenBefore;
  const deadline = useSyncExternalStore(noSubscribe, cookieDeadline, () => null);
  const quiet = QUIET.some((re) => re.test(pathname));

  // Signed in: the server knows the account's age and any pass already bought.
  useEffect(() => {
    if (loading || !entitlement.signedIn) return;
    let cancelled = false;
    fetch("/api/billing/day-pass", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DayPassState>) : { state: "none" as const }))
      .then((s) => !cancelled && setFetched(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, entitlement.signedIn, entitlement.tier]);

  // Signed out: the first-visit cookie alone.
  const state: DayPassState = loading
    ? { state: "none" }
    : entitlement.signedIn
      ? fetched
      : deadline
        ? { state: "offer", deadline: new Date(deadline).toISOString(), signedIn: false }
        : { state: "none" };

  const offer = state.state === "offer";
  // Lets the walkthrough's last step name the offer that follows it.
  useEffect(() => {
    if (offer) document.documentElement.dataset.dayPass = "offer";
    else delete document.documentElement.dataset.dayPass;
  }, [offer]);
  const show = useCallback(() => {
    storage("local")?.setItem(SHOWN_KEY, "1");
    setOpen(true);
  }, []);

  // Opens by itself once: after the walkthrough closes, or a few seconds in where it won't run.
  useEffect(() => {
    if (!offer || quiet || storage("local")?.getItem(SHOWN_KEY) === "1") return;
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
  }, [offer, quiet, pathname, show]);

  // Anything (the walkthrough's last step, a banner) can ask for it.
  useEffect(() => {
    const onOpen = () => offer && setOpen(true);
    window.addEventListener(OPEN_DAY_PASS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DAY_PASS_EVENT, onOpen);
  }, [offer]);

  const now = useNow(state.state !== "none");
  const endsAt = state.state === "offer" ? Date.parse(state.deadline) : state.state === "active" ? Date.parse(state.until) : 0;
  const left = endsAt - now;
  const live = state.state !== "none" && left > 0;

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
      {open && state.state === "offer" && <Sheet signedIn={state.signedIn} left={left} onClose={() => setOpen(false)} />}
    </>
  );
}

function Chip({ state, left, onOpen, onHide }: { state: DayPassState; left: number; onOpen: () => void; onHide: () => void }) {
  const active = state.state === "active";
  const body = (
    <>
      <span className="grid size-6 place-items-center rounded-full bg-gold text-[11px] font-black text-gold-ink" aria-hidden>
        ★
      </span>
      <span className="text-xs font-semibold text-ink">{active ? "VIP on" : `VIP 24h · ${naira(DAY_PASS_PRICE_NAIRA)}`}</span>
      <span className="tnum font-mono text-[11px] text-gold">{formatLeft(left)}{active ? " left" : ""}</span>
    </>
  );
  return (
    <div className="fixed left-1/2 z-40 -translate-x-1/2 lift-above-bottom-nav animate-rise">
      <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/40 bg-shell/95 py-1 pl-1 pr-1.5 shadow-2xl backdrop-blur-md">
        {active ? (
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

function Sheet({ signedIn, left, onClose }: { signedIn: boolean; left: number; onClose: () => void }) {
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(true, onClose);
  useClaimsPriorityPopup(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/day-pass", { method: "POST" });
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

  const cta = `Get VIP for ${naira(DAY_PASS_PRICE_NAIRA)}`;
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-overlay-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-pass-title"
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
            New here · ends in <span className="tnum">{formatLeft(left)}</span>
          </p>
          <h2 id="day-pass-title" className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
            VIP for 24 hours
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Everything, unlocked. One payment, no renewal.</p>

          <div className="mt-5 flex items-baseline gap-2.5">
            <span className="font-display text-5xl font-extrabold tracking-tight text-ink">{naira(DAY_PASS_PRICE_NAIRA)}</span>
            {VIP_MONTHLY > 0 && <span className="text-sm text-ink-dim line-through decoration-ink-dim/60">{naira(VIP_MONTHLY)}/mo</span>}
          </div>

          <ul className="mt-5 space-y-3">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold/15 text-gold" aria-hidden>
                  <svg viewBox="0 0 12 12" className="size-2.5">
                    <path d="M2.5 6.2l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{p.title}</span>
                  <span className="block text-xs text-ink-dim">{p.sub}</span>
                </span>
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
                href={`/account/sign-up?next=${encodeURIComponent(DAY_PASS_PATH)}`}
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
