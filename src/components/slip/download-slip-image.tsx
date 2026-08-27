"use client";

import { useState } from "react";
import { useSlip } from "@/lib/slip";
import { Button, Spinner } from "@/components/ui/primitives";

/**
 * Replaces the old "Quick-Slip" bookmaker-copy feature. This isn't a bet
 * code (see the removed quick-slip.tsx's own doc comment on why a real one
 * doesn't exist) — it's a branded image for personal reference or sharing,
 * generated server-side via next/og's ImageResponse (already proven in this
 * repo by opengraph-image.tsx).
 */
export function DownloadSlipImage() {
  const { legs } = useSlip();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (legs.length === 0) return null;

  async function download() {
    setPending(true);
    setFailed(false);
    try {
      const payload = legs.map((leg) => ({
        fixture: leg.fixture,
        label: leg.label,
        probability: leg.probability,
        fairOdds: leg.fairOdds,
      }));
      const url = `/api/slip/image?legs=${encodeURIComponent(JSON.stringify(payload))}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "betrix-slip.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Share your slip</h2>
        <span className="shrink-0 text-xs text-ink-dim">Branded image</span>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-ink-dim">
        A clean, branded image of your selections — not a code, nothing to redeem. Keep it as a
        reference or share it, so you don&apos;t need to come back to the site to remember your picks.
      </p>

      <Button type="button" onClick={() => void download()} disabled={pending} className="w-full">
        {pending && <Spinner className="size-4" />}
        {pending ? "Generating…" : "Download slip image"}
      </Button>
      {failed && <p className="mt-3 text-xs text-rose">Couldn&apos;t generate the image. Try again.</p>}
    </section>
  );
}
