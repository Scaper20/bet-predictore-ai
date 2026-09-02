"use client";

import Link from "next/link";
import { useSlip } from "@/lib/slip";
import { sportPath } from "@/lib/routes";
import type { SportId } from "@/lib/sports";

/**
 * The selection builder, demoted from a nav link to an icon with a count.
 *
 * It was one of six equal-weight nav items, which is the wrong shape for it:
 * an empty slip is not a destination anyone wants, and a slip with three legs
 * in it is the strongest return-visit hook the product has. As a counter it
 * costs a fraction of the space and only speaks up when it has something to
 * say.
 *
 * The count comes from localStorage via useSlip, so it renders as zero on the
 * server and corrects after hydration — the badge is therefore conditional on
 * a non-zero count rather than always present, which makes the correction
 * read as an arrival instead of a flicker.
 */
export function SlipButton({ sport }: { sport: SportId }) {
  const { legs } = useSlip();
  const count = legs.length;

  return (
    <Link
      href={sportPath("slip", sport)}
      className="relative grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={count > 0 ? `Selections (${count})` : "Selections"}
      title="Selections"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14l-3-2-2 2-2-2-2 2-2-2-3 2V5Z" />
        <path strokeLinecap="round" d="M8.5 9.5h7M8.5 13h4" />
      </svg>
      {count > 0 && (
        <span
          className="tnum absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink"
          aria-hidden
        >
          {count}
        </span>
      )}
    </Link>
  );
}
