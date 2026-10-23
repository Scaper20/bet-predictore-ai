import Link from "next/link";
import { sportPath, type SportRoute } from "@/lib/routes";

const TABS: { route: SportRoute; label: string }[] = [
  { route: "codeHub", label: "Today's codes" },
  { route: "codeEditor", label: "Code editor" },
  { route: "codeCommunity", label: "Community" },
];

/** The Code Hub's three pages, one row, scrolling sideways on a narrow phone. */
export function HubTabs({ active }: { active: SportRoute }) {
  return (
    <nav aria-label="Code Hub" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const on = t.route === active;
        return (
          <Link
            key={t.route}
            href={sportPath(t.route)}
            aria-current={on ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              on ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
