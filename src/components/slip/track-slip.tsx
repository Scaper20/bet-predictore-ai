"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSlip } from "@/lib/slip";
import { isTracked, trackSlip, useTrackedSlips } from "@/lib/tracked-slips";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { sportPath } from "@/lib/routes";

/**
 * "Track this slip" on the selection builder. Saves a frozen copy of the
 * current selections to My slips; once saved, the same set of selections
 * shows as already tracked instead of saving a duplicate.
 */
export function TrackSlipButton() {
  const { legs } = useSlip();
  const tracked = useTrackedSlips();
  const router = useRouter();

  if (legs.length === 0) return null;
  const existing = isTracked(tracked, legs);

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Track it</h2>
        {existing && <span className="text-xs text-brand">✓ Tracking</span>}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
        Follow every leg live — scores, what&apos;s on track and how the slip settles — without
        coming back to each match.
      </p>
      {existing ? (
        <ButtonLink href={sportPath("trackedSlips")} variant="secondary" className="mt-4 w-full py-2.5">
          View in My slips
        </ButtonLink>
      ) : (
        <Button
          type="button"
          className="mt-4 w-full py-2.5"
          onClick={() => {
            if (trackSlip(legs)) router.push(sportPath("trackedSlips"));
          }}
        >
          Track this slip
        </Button>
      )}
    </div>
  );
}

/** Quiet link to My slips, with a count once there's something in it. */
export function MySlipsLink({ className = "" }: { className?: string }) {
  const tracked = useTrackedSlips();
  return (
    <Link
      href={sportPath("trackedSlips")}
      className={`inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong ${className}`}
    >
      My slips
      {tracked.length > 0 && (
        <span className="tnum grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">
          {tracked.length}
        </span>
      )}
    </Link>
  );
}
