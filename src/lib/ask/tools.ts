import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { Match } from "@/lib/types";
import type { Pick, Prediction } from "@/lib/model/predict";
import { getLive } from "@/lib/providers";
import { cached } from "@/lib/providers/cache";
import { matchPrediction, predictBatch, upcomingFeed } from "@/lib/service";
import { priceSelections } from "@/lib/odds";
import { kickoffDay, kickoffTime } from "@/lib/format";
import { windowFor, type KickoffWindow } from "@/lib/time-windows";
import { isLive } from "@/lib/format";
import type { AskPickCard } from "@/lib/ask/request";

/**
 * Ask BetriX's tools: the only way the assistant learns anything about a
 * fixture. Every number it quotes comes back through one of these, read off
 * the same model and price feeds the rest of the site shows.
 */

export type AskTier = "free" | "paid";

export interface ToolContext {
  tier: AskTier;
  /** Called by show_picks with the cards to render. */
  onPicks: (cards: AskPickCard[]) => void;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

/* ------------------------------------------------------------ definitions */

const WHEN = ["live", "today", "tonight", "tomorrow", "weekend", "next_7_days"] as const;
type When = (typeof WHEN)[number] & KickoffWindow;

export const ASK_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_fixtures",
    description:
      "Find fixtures by team and/or competition and time window. Returns match ids to use with the other tools. " +
      "Use this whenever the user names a team or game you don't already have an id for.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Club or national team name, or part of it, e.g. 'Arsenal'." },
        league: { type: "string", description: "Competition name, e.g. 'Premier League', 'NPFL'." },
        when: { type: "string", enum: [...WHEN], description: "Time window. Defaults to next_7_days." },
      },
    },
  },
  {
    name: "get_prediction",
    description:
      "The model's full read on one fixture: 1X2, double chance, goal lines, BTTS, likely scores, expected goals, " +
      "its ranked selections with fair odds, recent form, head-to-head and how much data backs it.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { match_id: { type: "string" } },
      required: ["match_id"],
    },
  },
  {
    name: "get_prices",
    description:
      "SportyBet's current price for selections on one fixture, next to the model's break-even price and, " +
      "where the wider market prices it, a verdict on the price. Market ids come from get_prediction.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        match_id: { type: "string" },
        markets: { type: "array", items: { type: "string" }, description: "Up to 6 market ids, e.g. 'ou:over:2.5'." },
      },
      required: ["match_id", "markets"],
    },
  },
  {
    name: "top_picks",
    description:
      "Scan the upcoming slate and return the strongest selection per fixture that meets the filters, highest " +
      "probability first. Use for 'safe picks', 'best picks today', accumulator building and similar.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        when: { type: "string", enum: ["today", "tonight", "tomorrow", "weekend", "next_7_days"] },
        count: { type: "integer", minimum: 1, maximum: 8, description: "How many picks. Defaults to 3." },
        min_fair_odds: {
          type: "number",
          description: "Skip selections whose fair odds are shorter than this, e.g. 1.25 to avoid near-certainties.",
        },
        max_fair_odds: { type: "number", description: "Skip selections longer than this." },
        markets: {
          type: "array",
          items: { type: "string", enum: ["result", "double_chance", "goals", "btts"] },
          description: "Restrict to these market types. Defaults to all four.",
        },
        league: { type: "string", description: "Only this competition." },
      },
    },
  },
  {
    name: "get_live_scores",
    description: "Matches in play right now, with score and minute. Optionally filtered by team.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { team: { type: "string" } },
    },
  },
  {
    name: "show_picks",
    description:
      "Show selections as tappable cards under your answer, each with its odds and an add-to-slip button. " +
      "Call this whenever you recommend specific selections. Each pick is a match_id plus a market id " +
      "taken from get_prediction or top_picks.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        picks: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: { match_id: { type: "string" }, market: { type: "string" } },
            required: ["match_id", "market"],
          },
        },
      },
      required: ["picks"],
    },
  },
];

/* --------------------------------------------------------------- helpers */

const str = (v: unknown, max = 80): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const pct = (p: number) => Math.round(p * 1000) / 10;
const odds2 = (o: number) => Math.round(o * 100) / 100;
const wat = (iso: string) => `${kickoffDay(iso)}, ${kickoffTime(iso)} WAT`;
const fixtureName = (m: Match) => `${m.home.name} v ${m.away.name}`;

/** Asian handicap is a paid feature everywhere else on the site; the assistant keeps to the same line. */
function visiblePicks(p: Prediction, tier: AskTier): Pick[] {
  return tier === "paid" ? p.picks : p.picks.filter((pk) => pk.group !== "Asian Handicap");
}

async function slate(): Promise<Match[]> {
  return cached("ask:slate", 5 * 60_000, async () => (await upcomingFeed(7)).matches);
}

async function liveNow(): Promise<Match[]> {
  return cached("ask:live", 20_000, () => getLive().catch(() => [] as Match[]));
}

function matchesQuery(m: Match, team?: string, league?: string): boolean {
  if (team) {
    const q = normalise(team);
    const names = normalise(`${m.home.name} ${m.away.name} ${m.home.shortName} ${m.away.shortName}`);
    if (!names.includes(q)) return false;
  }
  if (league) {
    const q = normalise(league);
    if (!normalise(`${m.league.name} ${m.league.code ?? ""} ${m.league.country ?? ""}`).includes(q)) return false;
  }
  return true;
}

function fixtureRow(m: Match) {
  return {
    match_id: m.id,
    fixture: fixtureName(m),
    league: m.league.name,
    kickoff: wat(m.kickoff),
    status: m.status,
    ...(isLive(m) || m.status === "finished"
      ? { score: `${m.score.home ?? 0}-${m.score.away ?? 0}`, minute: m.minute ?? null }
      : {}),
    modelled: Boolean(m.league.code),
  };
}

/* ------------------------------------------------------------ executors */

async function searchFixtures(input: Record<string, unknown>): Promise<ToolOutcome> {
  const team = str(input.team);
  const league = str(input.league);
  const when = (WHEN as readonly string[]).includes(input.when as string) ? (input.when as When) : "next_7_days";

  const pool = when === "live" ? await liveNow() : [...(await liveNow()), ...(await slate())];
  const [from, to] = windowFor(when);
  const seen = new Set<string>();
  const rows = pool
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      if (when !== "live" && !isLive(m)) {
        const t = Date.parse(m.kickoff);
        if (t < from || t >= to) return false;
      }
      return matchesQuery(m, team, league);
    })
    .slice(0, 12)
    .map(fixtureRow);

  return {
    content: JSON.stringify(
      rows.length ? { fixtures: rows } : { fixtures: [], note: "No fixture matched. Try a shorter team name or a wider window." },
    ),
  };
}

function predictionSummary(p: Prediction, tier: AskTier) {
  const m = p.markets;
  const form = (side: "home" | "away") => {
    const f = p.form[side];
    return {
      last: f.entries
        .slice(0, 5)
        .map((e) => `${e.result} ${e.goalsFor}-${e.goalsAgainst} v ${e.opponent}`)
        .join(", "),
      points: f.points,
      of: f.entries.length * 3,
      btts_rate: pct(f.bttsRate),
      over_2_5_rate: pct(f.overRate),
    };
  };
  return {
    match_id: p.match.id,
    fixture: fixtureName(p.match),
    league: p.match.league.name,
    kickoff: wat(p.match.kickoff),
    status: p.match.status,
    data: {
      publishable: p.sufficiency.publishable,
      level: p.sufficiency.level,
      note: p.sufficiency.reason,
      matches_used: p.model.matchesUsed,
      data_quality: Math.round(p.model.dataQuality),
      neutral_venue: p.model.neutralVenue,
    },
    expected_goals: { home: odds2(m.expectedGoals.home), away: odds2(m.expectedGoals.away) },
    result_pct: { home: pct(m.home), draw: pct(m.draw), away: pct(m.away) },
    double_chance_pct: {
      home_or_draw: pct(m.doubleChance.homeOrDraw),
      away_or_draw: pct(m.doubleChance.awayOrDraw),
      home_or_away: pct(m.doubleChance.homeOrAway),
    },
    over_pct: Object.fromEntries(Object.entries(m.over).map(([k, v]) => [k, pct(v)])),
    btts_yes_pct: pct(m.bttsYes),
    likely_scores: m.correctScore.slice(0, 3).map((s) => `${s.home}-${s.away} (${pct(s.probability)}%)`),
    top_pick: p.topPick && p.sufficiency.publishable ? { market: p.topPick.market, label: p.topPick.label } : null,
    selections: visiblePicks(p, tier)
      .slice(0, 14)
      .map((pk) => ({ market: pk.market, label: pk.label, pct: pct(pk.probability), fair_odds: odds2(pk.fairOdds) })),
    form: { [p.match.home.name]: form("home"), [p.match.away.name]: form("away") },
    head_to_head:
      p.h2h.meetings > 0
        ? {
            meetings: p.h2h.meetings,
            home_wins: p.h2h.homeWins,
            draws: p.h2h.draws,
            away_wins: p.h2h.awayWins,
            avg_goals: odds2(p.h2h.avgGoals),
          }
        : null,
    ...(tier === "free" ? { note: "Asian handicap lines are for Pro members." } : {}),
  };
}

async function getPrediction(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const id = str(input.match_id, 64);
  if (!id) return { content: "match_id is required.", isError: true };
  const p = await matchPrediction(id).catch(() => null);
  if (!p) return { content: `No fixture found for ${id}. Use search_fixtures to find the right id.`, isError: true };
  return { content: JSON.stringify(predictionSummary(p, ctx.tier)) };
}

async function getPrices(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const id = str(input.match_id, 64);
  const markets = Array.isArray(input.markets) ? input.markets.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  if (!id || markets.length === 0) return { content: "match_id and at least one market are required.", isError: true };
  const p = await matchPrediction(id).catch(() => null);
  if (!p) return { content: `No fixture found for ${id}.`, isError: true };

  const picks = visiblePicks(p, ctx.tier).filter((pk) => markets.includes(pk.market));
  const unknown = markets.filter((mk) => !picks.some((pk) => pk.market === mk));
  const priced = await priceSelections(p.match, picks).catch(() => []);
  return {
    content: JSON.stringify({
      fixture: fixtureName(p.match),
      prices: priced.map((s) => ({
        market: s.market,
        label: s.label,
        model_pct: pct(s.probability),
        break_even: odds2(s.breakEven),
        sportybet: s.local,
        market_fair_pct: s.consensus ? pct(s.consensus.fairProbability) : null,
        best_price_anywhere: s.consensus?.best.price ?? null,
        verdict: s.priceVerdict?.reason ?? s.modelVerdict?.reason ?? null,
      })),
      ...(unknown.length ? { unknown_markets: unknown } : {}),
    }),
  };
}

const GROUPS: Record<string, Pick["group"]> = {
  result: "Match Result",
  double_chance: "Double Chance",
  goals: "Goals",
  btts: "Both Teams To Score",
};

async function topPicks(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const whenRaw = input.when as string;
  const when: When = ["today", "tonight", "tomorrow", "weekend", "next_7_days"].includes(whenRaw)
    ? (whenRaw as When)
    : "today";
  const count = Math.min(8, Math.max(1, Math.round(num(input.count) ?? 3)));
  const minOdds = num(input.min_fair_odds) ?? 1.01;
  const maxOdds = num(input.max_fair_odds) ?? 100;
  const league = str(input.league);
  const wanted = Array.isArray(input.markets)
    ? input.markets.map((g) => GROUPS[g as string]).filter(Boolean)
    : Object.values(GROUPS);
  const groups = new Set(wanted.length ? wanted : Object.values(GROUPS));

  const [from, to] = windowFor(when);
  const now = Date.now();
  const fixtures = (await slate()).filter((m) => {
    const t = Date.parse(m.kickoff);
    return m.status === "scheduled" && t > now && t >= from && t < to && Boolean(m.league.code) && matchesQuery(m, undefined, league);
  });
  if (fixtures.length === 0) {
    return { content: JSON.stringify({ picks: [], note: "No modelled fixtures kick off in that window." }) };
  }

  const predictions = await predictBatch(fixtures, 40);
  const best = predictions
    .filter((p) => p.sufficiency.publishable)
    .flatMap((p) => {
      const pick = visiblePicks(p, ctx.tier)
        .filter((pk) => groups.has(pk.group) && pk.fairOdds >= minOdds && pk.fairOdds <= maxOdds)
        .sort((a, b) => b.probability - a.probability)[0];
      return pick ? [{ p, pick }] : [];
    })
    .sort((a, b) => b.pick.probability - a.pick.probability)
    .slice(0, count);

  const priced = await Promise.all(
    best.map(({ p, pick }) => priceSelections(p.match, [pick]).then((r) => r[0]?.local ?? null).catch(() => null)),
  );

  return {
    content: JSON.stringify({
      window: when,
      scanned: predictions.length,
      picks: best.map(({ p, pick }, i) => ({
        match_id: p.match.id,
        fixture: fixtureName(p.match),
        league: p.match.league.name,
        kickoff: wat(p.match.kickoff),
        market: pick.market,
        label: pick.label,
        pct: pct(pick.probability),
        fair_odds: odds2(pick.fairOdds),
        sportybet: priced[i],
        data_quality: Math.round(p.model.dataQuality),
      })),
    }),
  };
}

async function liveScores(input: Record<string, unknown>): Promise<ToolOutcome> {
  const team = str(input.team);
  const rows = (await liveNow()).filter((m) => matchesQuery(m, team)).slice(0, 15).map(fixtureRow);
  return { content: JSON.stringify({ live: rows, total_live: (await liveNow()).length }) };
}

async function showPicks(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const raw = Array.isArray(input.picks) ? input.picks.slice(0, 8) : [];
  const wanted = raw.flatMap((x) => {
    const o = x as Record<string, unknown>;
    const id = str(o?.match_id, 64);
    const market = str(o?.market, 40);
    return id && market ? [{ id, market }] : [];
  });
  if (wanted.length === 0) return { content: "Pass at least one {match_id, market}.", isError: true };

  const cards: AskPickCard[] = [];
  const missing: string[] = [];
  const thin: string[] = [];
  for (const { id, market } of wanted) {
    const p = await matchPrediction(id).catch(() => null);
    const pick = p ? visiblePicks(p, ctx.tier).find((pk) => pk.market === market) : undefined;
    if (!p || !pick) {
      missing.push(`${id} ${market}`);
      continue;
    }
    // Same rule as the rest of the site: no pick is published off too little data.
    if (!p.sufficiency.publishable) {
      thin.push(fixtureName(p.match));
      continue;
    }
    const price = await priceSelections(p.match, [pick])
      .then((r) => r[0]?.local ?? null)
      .catch(() => null);
    cards.push({
      matchId: p.match.id,
      fixture: fixtureName(p.match),
      homeName: p.match.home.name,
      awayName: p.match.away.name,
      league: p.match.league.name,
      kickoff: p.match.kickoff,
      market: pick.market,
      label: pick.label,
      probability: pick.probability,
      fairOdds: pick.fairOdds,
      price,
    });
  }

  if (cards.length) ctx.onPicks(cards);
  const combined = cards.reduce((acc, c) => acc * c.probability, 1);
  return {
    content: JSON.stringify({
      shown: cards.length,
      ...(cards.length > 1 ? { combined_pct: pct(combined), combined_fair_odds: odds2(1 / combined) } : {}),
      ...(missing.length ? { not_shown: missing, note: "Those market ids don't exist for that fixture." } : {}),
      ...(thin.length ? { not_shown_thin_data: thin, thin_note: "Too little data to publish a pick; tell the user instead." } : {}),
    }),
    isError: cards.length === 0,
  };
}

/** Short, user-facing label for the "working…" line while a tool runs. */
export function toolStatus(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "search_fixtures":
      return str(input.team) ? `Finding ${str(input.team)}…` : "Looking up fixtures…";
    case "get_prediction":
      return "Reading the model…";
    case "get_prices":
      return "Checking SportyBet prices…";
    case "top_picks":
      return "Scanning the slate…";
    case "get_live_scores":
      return "Checking live scores…";
    case "show_picks":
      return "Building your picks…";
    default:
      return "Working…";
  }
}

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!args) return { content: "Tool input must be a JSON object.", isError: true };
  try {
    switch (name) {
      case "search_fixtures":
        return await searchFixtures(args);
      case "get_prediction":
        return await getPrediction(args, ctx);
      case "get_prices":
        return await getPrices(args, ctx);
      case "top_picks":
        return await topPicks(args, ctx);
      case "get_live_scores":
        return await liveScores(args);
      case "show_picks":
        return await showPicks(args, ctx);
      default:
        return { content: `Unknown tool ${name}.`, isError: true };
    }
  } catch {
    return { content: "That lookup failed. The data feed may be busy; try once more or answer without it.", isError: true };
  }
}
