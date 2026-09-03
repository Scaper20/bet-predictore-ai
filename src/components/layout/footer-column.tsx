"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * A footer link column that collapses on a phone and never does anywhere else.
 *
 * The footer is 1,162px on a 390px screen — a fifth of every page, fourteen
 * links in three permanently-expanded stacks, repeated on every route. On
 * desktop that is a site map you take in at a glance; on a phone it is four
 * screens of scrolling past the thing you were actually reading.
 *
 * Deliberately NOT <details>. Its content is hidden by the user-agent stylesheet
 * (now via ::details-content), and forcing it open again from a media query
 * relies on implementation details that differ between engines. A button and a
 * class is boring and works everywhere.
 *
 * The heading renders twice — a button below sm, a plain <h3> at and above it —
 * because the desktop version must not be a disabled button carrying a stale
 * aria-expanded. Only ever one is in the accessibility tree; the other is
 * display:none.
 */
export function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-line py-1 sm:border-0 sm:py-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:hidden"
      >
        {title}
        <span
          className={`text-ink-dim transition-transform ${open ? "rotate-45" : ""}`}
          aria-hidden
        >
          +
        </span>
      </button>

      <h3 className="hidden text-sm font-semibold sm:block">{title}</h3>

      <ul className={`space-y-2.5 pb-3 sm:mt-4 sm:block sm:pb-0 ${open ? "block" : "hidden"}`}>
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-ink-muted transition-colors hover:text-brand"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
