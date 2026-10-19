import "server-only";

import { predictBatch, upcomingFeed, bestBetOfDay } from "@/lib/service";
import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import { getViewer } from "@/lib/viewer";
import { viewPrediction, type ViewedPrediction } from "@/lib/access";
import { isStrong } from "@/lib/model/tiers";
import { riskFor, type RiskLevel } from "@/lib/model/risk";
import { pickSections } from "@/lib/pick-sections";
import { toPickRow, type PickRowData } from "@/lib/pick-list";
import type { FixtureFeed } from "@/lib/service";

/** Days of fixtures the Picks page covers, and the most games it models at once. */
export const WINDOW_DAYS = 14;
const MAX_GAMES = 900;

export interface PickQuery {
  league?: string;
  strongOnly: boolean;
  risk?: RiskLevel;
  byChance: boolean;
  /** Leagues the viewer follows, which lead each day on the unfiltered view. */
  followed?: string[];
}

export function parsePickQuery(p: { league?: string | null; tier?: string | null; risk?: string | null; sort?: string | null }): PickQuery {
  return {
    league: p.league && leagueByCode(p.league) ? p.league : undefined,
    strongOnly: p.tier === "strong",
    risk: (["low", "medium", "high"] as RiskLevel[]).find((r) => r === p.risk),
    byChance: p.sort === "chance",
  };
}

export interface PickFeed {
  def?: LeagueDef;
  feed: FixtureFeed | null;
  predictions: ViewedPrediction[];
  rows: PickRowData[];
  withheld: ViewedPrediction[];
  bestBet: ViewedPrediction | null;
  counts?: Record<string, number>;
  proHeld: number;
  paid: boolean;
}

/**
 * Every pick for the next two weeks, filtered, ordered and sectioned exactly
 * as the Picks page shows them. The page renders the first batch and the
 * list asks /api/picks for the rest as the visitor scrolls; both read this,
 * and the predictions behind it are cached for five minutes (predictBatch),
 * so a later batch costs no new modelling.
 */
export async function loadPicks(q: PickQuery, opts: { withBest?: boolean } = {}): Promise<PickFeed> {
  const def = q.league ? leagueByCode(q.league) : undefined;
  const feed = await upcomingFeed(WINDOW_DAYS, def ? q.league : undefined).catch(() => null);
  const [raw, rawBest, viewer] = await Promise.all([
    feed ? predictBatch(feed.matches, MAX_GAMES).catch(() => []) : Promise.resolve([]),
    // Slate-wide, so only pinned on the unfiltered view.
    opts.withBest && !def ? bestBetOfDay().catch(() => null) : Promise.resolve(null),
    getViewer(),
  ]);
  const predictions = raw.map((p) => viewPrediction(p, viewer));

  const publishable = predictions.filter(
    (p) =>
      p.sufficiency.publishable &&
      p.topPick &&
      (!q.strongOnly || isStrong(p.topPick, p.match.league.code)) &&
      // A locked pick's chance never reaches the page, so it has no risk to filter on.
      (!q.risk || (!p.locked.pick && riskFor(p.topPick.probability) === q.risk)),
  );

  const sections = pickSections(publishable, { followed: new Set(def ? [] : q.followed ?? []) });
  const rows: PickRowData[] = [];
  for (const s of sections) {
    const items = q.byChance
      ? [...s.items].sort((a, b) => (b.locked.pick ? 0 : b.topPick!.probability) - (a.locked.pick ? 0 : a.topPick!.probability))
      : s.items;
    for (const p of items) {
      const row = toPickRow(p, { key: s.key, title: s.title, live: s.live, count: items.length });
      if (row) rows.push(row);
    }
  }

  // Games per competition, for the league filter: only on the unfiltered
  // view, where the feed holds every competition.
  const counts = def
    ? undefined
    : predictions.reduce<Record<string, number>>((acc, p) => {
        const code = p.match.league.code;
        if (code && p.sufficiency.publishable) acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      }, {});

  return {
    def,
    feed,
    predictions,
    rows,
    withheld: predictions.filter((p) => !p.sufficiency.publishable),
    bestBet: rawBest ? viewPrediction(rawBest, viewer) : null,
    counts,
    proHeld: predictions.filter((p) => p.locked.proLeague).length,
    paid: viewer.paid,
  };
}
