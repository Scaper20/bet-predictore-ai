import type { NavIcon } from "@/lib/admin-access";

/*
 * The admin's line icons: 16px on a 24 grid, 1.75 stroke, currentColor, so
 * they take the nav's text colour (muted, then chalk when active). Drawn here
 * rather than pulled from an icon package: eighteen glyphs don't justify a
 * dependency, and these match the stroke weight of the site's own icons.
 */
const PATHS: Record<NavIcon | "search" | "menu" | "close" | "logout" | "external" | "lock" | "arrow" | "alert" | "check" | "clock", string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  card: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM3 10h18M7 15h4",
  handshake: "M8 12l3 3 2-2 3 3 4-4-6-6-3 3-2-2-6 6zM3 11l5 5",
  chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  send: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
  chat: "M4 5h16v11H9l-5 4z",
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  users: "M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  pulse: "M3 12h4l2.5-6 4 12 2.5-6H21",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  power: "M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM9 12l2 2 4-4",
  log: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7M9 8h3",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  lock: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  arrow: "M5 12h14M13 6l6 6-6 6",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
};

export type AdminIconName = keyof typeof PATHS;

export function AdminIcon({ name, className = "size-4" }: { name: AdminIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
