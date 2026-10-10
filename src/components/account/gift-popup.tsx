"use client";

import { useEffect, useState } from "react";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useOverlay } from "@/components/ui/use-overlay";
import { useClaimsPriorityPopup } from "@/components/ui/popup-priority";
import { Confetti } from "@/components/ui/confetti";
import { Button } from "@/components/ui/primitives";
import type { Tier } from "@/lib/entitlements";

interface PendingGift {
  id: string;
  tier: Tier;
  expiresAt: string;
  note: string | null;
}

const TIER_LABEL: Record<Tier, string> = { free: "Free", pass: "Pass", pro: "Pro", vip: "VIP" };

/**
 * A one-time celebratory overlay for an admin-granted subscription gift
 * (see src/app/actions/admin/gifts.ts). Unlike WhatsAppPopup, "seen" state
 * lives server-side (subscription_gifts.seen_at), not localStorage — a gift
 * is a one-off event tied to the account, not a daily nudge, so it must
 * still be honoured on a different device. Renders nothing for signed-out
 * visitors or once there's nothing unseen to show.
 */
export function GiftPopup() {
  const { entitlement, loading } = useEntitlement();
  const [gift, setGift] = useState<PendingGift | null>(null);
  const close = () => setGift(null);
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(!!gift, close);
  useClaimsPriorityPopup(!!gift);

  useEffect(() => {
    if (loading || !entitlement.signedIn) return;
    let cancelled = false;
    fetch("/api/gifts/pending", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { gift: PendingGift | null }) => {
        if (!cancelled && data.gift) setGift(data.gift);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, entitlement.signedIn]);

  useEffect(() => {
    if (!gift) return;
    // Marks it seen the moment it's actually shown — same posture as the
    // WhatsApp popup's snooze-on-show, not gated behind an explicit dismiss.
    fetch("/api/gifts/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftId: gift.id }),
    }).catch(() => {});
  }, [gift]);

  if (!gift) return null;

  const until = new Date(gift.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-canvas/70 p-4 backdrop-blur-sm">
      <Confetti />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-popup-title"
        className="card relative w-full max-w-sm overflow-hidden p-6 text-center"
      >
        <button
          ref={initialFocusRef}
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-surface-2 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          ✕
        </button>

        <div className="mx-auto grid size-14 place-items-center rounded-full border border-gold/30 bg-gold/12 text-2xl">🎁</div>

        <h2 id="gift-popup-title" className="font-display mt-4 text-xl font-bold text-ink">
          Congratulations!
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          KiqStat just gifted you <strong className="text-ink">{TIER_LABEL[gift.tier]}</strong> — free, on the house.
        </p>
        {gift.note && (
          <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm italic text-ink-muted">&ldquo;{gift.note}&rdquo;</p>
        )}
        <p className="mt-3 text-xs text-ink-dim">Active through {until}.</p>

        <Button type="button" variant="primary" className="mt-5 w-full" onClick={close}>
          Let&rsquo;s go
        </Button>
      </div>
    </div>
  );
}
