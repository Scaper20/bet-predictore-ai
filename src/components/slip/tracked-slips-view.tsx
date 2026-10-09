"use client";

import { useState, useSyncExternalStore } from "react";
import { untrackSlip, useTrackedSlips } from "@/lib/tracked-slips";
import { useSlipScores } from "@/components/slip/use-slip-scores";
import { TrackedSlipCard, TrackedSlipRow, viewSlip, type SlipView } from "@/components/slip/tracked-slip";
import { useOverlay } from "@/components/ui/use-overlay";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { openSlipSheet } from "@/components/layout/nav-actions";

const noop = () => () => {};
/** False on the server and during hydration, so the empty state doesn't flash before localStorage is read. */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function TrackedSlipsView() {
  const mounted = useMounted();
  const slips = useTrackedSlips();
  const scores = useSlipScores(slips);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!mounted) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  if (slips.length === 0) {
    return (
      <EmptyState
        icon="🧾"
        title="No slips tracked yet"
        description="Build a slip, then tap “Track this slip”."
        action={
          <Button variant="secondary" onClick={openSlipSheet}>
            Open your slip
          </Button>
        }
      />
    );
  }

  const views = slips.map((slip) => ({ slip, view: viewSlip(slip, scores) }));
  const active = views.filter(({ view }) => view.status === "live" || view.status === "pending");
  const settled = views.filter(({ view }) => view.status !== "live" && view.status !== "pending");
  const open = views.find(({ slip }) => slip.id === openId);

  return (
    <>
      <div className="space-y-8">
        {active.length > 0 && (
          <Section title="In play & upcoming">
            {active.map(({ slip, view }) => (
              <TrackedSlipRow key={slip.id} view={view} onOpen={() => setOpenId(slip.id)} />
            ))}
          </Section>
        )}
        {settled.length > 0 && (
          <Section title="Settled">
            {settled.map(({ slip, view }) => (
              <TrackedSlipRow key={slip.id} view={view} onOpen={() => setOpenId(slip.id)} />
            ))}
          </Section>
        )}
      </div>

      {open && (
        <SlipOverlay
          view={open.view}
          onClose={() => setOpenId(null)}
          onRemove={() => {
            untrackSlip(open.slip.id);
            setOpenId(null);
          }}
        />
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function SlipOverlay({ view, onClose, onRemove }: { view: SlipView; onClose: () => void; onRemove: () => void }) {
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(true, onClose);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-canvas/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tracked slip"
        className="mx-auto w-full max-w-lg px-4 pb-10"
        style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}
      >
        <div className="mb-3 flex justify-end">
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Close ✕
          </button>
        </div>
        <TrackedSlipCard view={view} />
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-2 text-xs"
            onClick={() => {
              if (window.confirm("Stop tracking this slip? It will be removed from this device.")) onRemove();
            }}
          >
            Stop tracking this slip
          </Button>
        </div>
      </div>
    </div>
  );
}
