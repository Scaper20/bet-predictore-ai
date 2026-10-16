"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";
import { isProLeague } from "@/lib/pro-leagues";

/**
 * Horizontal league chips; the active one is derived from the URL.
 * `proTags` marks the Pro leagues, for a free viewer.
 */
export function LeagueFilter({ proTags = false }: { proTags?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("league");

  const href = (code?: string) => {
    const next = new URLSearchParams(params.toString());
    if (code) next.set("league", code);
    else next.delete("league");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Chip href={href()} active={!active} label="All leagues" />
      {CLUB_LEAGUES.map((l) => (
        <Chip
          key={l.code}
          href={href(l.code)}
          active={active === l.code}
          label={l.shortName}
          flag={l.flag}
          pro={proTags && isProLeague(l.code)}
        />
      ))}
      <span className="flex shrink-0 items-center px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-dim" aria-hidden>
        National teams
      </span>
      {INTERNATIONAL_LEAGUES.map((l) => (
        <Chip
          key={l.code}
          href={href(l.code)}
          active={active === l.code}
          label={l.shortName}
          flag={l.flag}
        />
      ))}
    </div>
  );
}

function Chip({
  href,
  active,
  label,
  flag,
  pro = false,
}: {
  href: string;
  active: boolean;
  label: string;
  flag?: string;
  pro?: boolean;
}) {
  // py-2.5 over py-2 gives 42px rather than 38. These sit in a horizontally
  // scrolling row, where a tap landing slightly off is easy and costs a page
  // navigation to undo.
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-brand/40 bg-brand/12 text-brand"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
      }`}
    >
      {flag && <span aria-hidden>{flag}</span>}
      {label}
      {pro && (
        <span className="rounded-full bg-violet/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-violet">
          PRO<span className="sr-only"> league</span>
        </span>
      )}
    </Link>
  );
}
