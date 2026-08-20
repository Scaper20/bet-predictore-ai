"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LEAGUES } from "@/lib/leagues";

/** Horizontal league chips; the active one is derived from the URL. */
export function LeagueFilter() {
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
      {LEAGUES.map((l) => (
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
}: {
  href: string;
  active: boolean;
  label: string;
  flag?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand/40 bg-brand/12 text-brand"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
      }`}
    >
      {flag && <span aria-hidden>{flag}</span>}
      {label}
    </Link>
  );
}
