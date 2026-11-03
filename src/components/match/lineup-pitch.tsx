import type { DetailPlayer, LineupSide, LineupStatus, MatchDetails } from "@/lib/match-details-core";
import { ratingBand } from "@/lib/match-details-core";
import type { Match } from "@/lib/types";
import { Crest } from "@/components/ui/crest";

/**
 * Both starting elevens on one pitch, home attacking up from the bottom and
 * away down from the top, placed by their formation; then each bench, and who
 * is out. Server-rendered: no script needed to read a lineup.
 */
export function LineupsPanel({ match, details }: { match: Match; details: MatchDetails | null }) {
  const home = details?.home ?? null;
  const away = details?.away ?? null;
  const hasXi = Boolean(home?.starters.length && away?.starters.length);

  if (!details || (!hasXi && !home?.unavailable.length && !away?.unavailable.length)) {
    return (
      <section className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <PitchGlyph />
        <h2 className="font-display text-base font-bold">Lineups aren&apos;t out yet</h2>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
          Clubs name their starting elevens about an hour before kickoff. They appear here as soon as they&apos;re announced.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {hasXi && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Lineups</h2>
            <StatusChip status={details.lineupStatus} />
          </div>
          {/* Phones: away above the pitch, home below. Desktop: one row, home left, away right. */}
          <div className="lg:hidden">
            <SideHeader team={match.away} side={away!} />
          </div>
          <div className="hidden grid-cols-2 border-b border-line lg:grid">
            <SideHeader team={match.home} side={home!} flat />
            <SideHeader team={match.away} side={away!} flat right />
          </div>
          <Pitch home={home!} away={away!} />
          <div className="lg:hidden">
            <SideHeader team={match.home} side={home!} bottom />
          </div>
          {(details.lineupStatus === "previous" || details.lineupStatus === "predicted") && (
            <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-dim sm:px-5">
              {details.lineupStatus === "predicted" ? "The expected elevens, before the clubs name them." : "Each side's eleven from its last game."}{" "}
              The confirmed lineups replace these about an hour before kickoff.
            </p>
          )}
        </section>
      )}

      {hasXi && (home!.subs.length > 0 || away!.subs.length > 0) && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted sm:px-5">
            Substitutes
          </h2>
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <PlayerList team={match.home} players={home!.subs} finished={details.finished} />
            <PlayerList team={match.away} players={away!.subs} finished={details.finished} />
          </div>
        </section>
      )}

      {(home?.unavailable.length || away?.unavailable.length) ? (
        <section className="card overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Out of this game</h2>
            <span className="text-[11px] text-ink-dim">Injured or suspended</span>
          </div>
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <AbsenceList team={match.home} players={home?.unavailable ?? []} />
            <AbsenceList team={match.away} players={away?.unavailable ?? []} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatusChip({ status }: { status: LineupStatus }) {
  const map: Record<LineupStatus, [string, string]> = {
    final: ["Starting elevens", "text-ink-muted border-line"],
    confirmed: ["Confirmed", "text-brand border-brand/40 bg-brand/[0.06]"],
    predicted: ["Predicted · not confirmed", "text-amber border-amber/40 bg-amber/[0.06]"],
    previous: ["Last game's XI · not confirmed", "text-amber border-amber/40 bg-amber/[0.06]"],
    none: ["", ""],
  };
  const [label, tone] = map[status];
  if (!label) return null;
  return <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${tone}`}>{label}</span>;
}

function SideHeader({ team, side, bottom, flat, right }: { team: Match["home"]; side: LineupSide; bottom?: boolean; flat?: boolean; right?: boolean }) {
  const border = flat ? "" : bottom ? "border-t border-line" : "border-b border-line";
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 ${border} ${right ? "flex-row-reverse" : ""}`}>
      <span className={`flex min-w-0 items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
        <Crest src={team.crest} name={team.name} size={20} />
        <span className="min-w-0 truncate text-sm font-semibold">{team.name}</span>
        {side.formation && <span className="tnum shrink-0 font-mono text-xs text-ink-muted">{side.formation}</span>}
      </span>
      <span className={`flex shrink-0 items-center gap-3 text-xs text-ink-muted ${right ? "flex-row-reverse" : ""}`}>
        {side.coach && <span className="hidden truncate sm:inline">Coach: {side.coach}</span>}
        {side.rating !== null && <RatingChip rating={side.rating} />}
      </span>
    </div>
  );
}

/**
 * The pitch: portrait on phones (away from the top, home from the bottom),
 * landscape from lg (home attacking right, away attacking left), so neither
 * screen wastes its width. One layout is display:none at a time, so screen
 * readers meet each eleven once.
 */
function Pitch({ home, away }: { home: LineupSide; away: LineupSide }) {
  const all = [...home.starters.map((p) => [p, false] as const), ...away.starters.map((p) => [p, true] as const)];
  // FotMob: x across (0-1), y from the side's own goal (0-1, keeper ~0.1).
  const portrait = (p: DetailPlayer, isAway: boolean) => {
    const x = p.x ?? 0.5;
    const along = 3 + (p.y ?? 0.5) * 45;
    return { left: `${7 + (isAway ? 1 - x : x) * 86}%`, top: `${isAway ? along : 100 - along}%` };
  };
  const landscape = (p: DetailPlayer, isAway: boolean) => {
    const x = p.x ?? 0.5;
    const along = 3 + (p.y ?? 0.5) * 45;
    return { left: `${isAway ? 100 - along : along}%`, top: `${7 + (isAway ? x : 1 - x) * 86}%` };
  };
  return (
    <>
      <div className="relative mx-auto aspect-[68/132] w-full max-w-[30rem] overflow-hidden sm:aspect-[68/112] lg:hidden" role="list" aria-label="Starting elevens on the pitch">
        <PitchMarkings />
        <div className="stagger absolute inset-0">
          {all.map(([p, isAway], i) => (
            <PitchPlayer key={p.id} player={p} style={{ ...portrait(p, isAway), ["--i" as string]: i }} />
          ))}
        </div>
      </div>
      <div className="relative hidden aspect-[105/62] w-full overflow-hidden lg:block" role="list" aria-label="Starting elevens on the pitch">
        <PitchMarkings landscape />
        <div className="stagger absolute inset-0">
          {all.map(([p, isAway], i) => (
            <PitchPlayer key={p.id} player={p} style={{ ...landscape(p, isAway), ["--i" as string]: i }} />
          ))}
        </div>
      </div>
    </>
  );
}

function PitchMarkings({ landscape }: { landscape?: boolean }) {
  const id = landscape ? "pitch-stripes-l" : "pitch-stripes-p";
  if (landscape) {
    return (
      <svg aria-hidden viewBox="0 0 105 62" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <defs>
          <pattern id={id} width="21" height="62" patternUnits="userSpaceOnUse">
            <rect width="10.5" height="62" className="fill-surface-2" />
            <rect x="10.5" width="10.5" height="62" className="fill-surface" />
          </pattern>
        </defs>
        <rect width="105" height="62" fill={`url(#${id})`} />
        <g className="stroke-line-strong" fill="none" strokeWidth="0.25">
          <rect x="1.5" y="1.5" width="102" height="59" />
          <line x1="52.5" y1="1.5" x2="52.5" y2="60.5" />
          <circle cx="52.5" cy="31" r="8" />
          <rect x="1.5" y="14" width="15" height="34" />
          <rect x="1.5" y="23" width="5" height="16" />
          <rect x="88.5" y="14" width="15" height="34" />
          <rect x="98.5" y="23" width="5" height="16" />
        </g>
        <circle cx="52.5" cy="31" r="0.6" className="fill-line-strong" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 68 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
      <defs>
        <pattern id={id} width="68" height="20" patternUnits="userSpaceOnUse">
          <rect width="68" height="10" className="fill-surface-2" />
          <rect y="10" width="68" height="10" className="fill-surface" />
        </pattern>
      </defs>
      <rect width="68" height="100" fill={`url(#${id})`} />
      <g className="stroke-line-strong" fill="none" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
        <rect x="2" y="2" width="64" height="96" />
        <line x1="2" y1="50" x2="66" y2="50" />
        <circle cx="34" cy="50" r="8.5" />
        <rect x="14" y="2" width="40" height="15.5" />
        <rect x="24.5" y="2" width="19" height="5.5" />
        <rect x="14" y="82.5" width="40" height="15.5" />
        <rect x="24.5" y="92.5" width="19" height="5.5" />
      </g>
      <circle cx="34" cy="50" r="0.7" className="fill-line-strong" />
    </svg>
  );
}

function PitchPlayer({ player: p, style }: { player: DetailPlayer; style: React.CSSProperties }) {
  const band = ratingBand(p.rating);
  const summary = [
    p.name,
    p.shirt ? `#${p.shirt}` : null,
    p.rating !== null ? `rating ${p.rating.toFixed(1)}` : null,
    p.goals ? `${p.goals} goal${p.goals > 1 ? "s" : ""}` : null,
    p.assists ? `${p.assists} assist${p.assists > 1 ? "s" : ""}` : null,
    p.yellow ? "booked" : null,
    p.red ? "sent off" : null,
    p.subOut !== null ? `off ${p.subOut}'` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div role="listitem" aria-label={summary} title={summary} className="absolute flex w-[4.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center sm:w-20" style={style}>
      <div className="relative">
        <span
          className={`grid size-8 place-items-center rounded-full border text-xs font-bold tnum shadow-[0_2px_10px_rgb(0_0_0/0.35)] sm:size-9 sm:text-[13px] ${
            band === "elite" ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-shell text-ink"
          }`}
        >
          {p.shirt ?? "·"}
        </span>
        {p.rating !== null && (
          <span className="absolute -right-3 -top-2">
            <RatingChip rating={p.rating} small />
          </span>
        )}
        <span className="absolute -left-2.5 -top-1.5 flex gap-0.5">
          {Array.from({ length: Math.min(p.goals, 3) }).map((_, i) => (
            <BallIcon key={i} />
          ))}
          {p.red ? <CardIcon red /> : p.yellow ? <CardIcon /> : null}
        </span>
        {p.subOut !== null && (
          <span className="absolute -bottom-1 -right-2.5 grid size-4 place-items-center rounded-full bg-rose text-[9px] font-bold text-white" aria-hidden>
            ↓
          </span>
        )}
      </div>
      <span className="mt-1.5 max-w-full truncate rounded px-1 text-center text-[10.5px] font-medium leading-tight text-ink sm:text-[11.5px]">
        {p.captain && <span className="mr-0.5 text-brand">©</span>}
        {p.short}
      </span>
    </div>
  );
}

export function RatingChip({ rating, small }: { rating: number; small?: boolean }) {
  const band = ratingBand(rating);
  const tone =
    band === "elite" ? "bg-brand text-brand-ink" :
    band === "good" ? "bg-cyan text-canvas" :
    band === "ok" ? "bg-amber text-canvas" :
    "bg-rose text-white";
  return (
    <span className={`tnum inline-block rounded-md font-mono font-semibold leading-none ${small ? "px-1 py-[3px] text-[9.5px]" : "px-1.5 py-1 text-[11px]"} ${tone}`}>
      {rating.toFixed(1)}
    </span>
  );
}

function PlayerList({ team, players, finished }: { team: Match["home"]; players: DetailPlayer[]; finished: boolean }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <Crest src={team.crest} name={team.name} size={16} /> {team.name}
      </p>
      <ul className="stagger divide-y divide-line/60">
        {players.map((p, i) => (
          <li key={p.id} className="flex min-h-11 items-center gap-3 py-1.5" style={{ ["--i" as string]: i }}>
            <span className="tnum w-6 shrink-0 text-right font-mono text-xs text-ink-dim">{p.shirt ?? ""}</span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {p.name}
              {p.goals > 0 && <span className="ml-1.5 inline-flex align-middle"><BallIcon /></span>}
              {p.red ? <span className="ml-1 inline-flex align-middle"><CardIcon red /></span> : p.yellow ? <span className="ml-1 inline-flex align-middle"><CardIcon /></span> : null}
            </span>
            {p.subIn !== null ? (
              <span className="tnum shrink-0 font-mono text-xs text-brand">↑ {p.subIn}&apos;</span>
            ) : finished ? (
              <span className="shrink-0 text-[11px] text-ink-dim">Unused</span>
            ) : null}
            {p.rating !== null && <RatingChip rating={p.rating} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AbsenceList({ team, players }: { team: Match["home"]; players: DetailPlayer[] }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <Crest src={team.crest} name={team.name} size={16} /> {team.name}
      </p>
      {players.length === 0 ? (
        <p className="py-2 text-sm text-ink-dim">No one reported out.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {players.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${p.absence === "suspension" ? "bg-amber/20 text-amber" : "bg-rose/15 text-rose"}`}
                  aria-hidden
                >
                  {p.absence === "suspension" ? "S" : "+"}
                </span>
                <span className="min-w-0 truncate text-sm">{p.name}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-ink-dim">
                {p.absence === "suspension" ? "Suspended" : "Injured"}
                {p.expectedReturn && <span className="block text-ink-muted">{p.expectedReturn}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BallIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-3.5 drop-shadow" aria-hidden>
      <circle cx="6" cy="6" r="5.5" className="fill-ink" />
      <path d="M6 3.4 8.2 5 7.4 7.6H4.6L3.8 5Z" className="fill-canvas" />
    </svg>
  );
}

export function CardIcon({ red }: { red?: boolean }) {
  return <span aria-hidden className={`inline-block h-3.5 w-2.5 rounded-[2px] shadow ${red ? "bg-rose" : "bg-amber"}`} />;
}

function PitchGlyph() {
  return (
    <svg viewBox="0 0 48 32" className="h-10 w-16 text-ink-dim" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="46" height="30" rx="2" />
      <line x1="24" y1="1" x2="24" y2="31" />
      <circle cx="24" cy="16" r="5" />
      <rect x="1" y="9" width="6" height="14" />
      <rect x="41" y="9" width="6" height="14" />
    </svg>
  );
}
