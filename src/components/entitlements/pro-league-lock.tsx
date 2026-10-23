import Link from "next/link";
import { LockedSelection, ProTag } from "@/components/entitlements/locked-pick";
import { PRO_LEAGUE_COUNT, proLeagueLine, proLeagueReason } from "@/lib/pro-leagues";
import type { Pick } from "@/lib/model/predict";

const UPGRADE_HREF = "/account/billing?plan=pro";

/**
 * The pick slot on a Pro-league match for a free viewer before kick-off.
 * The selection never reached the page (lib/access.ts proLeagueView); this
 * says why, and that it opens for everyone at kick-off.
 */
export function ProLeaguePickLock({
  group,
  leagueCode,
  leagueName,
}: {
  group: Pick["group"] | undefined;
  leagueCode: string | undefined;
  leagueName: string;
}) {
  return (
    <section className="card rounded-2xl border-violet/30 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
        Pro pick{group ? ` · ${group}` : ""} <ProTag />
      </p>
      <div className="mt-2">
        <LockedSelection group={group ?? "Goals"} className="font-display text-2xl font-bold text-ink sm:text-3xl" />
      </div>
      <p className="mt-3 text-sm text-ink-muted">{proLeagueLine(leagueCode, leagueName)}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-dim">Opens for everyone at kick-off. Every result stays on the track record.</p>
        <Link
          href={UPGRADE_HREF}
          className="glow-brand inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
        >
          Go Pro <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

/** Every market beyond the 1X2 split, locked on a Pro-league match. */
export function ProLeagueMarketsLock({ leagueCode, leagueName }: { leagueCode: string | undefined; leagueName: string }) {
  return (
    <section className="card p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ProTag /> Over/under, both teams to score, correct score, corners, cards and shots
      </p>
      <p className="mt-2 text-sm text-ink-muted">{proLeagueLine(leagueCode, leagueName)}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-dim">Every prediction type on this match opens at kick-off.</p>
        <Link
          href={UPGRADE_HREF}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
        >
          See plans
        </Link>
      </div>
    </section>
  );
}

/** Under an opened Pro-league pick, for a free viewer once the game has started. */
export function ProLeagueAfterKickoff() {
  return (
    <p className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-muted">
      <span>Pro members had this pick before kick-off.</span>
      <Link href={UPGRADE_HREF} className="font-semibold text-brand hover:underline">
        Get them early →
      </Link>
    </p>
  );
}

/** Corners, cards, shots and the extra goal markets: Pro on every match. */
export function ProStatsLock() {
  return (
    <section className="card p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ProTag /> Corners, cards and shots, plus both teams 2+ goals, goal ranges and more
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Predicted from each team&apos;s own corner, card and shot history, with the referee where one is named.
      </p>
      <div className="mt-4 flex justify-end">
        <Link
          href={UPGRADE_HREF}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
        >
          Unlock with Pro
        </Link>
      </div>
    </section>
  );
}

/**
 * Top of a list for a free viewer. With a league, that league is Pro; without
 * one, some games on the list are. Says what is held back, until when, and
 * how to get it.
 */
export function ProLeaguesBanner({
  league,
  held,
}: {
  league?: { code: string; name: string };
  held: number;
}) {
  return (
    <section className="card flex items-center justify-between gap-3 border-violet/30 bg-violet/5 p-3.5 sm:gap-4 sm:p-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink sm:text-sm">
          <ProTag /> {league ? `${league.name} is a Pro league` : `${held} ${held === 1 ? "game" : "games"} here ${held === 1 ? "is" : "are"} in Pro leagues`}
        </p>
        {/* On a phone the line and button say enough; the why shows from sm up. */}
        <p className="mt-2 hidden text-sm text-ink-muted sm:block">
          {league
            ? `${proLeagueReason(league.code)} On Free its picks open at kick-off, apart from today's free pick.`
            : `Our ${PRO_LEAGUE_COUNT} strongest leagues and cups. On Free their picks open at kick-off; Pro gets them as soon as they're out.`}
        </p>
      </div>
      <Link
        href={UPGRADE_HREF}
        className="glow-brand inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-ink hover:bg-brand-strong sm:px-5 sm:py-2.5 sm:text-sm"
      >
        Unlock<span className="hidden sm:inline"> every league</span> <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
