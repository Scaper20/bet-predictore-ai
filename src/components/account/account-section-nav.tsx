"use client";

import { useEffect, useState } from "react";

/**
 * The account page's in-page tab rail.
 *
 * Real anchor links, not buttons: they work before hydration, they survive a
 * page refresh, and they can be shared. The client half only adds the
 * highlight — which section you are currently looking at — so if the
 * JavaScript never arrives the rail still navigates, it just stops keeping up.
 *
 * IntersectionObserver rather than a scroll handler, the same technique
 * <Reveal> already uses. `rootMargin` pulls the detection line up under the
 * sticky header so a section counts as current when it reaches the top of the
 * readable area rather than the top of the window.
 */
export function AccountSectionNav({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Topmost intersecting section wins, so scrolling up highlights the
        // one you are moving into rather than the one you are leaving.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur-xl sm:mx-0 sm:px-0">
      <nav aria-label="Account sections">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto py-2">
          {sections.map((s) => {
            const current = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={current ? "true" : undefined}
                  className={`block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    current ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
