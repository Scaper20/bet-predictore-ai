import "server-only";

import { predictBatch, upcomingFeed, bestBetOfDay } from "@/lib/service";
import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import { getViewer } from "@/lib/viewer";
import { viewPrediction, type ViewedPrediction, type Viewer } from "@/lib/access";
import { isStrong } from "@/lib/model/tiers";
import { riskFor, type RiskLevel } from "@/lib/model/risk";
import { pickSections } from "@/lib/pick-sections";
import { toPickRow, type PickRowData } from "@/lib/pick-list";
import type { FixtureFeed } from "@/lib/service";
import { isEngineGroup, type EngineGroup } from "@/lib/model/headline-engine";
import { engineAsPick } from "@/lib/engine-feed";

/** Days of fixtures the Picks page covers, and the most games it models at once. */
export const WINDOW_DAYS = 14;
const MAX_GAMES = 900;

export interface PickQuery {
  league?: string;
  strongOnly: boolean;
  risk?: RiskLevel;
  byChance: boolean;
  /**
   * Leagues the viewer follows, which lead each day on the unfiltered view.
   * May be a promise, so reading them runs alongside the modelling.
   */
  followed?: string[] | Promise<string[]>;
  /** Show each game's best pick in this group (headline-engine.ts) instead of its headline. */
  family?: EngineGroup;
}

export function parsePickQuery(p: { league?: string | null; tier?: string | null; risk?: string | null; sort?: string | null; family?: string | null }): PickQuery {
  return {
    family: p.family && isEngineGroup(p.family) ? p.family : undefined,
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
export async function loadPicks(q: PickQuery, opts: { withBest?: boolean; viewer?: Viewer } = {}): Promise<PickFeed> {
  const def = q.league ? leagueByCode(q.league) : undefined;
  const feed = await upcomingFeed(WINDOW_DAYS, def ? q.league : undefined).catch(() => null);
  const [raw, rawBest, viewer] = await Promise.all([
    feed ? predictBatch(feed.matches, MAX_GAMES).catch(() => []) : Promise.resolve([]),
    // Slate-wide, so only pinned on the unfiltered view.
    opts.withBest && !def ? bestBetOfDay().catch(() => null) : Promise.resolve(null),
    // The cached copy for signed-out visitors passes the free viewer, so nothing here reads cookies.
    opts.viewer ?? getViewer(),
  ]);
  const viewed = raw.map((p) => viewPrediction(p, viewer));
  const predictions = q.family ? viewed.flatMap((p) => inGroup(p, q.family!) ?? []) : viewed;

  const publishable = predictions.filter(
    (p) =>
      p.sufficiency.publishable &&
      p.topPick &&
      (!q.strongOnly || isStrong(p.topPick, p.match.league.code)) &&
      // A locked pick's chance never reaches the page, so it has no risk to filter on.
      (!q.risk || (!p.locked.pick && riskFor(p.topPick.probability) === q.risk)),
  );

  const followed = def ? [] : ((await q.followed) ?? []);
  const sections = pickSections(publishable, { followed: new Set(followed) });
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
    : viewed.reduce<Record<string, number>>((acc, p) => {
        const code = p.match.league.code;
        if (code && p.sufficiency.publishable) acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      }, {});

  return {
    def,
    feed,
    predictions,
    rows,
    withheld: viewed.filter((p) => !p.sufficiency.publishable),
    bestBet: rawBest ? viewPrediction(rawBest, viewer) : null,
    counts,
    proHeld: viewed.filter((p) => p.locked.proLeague).length,
    paid: viewer.paid,
  };
}

/**
 * The game as the family filter lists it: its best pick in the group as the
 * row's pick, locked where the viewer's plan holds that group back (one free
 * per game, access.ts). Null where the engine has no pick in the group.
 */
function inGroup(p: ViewedPrediction, group: EngineGroup): ViewedPrediction | null {
  if (!p.sufficiency.publishable) return null;
  const open = p.engine?.groups.find((g) => g.group === group);
  if (open) {
    const pick = engineAsPick(p, open);
    return { ...p, topPick: pick, sweetSpot: false, marketCheck: undefined };
  }
  if (!p.lockedGroups?.includes(group)) return null;
  const label = group === "corners" ? "Corners" : group === "shots" ? "Shots" : group === "result" ? "Match Result" : "Goals";
  const hidden = { market: "locked", label: "", group: label, probability: 0, fairOdds: 0, confidence: 0 } as const;
  return { ...p, topPick: hidden, sweetSpot: false, marketCheck: undefined, locked: { ...p.locked, pick: true } };
}
