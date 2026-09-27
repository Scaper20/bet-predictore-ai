"use client";

import { useRef, useState } from "react";
import { enqueueOutreach, sendOutreachBatch } from "@/app/actions/admin/outreach";
import { Button, Badge, Spinner } from "@/components/ui/primitives";
import type { CampaignType } from "@/lib/outreach";

const BATCH_PAUSE_MS = 800;

interface Progress {
  pending: number;
  sent: number;
  failed: number;
}

/**
 * One campaign's card on /admin/outreach: queue eligible recipients, then
 * drain the queue in small batches. The drain loop is a plain async
 * function kicked off from a click handler, not a useEffect — calling
 * setState repeatedly from inside an effect is exactly the
 * react-hooks/set-state-in-effect trap this codebase has already hit
 * twice (WhatsApp popup, feedback widget), and a manual loop sidesteps it
 * entirely while giving a "Stop" button real teeth.
 */
export function OutreachCampaignPanel({
  campaign,
  label,
  description,
  initialProgress,
}: {
  campaign: CampaignType;
  label: string;
  description: string;
  initialProgress: Progress;
}) {
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [enqueuing, setEnqueuing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function handleEnqueue() {
    setEnqueuing(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.set("campaign", campaign);
    const result = await enqueueOutreach({ error: null, message: null, enqueued: null }, fd);
    setEnqueuing(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(result.message);
    if (result.enqueued) {
      setProgress((p) => ({ ...p, pending: p.pending + result.enqueued! }));
    }
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    setMessage(null);
    stopRef.current = false;

    while (!stopRef.current) {
      const fd = new FormData();
      fd.set("campaign", campaign);
      const result = await sendOutreachBatch({ sent: 0, failed: 0, remaining: 0, error: null }, fd);
      if (result.error) {
        setError(result.error);
        break;
      }
      setProgress((p) => ({ pending: result.remaining, sent: p.sent + result.sent, failed: p.failed + result.failed }));
      if (result.remaining === 0) break;
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
    setSending(false);
  }

  function handleStop() {
    stopRef.current = true;
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Badge tone="neutral">{progress.pending} pending</Badge>
          <Badge tone="brand">{progress.sent} sent</Badge>
          {progress.failed > 0 && <Badge tone="rose">{progress.failed} failed</Badge>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={enqueuing} onClick={handleEnqueue} className="text-xs">
          {enqueuing && <Spinner className="size-3.5" />}
          {enqueuing ? "Queuing…" : "Queue eligible recipients"}
        </Button>
        {sending ? (
          <Button type="button" variant="secondary" onClick={handleStop} className="text-xs">
            Stop
          </Button>
        ) : (
          <Button type="button" variant="primary" disabled={progress.pending === 0} onClick={handleSend} className="text-xs">
            Send {progress.pending > 0 ? `(${progress.pending} pending)` : ""}
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-rose">{error}</p>}
      {message && <p className="mt-3 text-xs text-brand">{message}</p>}
    </div>
  );
}
