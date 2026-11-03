import { ButtonLink } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import type { MatchAvailability } from "@/lib/match-details";
import type { MissingPlayer, SideAvailability } from "@/lib/model/availability";
import type { Match } from "@/lib/types";

const ROLE: Record<MissingPlayer["role"], string> = {
  keeper: "GK",
  defender: "DEF",
  midfielder: "MID",
  attacker: "FWD",
  unknown: "",
};
const REASON: Record<MissingPlayer["reason"], string> = {
  "not-in-xi": "Not in the XI",
  injured: "Injured",
  suspended: "Suspended",
  out: "Out",
};

/**
 * Pro: which regulars each side is without, and how much of its attack they
 * carried over its last few games (their share of the side's xG + xA). Facts
 * from our own data; the model's numbers are not moved by this unless the
 * lineup_adjust switch is on (it is off until the backtest says it helps).
 */
export function AbsenceImpact({ match, availability }: { match: Match; availability: MatchAvailability }) {
  const sides = [
    { team: match.home, a: availability.home },
    { team: match.away, a: availability.away },
  ];
  const basis = availability.home?.basis === "xi" || availability.away?.basis === "xi" ? "xi" : "absences";
  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">What the absences cost</h2>
        <span className="rounded-full border border-gold/40 bg-gold/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">Pro</span>
      </div>
      <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {sides.map(({ team, a }) => (
          <SideImpact key={team.name} team={team} a={a} />
        ))}
      </div>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-dim sm:px-5">
        Regulars started at least half of each side&apos;s last {Math.max(availability.home?.gamesLookedAt ?? 0, availability.away?.gamesLookedAt ?? 0)} games.
        Share of attack is each player&apos;s part of the side&apos;s expected goals and assists in those games.
        {basis === "xi" ? " Judged against the named eleven." : " Judged against the injury and suspension list until the lineups are confirmed."}
      </p>
    </section>
  );
}

function SideImpact({ team, a }: { team: Match["home"]; a: SideAvailability | null }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Crest src={team.crest} name={team.name} size={18} />
          <span className="truncate">{team.name}</span>
        </span>
        {a && (
          <span className={`tnum shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${a.attackLoss >= 0.25 ? "bg-rose/15 text-rose" : a.attackLoss > 0 ? "bg-amber/15 text-amber" : "bg-brand/15 text-brand"}`}>
            {a.attackLoss > 0 ? `−${Math.round(a.attackLoss * 100)}% attack` : "Full strength"}
          </span>
        )}
      </div>
      {!a ? (
        <p className="text-xs text-ink-dim">Not enough recent games with lineups to judge.</p>
      ) : a.missing.length === 0 ? (
        <p className="text-xs text-ink-dim">All {a.regulars} regulars available.</p>
      ) : (
        <ul className="space-y-2.5">
          {a.missing.map((m, i) => (
            <li key={m.playerId}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-baseline gap-2">
                  {ROLE[m.role] && <span className="w-8 shrink-0 text-[10px] font-bold text-ink-dim">{ROLE[m.role]}</span>}
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {REASON[m.reason]} · <span className="tnum font-mono text-ink">{Math.round(m.attackShare * 100)}%</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                <span className="seg-grow block h-full rounded-full bg-rose/80" style={{ width: `${Math.min(100, m.attackShare * 100)}%`, animationDelay: `${i * 70}ms` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Free viewers: that there is a read, never its numbers (those stay on the server). */
export function AbsenceImpactLock({ missing }: { missing: number }) {
  return (
    <section className="card flex items-center justify-between gap-4 border-gold/25 bg-gold/[0.03] px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">What the absences cost</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {missing > 0 ? `${missing} player${missing === 1 ? "" : "s"} out` : "Team news"}: see each side&apos;s missing regulars and how much of its attack they carry.
        </p>
      </div>
      <ButtonLink href="/account/billing?plan=pro" variant="ghost" className="shrink-0 px-0 py-1 text-xs">
        Pro →
      </ButtonLink>
    </section>
  );
}
