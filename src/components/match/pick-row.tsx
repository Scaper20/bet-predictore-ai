"use client";

import Link from "next/link";
import { percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { Crest } from "@/components/ui/crest";
import { matchPath } from "@/lib/routes";
import { RISK, riskFor } from "@/lib/model/risk";
import { LockedSelection, ProTag } from "@/components/entitlements/locked-pick";
import { PickAction, useLiveScore } from "@/components/match/pick-action";
import { LiveDot } from "@/components/ui/primitives";
import { liveState, type LiveState } from "@/lib/live-state";
import { isStatMarket } from "@/lib/model/sweet-spots";
import type { PickRowData } from "@/lib/pick-list";
import { shortPickLabel } from "@/lib/pick-label";

/**
 * One match on the Picks page, in a dense list instead of a card grid.
 *
 * Wide screens get a table row (time, match, pick, chance bar, risk, add):
 * about 52px a match, so a whole matchday fits on a screen and the eye runs
 * down one column of picks. Phones get the results page's scoreboard row:
 * the two clubs stacked with their chances, and our pick on a line right
 * under them, the chance and the add button to the right.
 *
 * One markup for both, laid out by the .pr-* rules in globals.css. Rendered
 * from PickRowData (lib/pick-list.ts) so the list can add rows in the
 * browser as the visitor scrolls (pick-list.tsx).
 */
export function PickRow({ row }: { row: PickRowData }) {
  const { pick, locked } = row;
  const href = matchPath(row.id);
  const homeLeads = row.home.p >= row.away.p && row.home.p >= 1 - row.home.p - row.away.p;
  const awayLeads = row.away.p > row.home.p && row.away.p >= 1 - row.home.p - row.away.p;
  const risk = locked ? null : riskFor(pick.probability);
  const pct = Math.round(pick.probability * 100);
  const code = row.league.code;

  const match = {
    id: row.id,
    kickoff: row.kickoff,
    status: row.status,
    minute: row.minute,
    score: row.score,
    home: { name: row.home.name },
    away: { name: row.away.name },
    league: { name: row.league.name },
  };
  const { state, inPlay, over, minute, halftime } = useLiveScore(match);
  const scored = (inPlay || over) && state.home !== null && state.away !== null;
  // How the pick stands on the score so far; goals and result picks only,
  // since a corners or shots pick can't be read off the score.
  const standing = scored && !locked && !isStatMarket(pick.market) ? liveState(pick.market, state.home!, state.away!) : null;

  // eslint-disable-next-line @next/next/no-img-element -- a 16px static badge, hundreds per page
  const logo = code ? <img className={`pr-lg${DARK.has(code) ? " pr-lgd" : ""}`} src={`/leagues/${code}.webp`} alt="" loading="lazy" /> : null;

  return (
    <div className={inPlay ? "pr pr-live" : "pr"}>
      <Link href={href} prefetch={false} className="pr-time">
        {inPlay ? (
          <span className="pr-min">
            <LiveDot />
            {halftime ? "HT" : minute ? `${minute}′` : "Live"}
          </span>
        ) : over ? (
          <span className="pr-ft">FT</span>
        ) : (
          <LocalTime iso={row.kickoff} />
        )}
      </Link>
      <Link href={href} prefetch={false} className="pr-teams" title={`${row.league.name}: ${row.home.name} v ${row.away.name}`}>
        <span className="pr-wide">{logo}</span>
        <Team team={row.home} lead={homeLeads} />
        <span className="pr-v">v</span>
        <Team team={row.away} lead={awayLeads} />
      </Link>
      <Link href={href} prefetch={false} className="pr-pick">
        <span className="pr-narrow">{logo}</span>
        {locked ? (
          <LockedSelection group={pick.group} className="pr-name" />
        ) : (
          <span className="pr-name" title={pick.label}>
            {shortPickLabel(pick.label)}
          </span>
        )}
        {standing && <span className={`pr-st pr-st-${standing}`}>{STANDING[standing]}</span>}
        {row.strong && !standing && <span className="pr-strong">★ Strong</span>}
        {risk && <span className={`pr-risk pr-${risk} pr-narrow`}>{RISK[risk].label.replace(" risk", "")}</span>}
      </Link>
      <span className="pr-chance">
        {locked ? (
          // On a phone the Unlock button under it already says it.
          <span className="pr-wide">
            <ProTag />
          </span>
        ) : (
          <>
            <span className="pr-bar pr-wide" aria-hidden>
              <i style={{ width: `${pct}%` }} />
            </span>
            <b>{pct}%</b>
          </>
        )}
      </span>
      <span className="pr-riskcol">{risk && <span className={`pr-risk pr-${risk}`} title={RISK[risk].record}>{RISK[risk].label}</span>}</span>
      <span className="pr-act">
        <PickAction match={match} pick={pick} locked={locked} scoreOnly />
      </span>
    </div>
  );
}

const STANDING: Record<LiveState, string> = { won: "✓ Won", lost: "✗ Lost", winning: "Winning", losing: "Losing", level: "Level" };

/** Badges drawn in white sit on a dark tile, as in league-logo.tsx. */
const DARK = new Set([
  "champions-league", "europa-league", "conference-league", "eredivisie", "primeira-liga",
  "belgian-pro-league", "scottish-premiership", "international-friendlies", "world-cup", "afcon",
]);

function Team({ team, lead }: { team: PickRowData["home"]; lead: boolean }) {
  return (
    <span className={lead ? "pr-team pr-up" : "pr-team"}>
      <Crest src={team.crest} name={team.name} size={18} />
      <span className={lead ? "pr-lead" : undefined}>{team.name}</span>
      <em>{percent(team.p)}</em>
    </span>
  );
}
