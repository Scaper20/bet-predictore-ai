"use client";

import { useEffect, useState } from "react";
import type { SlipView } from "@/components/slip/tracked-slip";
import { useOverlay } from "@/components/ui/use-overlay";
import { Spinner } from "@/components/ui/primitives";

/** The image URL for a tracked slip (api/slip/image renders it). */
export function slipImageUrl(view: SlipView): string {
  const legs = view.legs.map(({ leg, state }) => ({
    fixture: leg.fixture,
    label: leg.label,
    probability: leg.probability,
    league: leg.league,
    kickoff: leg.kickoff,
    result: state.kind === "settled" ? state.result.grade : null,
  }));
  return `/api/slip/image?legs=${encodeURIComponent(JSON.stringify(legs))}`;
}

type Img = { status: "loading" } | { status: "ready"; blob: Blob; url: string } | { status: "failed" };

/**
 * Share a tracked slip as a KiqStat slip image: a preview, then the phone's
 * own share sheet (WhatsApp, Telegram, X…) or a download. An image of the
 * picks and the model's chances, not a booking code.
 */
export function ShareSlipSheet({ view, onClose }: { view: SlipView; onClose: () => void }) {
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(true, onClose);
  const [img, setImg] = useState<Img>({ status: "loading" });
  const [note, setNote] = useState<string | null>(null);
  const src = slipImageUrl(view);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImg({ status: "ready", blob, url: objectUrl });
      })
      .catch(() => !cancelled && setImg({ status: "failed" }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const file = img.status === "ready" ? new File([img.blob], "kiqstat-slip.png", { type: "image/png" }) : null;
  const canShareFile = typeof navigator !== "undefined" && !!file && !!navigator.canShare?.({ files: [file] });

  const download = () => {
    if (img.status !== "ready") return;
    const a = document.createElement("a");
    a.href = img.url;
    a.download = "kiqstat-slip.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setNote("Saved to your downloads.");
  };

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "My KiqStat slip", text: "My slip on KiqStat · kiqstat.app" });
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if (err instanceof Error && err.name !== "AbortError") setNote("Couldn't open sharing here. Download the image instead.");
    }
  };

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="slip-fade absolute inset-0 bg-black/60" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share slip"
        className="slip-rise absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-line bg-shell shadow-2xl lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[30rem] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="font-display text-lg font-bold">Share slip</p>
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="grid min-h-48 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
            {img.status === "loading" && <Spinner className="size-6" />}
            {img.status === "failed" && <p className="px-6 py-10 text-center text-sm text-ink-muted">Couldn&apos;t make the image. Close and try again.</p>}
            {img.status === "ready" && (
              // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, which next/image can't optimise
              <img src={img.url} alt="Your KiqStat slip" className="block w-full" />
            )}
          </div>
        </div>

        <div className="space-y-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {canShareFile && (
            <button
              type="button"
              onClick={() => void share()}
              className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink hover:bg-brand-strong"
            >
              Share
            </button>
          )}
          <button
            type="button"
            onClick={download}
            disabled={img.status !== "ready"}
            className={`w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50 ${
              canShareFile ? "border border-line text-ink hover:bg-surface-2" : "bg-brand text-brand-ink hover:bg-brand-strong"
            }`}
          >
            Download image
          </button>
          {note && <p className="text-center text-xs text-ink-dim">{note}</p>}
        </div>
      </div>
    </div>
  );
}
