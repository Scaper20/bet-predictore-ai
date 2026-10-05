"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SlidingTabs } from "@/components/motion/sliding-tabs";

export interface MatchTab {
  key: string;
  label: string;
  panel: ReactNode;
}

/**
 * The match page's sections as tabs: one screen of what matters instead of
 * a long scroll through every panel.
 *
 * Every panel is rendered on the server and stays in the document (inactive
 * ones are `hidden`), so search engines and no-JS readers still get all of
 * it and switching is instant. The bar sticks under the site header; the
 * chosen tab is kept in the URL hash (#markets) so it survives a refresh
 * and can be shared. A new panel slides in from the side its tab sits on.
 */
export function MatchTabs({ tabs }: { tabs: MatchTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const [dir, setDir] = useState<"left" | "right" | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (h && tabs.some((t) => t.key === h)) {
        setDir(null);
        setActive(h);
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const choose = (key: string) => {
    if (key === active) return;
    const from = tabs.findIndex((t) => t.key === active);
    const to = tabs.findIndex((t) => t.key === key);
    setDir(to > from ? "right" : "left");
    setActive(key);
    history.replaceState(null, "", key === tabs[0]?.key ? window.location.pathname + window.location.search : `#${key}`);
    // If the bar is stuck to the header, bring the new panel's top into view.
    const el = bar.current;
    if (el) {
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) * 16 || 64;
      const top = el.getBoundingClientRect().top;
      if (top <= headerH + 1) window.scrollTo({ top: window.scrollY + top - headerH, behavior: "smooth" });
    }
  };

  return (
    <div>
      <div ref={bar} className="sticky top-[var(--header-h)] z-20 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:mx-0 sm:px-0">
        <SlidingTabs
          ariaLabel="Match sections"
          variant="underline"
          value={active}
          onChange={choose}
          className="border-b-0"
          tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
        />
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          aria-label={t.label}
          hidden={t.key !== active}
          className={`pt-5 ${t.key === active && dir ? (dir === "right" ? "panel-in-right" : "panel-in-left") : ""}`}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
