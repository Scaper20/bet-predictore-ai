"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlip } from "@/lib/slip";
import { sportPath, sportFromPathname, type SportRoute } from "@/lib/routes";

/**
 * Primary navigation for a thumb.
 *
 * Not a miniature of the desktop nav, and the difference is the whole point.
 * Desktop navigation is a site map — it shows what exists. Thumb navigation is
 * a frequency ranking — it shows what you reach for on a matchday. Conflating
 * the two is what makes a mobile site feel like a shrunk desktop one.
 *
 * So Fixtures, Track Record, Trends and Pricing are not here. Fixtures is
 * reachable from both Live and Predictions; Track Record is a trust document
 * read once or twice, not on every visit; Pricing belongs beside an upgrade
 * prompt rather than in permanent chrome. All of them keep a real link in the
 * drawer behind "More".
 *
 * Deliberately static — no hide-on-scroll. A bar that disappears makes people
 * scroll up to find it, which costs more than the 56px it saves.
 */

const HEIGHT_CLASS = "h-14"; // 56px — mirrors --bottom-nav-h in globals.css.

type Item =
  | { route: SportRoute; label: string; icon: IconName }
  | { action: "more"; label: string; icon: IconName };

const ITEMS: readonly Item[] = [
  { route: "forYou", label: "For You", icon: "star" },
  { route: "live", label: "Live", icon: "live" },
  // "Predictions" does not fit under a 20px icon at this type size, and a
  // truncated label is worse than a shorter true one.
  { route: "predictions", label: "Picks", icon: "chart" },
  { route: "slip", label: "Slip", icon: "slip" },
  { action: "more", label: "More", icon: "more" },
];

export function BottomNav({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const sport = sportFromPathname(pathname);
  const { legs } = useSlip();
  const slipCount = legs.length;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-shell/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className={`grid grid-cols-5 ${HEIGHT_CLASS}`}>
        {ITEMS.map((item) => {
          if ("action" in item) {
            return (
              <li key={item.action} className="contents">
                <button
                  type="button"
                  onClick={onOpenMenu}
                  aria-expanded={menuOpen}
                  aria-label="More"
                  className={cell(menuOpen)}
                >
                  <Icon name={item.icon} active={menuOpen} />
                  <Label active={menuOpen}>{item.label}</Label>
                </button>
              </li>
            );
          }

          const href = sportPath(item.route, sport);
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href} className="contents">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cell(active)}
              >
                <span className="relative">
                  <Icon name={item.icon} active={active} />
                  {item.route === "slip" && slipCount > 0 && (
                    <span
                      className="tnum absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-ink"
                      aria-hidden
                    >
                      {slipCount}
                    </span>
                  )}
                </span>
                <Label active={active}>{item.label}</Label>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The active state carries three signals, not just hue: colour, a tinted
 * backing pill and a heavier label. Colour alone fails a colourblind reader
 * and washes out on a sunlit screen, which is most of this audience.
 */
function cell(active: boolean): string {
  return [
    "flex h-full w-full flex-col items-center justify-center gap-1 transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
    active ? "text-brand" : "text-ink-dim hover:text-ink-muted",
  ].join(" ");
}

function Label({ active, children }: { active: boolean; children: string }) {
  return (
    <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
      {children}
    </span>
  );
}

type IconName = "star" | "live" | "chart" | "slip" | "more";

function Icon({ name, active }: { name: IconName; active: boolean }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: active ? 2.3 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-5",
    "aria-hidden": true,
  };

  switch (name) {
    case "star":
      return (
        <svg {...common}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
        </svg>
      );
    case "live":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M6.2 6.2a8.2 8.2 0 000 11.6M17.8 6.2a8.2 8.2 0 010 11.6" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19V11M9.3 19V5M14.7 19v-7M20 19v-10" />
        </svg>
      );
    case "slip":
      return (
        <svg {...common}>
          <path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4Z" />
          <path d="M9 9h6M9 12.5h4" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
  }
}
