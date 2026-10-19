import { leagueByCode } from "@/lib/leagues";

/**
 * A competition's official badge, served from /public/leagues (fetched once
 * from TheSportsDB by scripts/league-badges.mts, 96px webp, about 6KB each).
 *
 * Every badge sits on a small tile so a row of them reads evenly in either
 * theme: white for most, since several are dark marks (Ligue 1, the FA Cup)
 * that vanish on the dark theme, and near-black for the badges drawn in
 * white (the UEFA cups, the Eredivisie), which would vanish on white.
 * Falls back to the flag for a competition outside the catalogue.
 */

/** Badges drawn mostly in white (measured: share of light opaque pixels). */
const ON_DARK = new Set([
  "champions-league", "europa-league", "conference-league", "eredivisie", "primeira-liga",
  "belgian-pro-league", "scottish-premiership", "international-friendlies", "world-cup", "afcon",
]);
export function LeagueLogo({
  code,
  size = 20,
  className = "",
  fallback,
}: {
  code: string | null | undefined;
  size?: number;
  className?: string;
  fallback?: string;
}) {
  const league = code ? leagueByCode(code) : undefined;
  if (!league) return fallback ? <span aria-hidden className={className}>{fallback}</span> : null;
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-[22%] ${ON_DARK.has(league.code) ? "bg-[#121816] ring-1 ring-white/10" : "bg-white"} ${className}`}
      style={{ width: size, height: size, padding: Math.max(1, Math.round(size * 0.1)) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static badge; next/image adds a loader round trip for nothing */}
      <img src={`/leagues/${league.code}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" className="size-full object-contain" />
    </span>
  );
}
