"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Match } from "@/lib/types";
import { REASON_LABEL, type FeaturedRow } from "@/lib/featured";
import { Badge, ButtonLink, LiveDot, type Tone } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import { kickoffTime, odds, percent, relativeDay } from "@/lib/format";
import { sportPath } from "@/lib/routes";

/**
 * The homepage board.
 *
 * Two clocks run here, on purpose. WHICH four fixtures appear — and why each
 * one earned its slot — is decided on the server and held for the page's
 * cache window, because re-ranking every thirty seconds would swap a match
 * out from under someone halfway through clicking it. The SCORES poll, on the
 * same cadence live-board.tsx already uses.
 *
 * That split is also what finally makes the card's old "real-time feed" label
 * true rather than decorative: it used to be a static server render that only
 * changed when the page was revalidated.
 */

const REASON_TONE: Record<FeaturedRow["reason"], Tone> = {
  live: "live",
  conviction: "brand",
  tension: "cyan",
  marquee: "violet",
  imminent: "amber",
  featured: "neutral",
};

/** The only fields polling is allowed to move. */
type LivePatch = Pick<FeaturedRow, "status" | "minute"> & {
  home: number | null;
  away: number | null;
};

export function FeaturedBoard({ rows }: { rows: FeaturedRow[] }) {
  // State holds ONLY the live patch, never a copy of `rows`. Copying the rows
  // in would mean an effect to re-sync them whenever the server sent a fresh
  // selection — which is both the setState-in-effect trap and a way to show
  // yesterday's board after a revalidation. Deriving on each render instead
  // means new server rows flow straight through and the patch simply lands on
  // top of whatever is current.
  const [patches, setPatches] = useState<Map<string, LivePatch>>(() => new Map());
  const [stale, setStale] = useState(false);

  const board = rows.map((row) => {
    const patch = patches.get(row.id);
    if (!patch) return row;
    return {
      ...row,
      status: patch.status,
      minute: patch.minute,
      home: { ...row.home, score: patch.home },
      away: { ...row.away, score: patch.away },
    };
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: { matches: Match[] } = await res.json();
        if (cancelled) return;

        // Only fixtures the live feed still carries get a patch; anything it
        // has dropped keeps whatever the server rendered rather than blanking.
        const next = new Map<string, LivePatch>();
        for (const m of data.matches) {
          next.set(m.id, {
            status: m.status,
            minute: m.minute ?? null,
            home: m.score.home,
            away: m.score.away,
          });
        }
        setPatches(next);
        setStale(false);
      } catch {
        // A blip should not empty the hero — keep the last good board and say
        // so quietly.
        if (!cancelled) setStale(true);
      } finally {
        if (!cancelled) timer = setTimeout(tick, document.hidden ? 120_000 : 30_000);
      }
    };

    timer = setTimeout(tick, 30_000);
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const anyLive = board.some((r) => r.status === "live" || r.status === "halftime");

  return (
    <div className="card glow-soft overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        {anyLive ? <LiveDot /> : <span className="size-2 rounded-full bg-ink-dim" />}
        <span className="text-sm font-semibold">Featured matches</span>
        <span className="ml-auto font-mono text-[11px] text-ink-dim">
          {stale ? "reconnecting" : anyLive ? "live" : "next up"}
        </span>
      </div>

      {board.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-ink-muted">Nothing to feature right now.</p>
          <p className="mt-1 text-xs text-ink-dim">
            This board only shows real fixtures with enough completed history behind them, so it
            stays empty rather than filling itself.
          </p>
          <ButtonLink href={sportPath("fixtures")} variant="secondary" className="mt-4 px-4 py-2">
            Browse all fixtures
          </ButtonLink>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {board.map((row) => (
            <li key={row.id}>
              {/* Negative focus offset: the card is overflow-hidden, so the
                  global 2px outward focus ring is clipped on the first and
                  last rows. */}
              <Link
                href={row.href}
                className="block px-5 py-3.5 transition-colors hover:bg-surface-2/60 focus-visible:outline-offset-[-3px]"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={REASON_TONE[row.reason]} className="shrink-0">
                    {row.reason === "live" && <LiveDot />}
                    {REASON_LABEL[row.reason]}
                  </Badge>
                  <span className="min-w-0 truncate text-[11px] font-medium text-ink-dim">
                    {row.leagueName}
                  </span>
                  <span className="tnum ml-auto shrink-0 text-[11px] font-semibold text-ink-muted">
                    {row.status === "live" || row.status === "halftime" ? (
                      <span className="text-rose">
                        {row.status === "halftime" ? "HT" : row.minute ? `${row.minute}'` : "LIVE"}
                      </span>
                    ) : (
                      `${relativeDay(row.kickoff)} ${kickoffTime(row.kickoff)}`
                    )}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  <TeamLine team={row.home} />
                  <TeamLine team={row.away} />
                </div>

                {/* Three unlabelled meters read as noise to a screen reader;
                    the sentence below says the same thing once, properly. */}
                <div className="mt-2.5 flex gap-1" aria-hidden>
                  {(["home", "draw", "away"] as const).map((k) => (
                    <div key={k} className="flex-1">
                      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-brand/70"
                          style={{ width: `${Math.round(row.probabilities[k] * 100)}%` }}
                        />
                      </div>
                      <p className="tnum mt-1 text-center text-[10px] text-ink-dim">
                        {percent(row.probabilities[k])}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="sr-only">
                  {`${row.home.name} ${percent(row.probabilities.home)}, draw ${percent(
                    row.probabilities.draw,
                  )}, ${row.away.name} ${percent(row.probabilities.away)}.`}
                </p>

                {row.pick && (
                  <p className="mt-2 flex items-baseline gap-1.5 text-[11px]">
                    <span className="text-ink-dim">Model pick</span>
                    <span className="truncate font-semibold text-brand">{row.pick.label}</span>
                    <span className="tnum ml-auto shrink-0 text-ink-dim">
                      fair {odds(row.pick.fairOdds)}
                    </span>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamLine({ team }: { team: FeaturedRow["home"] }) {
  return (
    <div className="flex items-center gap-2.5">
      <Crest src={team.crest} name={team.name} size={20} />
      <span className="min-w-0 flex-1 truncate text-sm">{team.name}</span>
      {team.score !== null && <span className="tnum text-sm font-bold">{team.score}</span>}
    </div>
  );
}
