/**
 * Translating KiqStat market ids to SportyBet's, and back.
 *
 * Pure and separately tested, because this mapping is the one place a mistake
 * is both silent and expensive: quoting the wrong market means telling a user
 * that the price for "over 2.5" is good when the number came from "over 1.5".
 * A wrong price is worse than no price, since the entire value feature exists
 * to say what a price is worth.
 *
 * SportyBet uses Betradar's market catalogue, so the ids below are the
 * standard ones (1 = 1X2, 10 = double chance, 11 = draw no bet, 14 = three-way
 * handicap, 16 = Asian handicap, 18 = totals, 19/20 = team goals, 29 = both
 * teams to score, 45 = correct score, the two-part combos 35, 36, 37, 546 and
 * 547, and the corners, shots, shots-on-target and bookings markets in
 * STAT_CATALOGUE) with Betradar outcome ids underneath. Every id and outcome
 * below was read off a live SportyBet event (Chelsea v Tottenham, 24 Oct 2026).
 *
 * Everything keys on the NUMERIC id, never the display name, and that is
 * load-bearing rather than stylistic. A single fixture carries 821 markets,
 * among them "Double Chance - 1UP" (60110) beside "Double Chance" (10), and
 * "GG/NG 2+" (60000) beside "GG/NG" (29). Those are different products at
 * different prices. Matching on a name that merely starts with the right words
 * would quote a user the price of a bet they are not making — the same class
 * of error as the league-name grouping in 0013, and avoided the same way.
 */

/** One selection, addressed the way SportyBet addresses it. */
export interface SportyBetSelection {
  marketId: string;
  outcomeId: string;
  /** Only the lined markets carry one, e.g. "total=2.5" for over/under. */
  specifier?: string;
}

const ONE_X_TWO: Record<string, string> = { home: "1", draw: "2", away: "3" };

/** Betradar orders double chance 1X, 12, X2 — not the order the ids suggest. */
const DOUBLE_CHANCE: Record<string, string> = {
  "home-draw": "9",
  "home-away": "10",
  "away-draw": "11",
};

const BTTS: Record<string, string> = { yes: "74", no: "76" };

const TOTALS: Record<string, string> = { over: "12", under: "13" };

/**
 * Asian handicap: Betradar market 16, outcome 1714 for the home side and 1715
 * for the away side, the line always written from the home side
 * ("hcp=-0.5" is home -0.5, away +0.5). SportyBet lists every line from about
 * -5 to +5 a game warrants, half and whole ("hcp=-2", settles void on the line).
 */
const HANDICAP: Record<string, string> = { home: "1714", away: "1715" };

/** Draw no bet (11), ours "dnb:home|away": settles as a 0 handicap (bookable.ts pairs the two). */
const DRAW_NO_BET: Record<string, string> = { home: "4", away: "5" };

/**
 * Three-way handicap (14), "Handicap 0:2" on SportyBet: goals given to each
 * side before the match, home first. "hcp=0:2" is home -2, "hcp=1:0" home +1.
 * Ours is "eh:home|draw|away:<home line>" ("eh:draw:-2" is the home side
 * winning by exactly two).
 */
const EURO_HANDICAP: Record<string, string> = { home: "1711", draw: "1712", away: "1713" };

/** Team goals over/under: market 19 for the home side, 20 for the away side. */
const TEAM_GOALS: Record<string, string> = { home: "19", away: "20" };

/**
 * Count markets, keyed by our prefix ("corners:over:9.5", "sot:home:under:4.5",
 * "shots:most:level", "corners:hcp:away:+1.5"). Team totals use outcomes 30/31
 * on corners and bookings but the plain 12/13 on shots, as SportyBet sends
 * them. Shots and shots on target have no handicap market on SportyBet.
 * Bookings count a yellow as 1 and a red as 2 (SportyBet's rule).
 */
interface StatCatalogue {
  total: string;
  team: { home: string; away: string; over: string; under: string };
  result: string;
  handicap?: { marketId: string; home: string; away: string };
}
export const STAT_CATALOGUE: Record<"corners" | "shots" | "sot" | "bookings", StatCatalogue> = {
  corners: { total: "166", team: { home: "900300", away: "900301", over: "30", under: "31" }, result: "162", handicap: { marketId: "165", home: "1714", away: "1715" } },
  shots: { total: "900394", team: { home: "900552", away: "900553", over: "12", under: "13" }, result: "900320" },
  sot: { total: "900393", team: { home: "900546", away: "900547", over: "12", under: "13" }, result: "900318" },
  bookings: { total: "139", team: { home: "900304", away: "900305", over: "30", under: "31" }, result: "136", handicap: { marketId: "900312", home: "1", away: "3" } },
};
type StatPrefix = keyof typeof STAT_CATALOGUE;
const isStatPrefix = (x: string): x is StatPrefix => x in STAT_CATALOGUE;

/** Who had more, three ways: the stat 1X2 markets. */
const STAT_RESULT: Record<string, string> = { home: "1", level: "2", away: "3" };

/** Every market id the catalogue reads, for the board fetch (sportybet-direct.ts). */
export const CATALOGUE_MARKET_IDS: readonly string[] = [
  "1", "10", "11", "14", "16", "18", "19", "20", "29", "35", "36", "37", "546", "547",
  ...Object.values(STAT_CATALOGUE).flatMap((c) => [c.total, c.team.home, c.team.away, c.result, ...(c.handicap ? [c.handicap.marketId] : [])]),
];

const LINE = /^[+-]?\d+(\.\d+)?$/;
/** A line as SportyBet writes it: no plus sign, no "-0". */
const plain = (x: number) => String(x === 0 ? 0 : x);
/** A stat handicap line as our selections write it ("+1.5", "-0.5"). */
const signed = (x: number) => (x > 0 ? `+${x}` : plain(x));

/**
 * The SportyBet address for a KiqStat market id, or null when the market has no
 * equivalent we are confident about.
 *
 * Correct score is deliberately unmapped. SportyBet carries it (market 45) but
 * its outcome ids are per-scoreline and were not verified, and guessing one
 * would quote a price for the wrong scoreline. The model rarely selects a
 * correct-score pick anyway — returning null simply means the value verdict
 * does not render, which is the behaviour for any unpriced market.
 */
export function toSportyBet(market: string): SportyBetSelection | null {
  if (market.startsWith(COMBO)) return toSportyBetCombo(market.slice(COMBO.length).split("+"));
  const [family, ...rest] = market.split(":");

  if (family === "1x2") {
    const outcomeId = ONE_X_TWO[rest[0]];
    return outcomeId ? { marketId: "1", outcomeId } : null;
  }

  if (family === "dc") {
    const outcomeId = DOUBLE_CHANCE[rest[0]];
    return outcomeId ? { marketId: "10", outcomeId } : null;
  }

  if (family === "btts") {
    const outcomeId = BTTS[rest[0]];
    return outcomeId ? { marketId: "29", outcomeId } : null;
  }

  if (family === "ou") {
    const outcomeId = TOTALS[rest[0]];
    const line = rest[1];
    if (!outcomeId || !line) return null;
    // The line has to survive the round trip exactly: SportyBet quotes
    // "total=2.5" and "total=2" as separate markets at very different prices.
    if (!/^\d+(\.\d+)?$/.test(line)) return null;
    return { marketId: "18", outcomeId, specifier: `total=${line}` };
  }

  if (family === "ah") {
    const outcomeId = HANDICAP[rest[0]];
    const line = Number(rest[1]);
    if (!outcomeId || rest[1] === undefined || !/^[+-]?\d+(\.\d+)?$/.test(rest[1]) || !Number.isFinite(line)) return null;
    // Our id carries each side's own line; SportyBet's specifier is the home line.
    const homeLine = rest[0] === "home" ? line : -line;
    return { marketId: "16", outcomeId, specifier: `hcp=${homeLine === 0 ? 0 : homeLine}` };
  }

  if (family === "dnb") {
    const outcomeId = DRAW_NO_BET[rest[0]];
    return outcomeId && rest.length === 1 ? { marketId: "11", outcomeId } : null;
  }

  if (family === "eh") {
    const outcomeId = EURO_HANDICAP[rest[0]];
    if (!outcomeId || rest[1] === undefined || !/^[+-]?\d+$/.test(rest[1])) return null;
    const home = Number(rest[1]);
    if (home === 0) return null;
    return { marketId: "14", outcomeId, specifier: home < 0 ? `hcp=0:${-home}` : `hcp=${home}:0` };
  }

  if (family === "tg") {
    const marketId = TEAM_GOALS[rest[0]];
    const outcomeId = TOTALS[rest[1]];
    if (!marketId || !outcomeId || !rest[2] || !/^\d+(\.\d+)?$/.test(rest[2])) return null;
    return { marketId, outcomeId, specifier: `total=${rest[2]}` };
  }

  if (isStatPrefix(family)) return toStatSelection(STAT_CATALOGUE[family], rest);

  return null;
}

/** A corners / shots / shots-on-target / bookings pick as a SportyBet selection. */
function toStatSelection(c: StatCatalogue, rest: string[]): SportyBetSelection | null {
  const [a, b, d] = rest;
  if ((a === "over" || a === "under") && b && /^\d+(\.\d+)?$/.test(b)) {
    return { marketId: c.total, outcomeId: TOTALS[a], specifier: `total=${b}` };
  }
  if ((a === "home" || a === "away") && (b === "over" || b === "under") && d && /^\d+(\.\d+)?$/.test(d)) {
    return { marketId: c.team[a], outcomeId: c.team[b], specifier: `total=${d}` };
  }
  if (a === "most") {
    const outcomeId = STAT_RESULT[b];
    return outcomeId ? { marketId: c.result, outcomeId } : null;
  }
  if (a === "hcp" && c.handicap && (b === "home" || b === "away") && d && LINE.test(d)) {
    const own = Number(d);
    return { marketId: c.handicap.marketId, outcomeId: c.handicap[b], specifier: `hcp=${plain(b === "home" ? own : -own)}` };
  }
  return null;
}

/**
 * SportyBet's ready-made two-part combo markets ("special selections"), read
 * off a live event on 23 Oct 2026. These are ordinary single selections, so
 * a same-game pair needs no Bet Builder:
 *
 *   37  1X2 & Over/Under            total=1.5 / 2.5 / 3.5 / 4.5
 *   35  1X2 & GG/NG
 *   36  Over/Under & GG/NG          total=2.5 (other lines where offered)
 *   547 Double Chance & Over/Under  total=1.5 / 2.5 / 3.5 / 4.5
 *   546 Double Chance & GG/NG
 *
 * Keyed "<part>&<part>" in a fixed family order (result, double chance,
 * goals, GG/NG), so the order the parts were picked in does not matter.
 */
const COMBO_MARKETS: Record<string, { marketId: string; outcomes: Record<string, string>; lined: boolean }> = {
  "1x2&ou": {
    marketId: "37",
    lined: true,
    outcomes: {
      "home&under": "794", "home&over": "796",
      "draw&under": "798", "draw&over": "800",
      "away&under": "802", "away&over": "804",
    },
  },
  "1x2&btts": {
    marketId: "35",
    lined: false,
    outcomes: {
      "home&yes": "78", "home&no": "80",
      "draw&yes": "82", "draw&no": "84",
      "away&yes": "86", "away&no": "88",
    },
  },
  "ou&btts": {
    marketId: "36",
    lined: true,
    outcomes: { "over&yes": "90", "under&yes": "92", "over&no": "94", "under&no": "96" },
  },
  "dc&ou": {
    marketId: "547",
    lined: true,
    outcomes: {
      "home-draw&under": "1724", "home-away&under": "1725", "away-draw&under": "1726",
      "home-draw&over": "1727", "home-away&over": "1728", "away-draw&over": "1729",
    },
  },
  "dc&btts": {
    marketId: "546",
    lined: false,
    outcomes: {
      "home-draw&yes": "1718", "home-draw&no": "1719",
      "home-away&yes": "1720", "home-away&no": "1721",
      "away-draw&yes": "1722", "away-draw&no": "1723",
    },
  },
};

const FAMILY_ORDER = ["1x2", "dc", "ou", "btts"];

/** Goal lines the combo markets carry: half lines only, so nothing pushes. */
const COMBO_LINE = /^[1-4]\.5$/;

/**
 * The single SportyBet selection for a same-game combo ("1x2:home" +
 * "ou:over:2.5" is market 37, "Home & Over 2.5"), or null when SportyBet has
 * no ready-made market for the pair: three parts, a handicap part, a whole or
 * out-of-range goal line, or two parts from one family.
 */
export function toSportyBetCombo(parts: readonly string[]): SportyBetSelection | null {
  if (parts.length !== 2) return null;
  const parsed = parts.map((p) => p.split(":"));
  parsed.sort((a, b) => FAMILY_ORDER.indexOf(a[0]) - FAMILY_ORDER.indexOf(b[0]));
  const [a, b] = parsed;
  if (FAMILY_ORDER.indexOf(a[0]) < 0 || FAMILY_ORDER.indexOf(b[0]) < 0 || a[0] === b[0]) return null;

  const combo = COMBO_MARKETS[`${a[0]}&${b[0]}`];
  if (!combo) return null;
  const line = a[0] === "ou" ? a[2] : b[0] === "ou" ? b[2] : undefined;
  if (combo.lined && (!line || !COMBO_LINE.test(line))) return null;
  const outcomeId = combo.outcomes[`${a[1]}&${b[1]}`];
  if (!outcomeId) return null;
  return { marketId: combo.marketId, outcomeId, ...(combo.lined ? { specifier: `total=${line}` } : {}) };
}

/** Same-game combos are stored as "combo:<market>+<market>" (slip-tracker.ts). */
const COMBO = "combo:";

/**
 * Markets SportyBet's Bet Builder accepts, among those we map, from its own
 * catalogue (GET /factsCenter/betBuilder/markets, 23 Oct 2026). It bans whole
 * lines: "total=2" on 18 and "hcp=-1" on 16, which can push.
 */
const BUILDER_MARKETS = new Set(["1", "10", "16", "18", "29"]);
const WHOLE_LINE = /^(total|hcp)=-?\d+$/;

/** Most parts on one builder. SportyBet allows more; a combo of ours never has. */
const MAX_BUILDER_PARTS = 4;

/**
 * The parts of a same-game combo SportyBet has no ready-made market for,
 * each as a single selection for its Bet Builder; null when one part can't
 * go in a builder (an unmapped market, a whole line) or the combo has a
 * ready-made market already (use toSportyBet).
 */
export function toSportyBetBuilder(market: string): SportyBetSelection[] | null {
  if (!market.startsWith(COMBO) || toSportyBet(market)) return null;
  const parts = market.slice(COMBO.length).split("+");
  if (parts.length < 2 || parts.length > MAX_BUILDER_PARTS) return null;
  const out: SportyBetSelection[] = [];
  for (const part of parts) {
    if (part.startsWith(COMBO)) return null;
    const sel = toSportyBet(part);
    if (!sel || !BUILDER_MARKETS.has(sel.marketId)) return null;
    if (sel.specifier && WHOLE_LINE.test(sel.specifier)) return null;
    out.push(sel);
  }
  return out;
}

/**
 * Whether SportyBet is offering this exact selection on this event right
 * now: the market, the line, and an active outcome. Lines differ by game, so
 * a mapping that is right in general can still be missing on the day.
 */
export function offeredOn(
  selection: SportyBetSelection,
  markets: readonly { market_id?: string | number; specifier?: string | null; outcomes?: { id?: string | number }[] }[],
): boolean {
  const entry = markets.find((m) => matchesSelection(m, selection));
  return Boolean(entry?.outcomes?.some((o) => String(o.id) === selection.outcomeId));
}

/** SportyBet's price for a selection on an event's listed markets, if quoted. */
export function priceOn(
  selection: SportyBetSelection,
  markets: readonly { market_id?: string | number; specifier?: string | null; outcomes?: { id?: string | number; odds?: unknown }[] }[],
): number | undefined {
  const entry = markets.find((m) => matchesSelection(m, selection));
  return readOdds(entry?.outcomes?.find((o) => String(o.id) === selection.outcomeId)?.odds);
}

/** True when a market has a SportyBet equivalent worth quoting. */
export function isQuotable(market: string): boolean {
  return toSportyBet(market) !== null;
}

/**
 * Whether a market entry from SportyBet is the one a selection asked for.
 *
 * Both the id and the specifier must agree. The specifier is what separates
 * the fourteen over/under lines that all share market id 18.
 */
export function matchesSelection(
  entry: { market_id?: string | number; specifier?: string | null },
  selection: SportyBetSelection,
): boolean {
  if (String(entry.market_id) !== selection.marketId) return false;
  const wanted = selection.specifier ?? null;
  const actual = entry.specifier ?? null;
  return wanted === actual;
}

/**
 * Reads a decimal price out of SportyBet's payload, which quotes odds as
 * strings.
 *
 * Returns undefined rather than a number for anything unusable — a suspended
 * outcome, a blank, a zero. Undefined is what assessValue() already treats as
 * "no price offered", so an unavailable market degrades into the same,
 * already-handled state as a user who has not typed a price.
 */
export function readOdds(raw: unknown): number | undefined {
  if (typeof raw === "number") return raw > 1 ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 1 ? value : undefined;
}

const invert = (table: Record<string, string>) => Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k]));
const FROM_1X2 = invert(ONE_X_TWO);
const FROM_DC = invert(DOUBLE_CHANCE);
const FROM_BTTS = invert(BTTS);
const FROM_TOTALS = invert(TOTALS);
const FROM_HANDICAP = invert(HANDICAP);
const FROM_DNB = invert(DRAW_NO_BET);
const FROM_EURO = invert(EURO_HANDICAP);
const FROM_TEAM_GOALS = invert(TEAM_GOALS);
const FROM_STAT_RESULT = invert(STAT_RESULT);

/** Our id for a corners / shots / shots-on-target / bookings selection, or null. */
function fromStatSelection(marketId: string, outcomeId: string, specifier: string | undefined): string | null {
  const total = specifier?.match(/^total=(\d+(?:\.\d+)?)$/)?.[1];
  for (const [prefix, c] of Object.entries(STAT_CATALOGUE)) {
    if (marketId === c.total) return total && FROM_TOTALS[outcomeId] ? `${prefix}:${FROM_TOTALS[outcomeId]}:${total}` : null;
    if (marketId === c.team.home || marketId === c.team.away) {
      const dir = outcomeId === c.team.over ? "over" : outcomeId === c.team.under ? "under" : null;
      return total && dir ? `${prefix}:${marketId === c.team.home ? "home" : "away"}:${dir}:${total}` : null;
    }
    if (marketId === c.result) return FROM_STAT_RESULT[outcomeId] ? `${prefix}:most:${FROM_STAT_RESULT[outcomeId]}` : null;
    if (c.handicap && marketId === c.handicap.marketId) {
      const raw = specifier?.match(/^hcp=([+-]?\d+(?:\.\d+)?)$/)?.[1];
      const side = outcomeId === c.handicap.home ? "home" : outcomeId === c.handicap.away ? "away" : null;
      if (raw === undefined || !side) return null;
      const home = Number(raw);
      return `${prefix}:hcp:${side}:${signed(side === "home" ? home : -home)}`;
    }
  }
  return null;
}

/** One part of a combo outcome key ("home", "under", "yes", ...) back to our market id. */
function comboPart(family: string, value: string, line: string | undefined): string | null {
  if (family === "1x2") return `1x2:${value}`;
  if (family === "dc") return `dc:${value}`;
  if (family === "btts") return `btts:${value}`;
  if (family === "ou") return line ? `ou:${value}:${line}` : null;
  return null;
}

/**
 * Our market id for a SportyBet selection, or null for anything we do not
 * map (correct score, players, ranges, ...). The exact reverse of
 * toSportyBet, ready-made combo markets included, so a code read back from
 * SportyBet (code-scan.ts) speaks the same language as our picks.
 */
export function fromSportyBet(sel: SportyBetSelection): string | null {
  const { marketId, outcomeId, specifier } = sel;
  if (marketId === "1") return FROM_1X2[outcomeId] ? `1x2:${FROM_1X2[outcomeId]}` : null;
  if (marketId === "10") return FROM_DC[outcomeId] ? `dc:${FROM_DC[outcomeId]}` : null;
  if (marketId === "29") return FROM_BTTS[outcomeId] ? `btts:${FROM_BTTS[outcomeId]}` : null;
  if (marketId === "18") {
    const line = specifier?.match(/^total=(\d+(?:\.\d+)?)$/)?.[1];
    return line && FROM_TOTALS[outcomeId] ? `ou:${FROM_TOTALS[outcomeId]}:${line}` : null;
  }
  if (marketId === "16") {
    const raw = specifier?.match(/^hcp=(-?\d+(?:\.\d+)?)$/)?.[1];
    const side = FROM_HANDICAP[outcomeId];
    if (raw === undefined || !side) return null;
    const home = Number(raw);
    const line = side === "home" ? home : -home;
    return `ah:${side}:${line === 0 ? 0 : line}`;
  }
  if (marketId === "11") return FROM_DNB[outcomeId] ? `dnb:${FROM_DNB[outcomeId]}` : null;
  if (marketId === "14") {
    const [, a, b] = specifier?.match(/^hcp=(\d+):(\d+)$/) ?? [];
    const side = FROM_EURO[outcomeId];
    if (a === undefined || !side) return null;
    const home = Number(a) - Number(b);
    return home === 0 ? null : `eh:${side}:${home}`;
  }
  if (FROM_TEAM_GOALS[marketId]) {
    const line = specifier?.match(/^total=(\d+(?:\.\d+)?)$/)?.[1];
    return line && FROM_TOTALS[outcomeId] ? `tg:${FROM_TEAM_GOALS[marketId]}:${FROM_TOTALS[outcomeId]}:${line}` : null;
  }
  const stat = fromStatSelection(marketId, outcomeId, specifier);
  if (stat) return stat;
  for (const [families, combo] of Object.entries(COMBO_MARKETS)) {
    if (combo.marketId !== marketId) continue;
    const key = Object.entries(combo.outcomes).find(([, id]) => id === outcomeId)?.[0];
    if (!key) return null;
    const line = combo.lined ? specifier?.match(/^total=(\d+\.5)$/)?.[1] : undefined;
    if (combo.lined && !line) return null;
    const [fa, fb] = families.split("&");
    const [va, vb] = key.split("&");
    const a = comboPart(fa, va, line);
    const b = comboPart(fb, vb, line);
    return a && b ? `${COMBO}${a}+${b}` : null;
  }
  return null;
}

/** A Bet Builder's parts (each a single market of ours) as one combo id. */
export function builderCombo(parts: readonly string[]): string | null {
  if (parts.length < 2 || parts.some((p) => p.startsWith(COMBO))) return null;
  return `${COMBO}${parts.join("+")}`;
}
