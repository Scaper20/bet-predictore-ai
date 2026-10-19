import Link from "next/link";
import type { Prediction } from "@/lib/model/predict";
import type { ViewedPrediction } from "@/lib/access";
import { percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { Crest } from "@/components/ui/crest";
import { leagueByCode } from "@/lib/leagues";
import { matchPath } from "@/lib/routes";
import { isStrong } from "@/lib/model/tiers";
import { RISK, riskFor } from "@/lib/model/risk";
import { LockedSelection, ProTag } from "@/components/entitlements/locked-pick";
import { PickAction } from "@/components/match/pick-action";

/**
 * One match on the Picks page, in a dense list instead of a card grid.
 *
 * Wide screens get a table row (time, match, pick, chance bar, risk, add):
 * about 52px a match, so a whole matchday fits on a screen and the eye runs
 * down one column of picks. Phones get the results page's scoreboard row:
 * the two clubs stacked with their chances, and our pick on a line right
 * under them, the chance and the add button to the right.
 *
 * One markup for both, laid out by the .pr-* rules in globals.css. The page
 * lists every game for two weeks, several hundred rows, and the markup is
 * sent twice (as HTML and in the page data), so the classes are short and
 * nothing is rendered twice that CSS can place instead.
 */
export function PickRow({ prediction }: { prediction: Prediction | ViewedPrediction }) {
  const { match, markets, topPick } = prediction;
  if (!topPick) return null;
  const locked = "locked" in prediction ? prediction.locked : { pick: false, markets: false, proLeague: false };
  const href = matchPath(match.id);
  const homeLeads = markets.home >= markets.away && markets.home >= markets.draw;
  const awayLeads = markets.away > markets.home && markets.away >= markets.draw;
  const league = match.league.code ? leagueByCode(match.league.code) : undefined;
  const risk = locked.pick ? null : riskFor(topPick.probability);
  const pct = Math.round(topPick.probability * 100);

  // Only what the slip and the live score need, not the whole match.
  const slim = {
    id: match.id,
    kickoff: match.kickoff,
    status: match.status,
    minute: match.minute,
    score: match.score,
    home: { name: match.home.name },
    away: { name: match.away.name },
    league: { name: match.league.name },
  };
  // eslint-disable-next-line @next/next/no-img-element -- a 16px static badge, hundreds per page
  const logo = league ? <img className={`pr-lg${DARK.has(league.code) ? " pr-lgd" : ""}`} src={`/leagues/${league.code}.webp`} alt="" loading="lazy" /> : null;

  return (
    <div className="pr">
      <Link href={href} prefetch={false} className="pr-time">
        <LocalTime iso={match.kickoff} />
      </Link>
      <Link href={href} prefetch={false} className="pr-teams" title={`${match.league.name}: ${match.home.name} v ${match.away.name}`}>
        <span className="pr-wide">{logo}</span>
        <Team team={match.home} p={markets.home} lead={homeLeads} />
        <span className="pr-v">v</span>
        <Team team={match.away} p={markets.away} lead={awayLeads} />
      </Link>
      <Link href={href} prefetch={false} className="pr-pick">
        <span className="pr-narrow">{logo}</span>
        {locked.pick ? <LockedSelection group={topPick.group} className="pr-name" /> : <span className="pr-name">{topPick.label}</span>}
        {isStrong(topPick, match.league.code) && <span className="pr-strong">★ Strong</span>}
        {risk && <span className={`pr-risk pr-${risk} pr-narrow`}>{RISK[risk].label.replace(" risk", "")}</span>}
      </Link>
      <span className="pr-chance">
        {locked.pick ? (
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
        <PickAction match={slim} pick={topPick} locked={locked.pick} />
      </span>
    </div>
  );
}

/** Badges drawn in white sit on a dark tile, as in league-logo.tsx. */
const DARK = new Set([
  "champions-league", "europa-league", "conference-league", "eredivisie", "primeira-liga",
  "belgian-pro-league", "scottish-premiership", "international-friendlies", "world-cup", "afcon",
]);

function Team({ team, p, lead }: { team: Prediction["match"]["home"]; p: number; lead: boolean }) {
  return (
    <span className="pr-team">
      <Crest src={team.crest} name={team.name} size={18} />
      <span className={lead ? "pr-lead" : undefined}>{team.name}</span>
      <em>{percent(p)}</em>
    </span>
  );
}
