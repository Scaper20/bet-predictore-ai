"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * A footer link column that collapses on touch widths and never does above them.
 *
 * The footer is 1,162px on a 390px screen — a fifth of every page, fourteen
 * links in three permanently-expanded stacks, repeated on every route. On
 * desktop that is a site map you take in at a glance; on a phone it is four
 * screens of scrolling past the thing you were actually reading.
 *
 * The boundary is lg, not sm, because that is where the rest of the mobile
 * system already lives: the bottom bar, the drawer and the desktop nav all
 * switch at 1024. At sm this footer was expanding into a desktop site map at
 * 640 while the page around it was still in mobile chrome — and expanded means
 * bare 16px-tall text links, which is a poor tap target on the tablet widths
 * that sat in that gap. Below lg the links carry real vertical padding; from
 * lg they go back to the tight rhythm a pointer wants.
 *
 * Deliberately NOT <details>. Its content is hidden by the user-agent stylesheet
 * (now via ::details-content), and forcing it open again from a media query
 * relies on implementation details that differ between engines. A button and a
 * class is boring and works everywhere.
 *
 * The heading renders twice — a button below lg, a plain <h3> at and above it —
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
    <div className="border-b border-line py-1 lg:border-0 lg:py-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
      >
        {title}
        <span
          className={`text-ink-dim transition-transform ${open ? "rotate-45" : ""}`}
          aria-hidden
        >
          +
        </span>
      </button>

      <h3 className="hidden text-sm font-semibold lg:block">{title}</h3>

      <ul className={`space-y-1 pb-3 lg:mt-4 lg:block lg:space-y-2.5 lg:pb-0 ${open ? "block" : "hidden"}`}>
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="-mx-2 block rounded-lg px-2 py-2 text-sm text-ink-muted transition-colors hover:text-brand lg:mx-0 lg:px-0 lg:py-0"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
