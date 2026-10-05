"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sportPath, sportFromPathname, type SportRoute } from "@/lib/routes";
import { isActive } from "@/lib/nav";
import { useLiveCount } from "@/components/layout/use-live-count";

/**
 * Primary navigation for a thumb.
 *
 * Not a miniature of the desktop nav: desktop navigation is a site map,
 * thumb navigation is a frequency ranking. For You and Live sit under the
 * left thumb, Forge is the raised centre action, Picks and More on the right.
 * The slip moved up beside Ask BetriX in the header, where it's visible on
 * every screen without spending a tab. Everything else is behind More.
 *
 * Deliberately static — no hide-on-scroll. A bar that disappears makes people
 * scroll up to find it, which costs more than the 56px it saves.
 */

const HEIGHT_CLASS = "h-14"; // 56px — mirrors --bottom-nav-h in globals.css.

type Tab = { route: SportRoute; label: string; icon: IconName };

const LEFT: readonly Tab[] = [
  { route: "forYou", label: "For You", icon: "star" },
  { route: "live", label: "Live", icon: "live" },
];
const RIGHT: readonly Tab[] = [
  // "Predictions" does not fit under a 20px icon at this type size.
  { route: "predictions", label: "Picks", icon: "chart" },
];

export function BottomNav({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const sport = sportFromPathname(pathname);
  const live = useLiveCount();
  const forgeHref = sportPath("forge", sport);
  const forgeActive = isActive(pathname, forgeHref);

  const tab = (t: Tab) => {
    const href = sportPath(t.route, sport);
    const active = !menuOpen && isActive(pathname, href);
    return (
      <li key={t.route} className="contents">
        <Link href={href} aria-current={active ? "page" : undefined} className={cell(active)}>
          <span className="relative">
            <Icon name={t.icon} active={active} />
            {t.route === "live" && live !== null && live > 0 && (
              <span
                className="tnum absolute -right-3 -top-1.5 grid min-w-4 place-items-center rounded-full bg-rose px-1 font-mono text-[9.5px] font-bold leading-4 text-canvas"
                aria-label={`${live} live`}
              >
                {live}
              </span>
            )}
          </span>
          <Label active={active}>{t.label}</Label>
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-shell/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className={`grid grid-cols-5 ${HEIGHT_CLASS}`}>
        {LEFT.map(tab)}

        {/* Forge: the raised centre action. */}
        <li className="contents">
          <Link
            href={forgeHref}
            aria-current={forgeActive ? "page" : undefined}
            className="flex h-full flex-col items-center justify-end gap-1 pb-1.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
          >
            <span
              className={`-mt-6 grid size-[52px] place-items-center rounded-full border-4 border-shell bg-brand text-brand-ink shadow-[0_6px_18px_-6px_rgb(0_244_142/0.6)] transition-transform active:scale-95 ${
                forgeActive ? "ring-2 ring-brand/40" : ""
              }`}
            >
              <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
                <path d="M13 3 5 14h6l-1 7 8-11h-6z" />
              </svg>
            </span>
            <Label active={forgeActive}>Forge</Label>
          </Link>
        </li>

        {RIGHT.map(tab)}

        <li className="contents">
          <button type="button" onClick={onOpenMenu} aria-expanded={menuOpen} aria-label="More" className={cell(menuOpen)}>
            <Icon name="more" active={menuOpen} />
            <Label active={menuOpen}>More</Label>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/**
 * The active state carries more than hue: colour, a heavier stroke and a
 * heavier label. Colour alone fails a colourblind reader and washes out on a
 * sunlit screen, which is most of this audience.
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
    <span className={`text-[10px] leading-none ${active ? "font-semibold text-brand" : "font-medium"}`}>{children}</span>
  );
}

type IconName = "star" | "live" | "chart" | "more";

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
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
  }
}
