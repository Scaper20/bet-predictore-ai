import { normaliseKey } from "@/lib/model/fit";
import { clubNameTokens, KICKOFF_TOLERANCE_MS, namesCouldMatch, type FixtureLike } from "./match-fixture";
import { seedKeys } from "./sportybet-aliases";
import type { SportyBetEvent } from "./sportybet-api";

/**
 * Matching our fixtures to SportyBet's, by structure and memory rather than by
 * spelling alone.
 *
 * Name matching (match-fixture.ts) refuses whenever spellings drift far enough
 * apart -- "Bayern Munich" and "Bayern München", "PSG", "Nott'm Forest" -- and
 * refusing is right when the only evidence is the name. But SportyBet's API
 * gives every team a Sportradar competitor id, and a league round has
 * structure: a club plays once per round. So:
 *
 * 1. ID. Both clubs already have a learned competitor id: match on ids, and
 *    never look at a name again.
 * 2. Name. The findFixture rules, plus our alias names and a seed list
 *    (sportybet-aliases.ts). Loose matches only when exactly one fits.
 * 3. Anchor. One side is certain (by id, or by an exact or alias name), and
 *    exactly one SportyBet event has that club on that side within half an
 *    hour of our kickoff. That event is the fixture, whatever SportyBet calls
 *    the other club, and the other club's id is learned from it -- as pending
 *    when its name gave no support at all.
 * 4. Elimination (whole rounds only). What is left at one kickoff slot is one
 *    of ours and one of theirs, and the names are not unrelated. Learned ids
 *    from this pass are pending until seen again or approved.
 *
 * What stops this matching the wrong game is the same bias as before: a link
 * that contradicts a learned id is refused, as is any event an anchored club
 * appears in more than once, and as is an event whose other club is plainly a
 * different club in our own round.
 *
 * Pure: the caller loads links and aliases and stores what comes back.
 */

/** Anchor and elimination need a tighter kickoff agreement than names do. */
export const SLOT_TOLERANCE_MS = 30 * 60_000;

/**
 * The id pass's window: both clubs known by id, so a moved fixture is still
 * the same fixture. The same pair cannot meet twice in a competition within
 * three days, and feeds lag a reschedule by about that long.
 */
export const ID_TOLERANCE_MS = 72 * 3_600_000;

/** Below this, two names are unrelated, and elimination will not pair them. */
export const ELIMINATION_MIN_SIMILARITY = 0.35;

export interface OurFixture extends FixtureLike {
  matchId: string;
}

export type MatchMethod = "id" | "name" | "anchor" | "elimination";

export interface MatchedFixture {
  matchId: string;
  eventId: string;
  method: MatchMethod;
  event: SportyBetEvent;
}

export interface LearnedLink {
  /** normaliseKey of our club name. */
  teamKey: string;
  teamName: string;
  competitorId: string;
  sportybetName: string;
  method: Exclude<MatchMethod, "id">;
  /**
   * Pending when nothing about the name supported it (elimination, or the
   * unnamed side of an anchor): not used for the id pass until confirmed.
   */
  status: "trusted" | "pending";
}

export interface Candidate {
  eventId: string;
  homeName: string;
  awayName: string;
  homeId?: string;
  awayId?: string;
  kickoff: number;
  score: number;
}

export interface UnresolvedFixture {
  matchId: string;
  candidates: Candidate[];
}

export interface MatchInput {
  fixtures: readonly OurFixture[];
  events: readonly SportyBetEvent[];
  /** Trusted links: our team key -> competitor id. */
  links?: ReadonlyMap<string, string>;
  /** Extra names for our clubs (team_aliases), keyed by team key. */
  aliases?: ReadonlyMap<string, readonly string[]>;
  /** Pairs an admin rejected, as "teamKey|competitorId": never matched again. */
  rejected?: ReadonlySet<string>;
  /**
   * Pair leftovers by slot. Only sound when `fixtures` is the whole round for
   * the competition; with one fixture it would pair it with anything.
   */
  eliminate?: boolean;
}

export interface MatchOutput {
  matched: MatchedFixture[];
  learned: LearnedLink[];
  unresolved: UnresolvedFixture[];
}

type SideMatch = "id" | "strict" | "loose" | "none" | "conflict";

interface Ctx {
  links: Map<string, string>;
  /** competitor id -> our team key, the reverse of `links`. */
  owners: Map<string, string>;
  aliases: ReadonlyMap<string, readonly string[]>;
  rejected: ReadonlySet<string>;
}

/** Every key our club could appear under: its own, the seed list's, our aliases'. */
function keysFor(name: string, ctx: Ctx): Set<string> {
  const key = normaliseKey(name);
  const keys = new Set<string>(seedKeys(name));
  if (key) keys.add(key);
  for (const alias of ctx.aliases.get(key) ?? []) {
    for (const k of seedKeys(alias)) keys.add(k);
  }
  return keys;
}

function side(ourName: string, theirName: string, theirId: string | undefined, ctx: Ctx): SideMatch {
  const ourKey = normaliseKey(ourName);
  const linked = ctx.links.get(ourKey);
  if (theirId) {
    if (ctx.rejected.has(`${ourKey}|${theirId}`)) return "conflict";
    if (linked === theirId) return "id";
    // Our club is known to be someone else, or their club is known to be one
    // of ours that is not this one. Either way, not this side.
    if (linked && linked !== theirId) return "conflict";
    const owner = ctx.owners.get(theirId);
    if (owner && owner !== ourKey) return "conflict";
  }
  const theirKeys = new Set(seedKeys(theirName));
  for (const k of keysFor(ourName, ctx)) if (theirKeys.has(k)) return "strict";
  if (namesCouldMatch(theirName, ourName)) return "loose";
  for (const alias of ctx.aliases.get(ourKey) ?? []) {
    if (namesCouldMatch(theirName, alias)) return "loose";
  }
  return "none";
}

const certain = (s: SideMatch) => s === "id" || s === "strict";
const possible = (s: SideMatch) => s !== "none" && s !== "conflict";

/** Trigram Dice similarity of two club names' identifying words, 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const grams = (raw: string) => {
    const s = ` ${clubNameTokens(raw).join(" ")} `;
    const out = new Map<string, number>();
    for (let i = 0; i + 3 <= s.length; i++) {
      const g = s.slice(i, i + 3);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let total = 0;
  let shared = 0;
  for (const n of ga.values()) total += n;
  for (const [g, n] of gb) {
    total += n;
    shared += Math.min(n, ga.get(g) ?? 0);
  }
  return total === 0 ? 0 : (2 * shared) / total;
}

function closest<T extends FixtureLike>(target: FixtureLike, list: T[]): T {
  return list.reduce((best, c) =>
    Math.abs(c.kickoff - target.kickoff) < Math.abs(best.kickoff - target.kickoff) ? c : best,
  );
}

export function matchRound(input: MatchInput): MatchOutput {
  const ctx: Ctx = {
    links: new Map(input.links ?? []),
    owners: new Map([...(input.links ?? new Map<string, string>())].map(([k, v]) => [v, k])),
    aliases: input.aliases ?? new Map(),
    rejected: input.rejected ?? new Set(),
  };
  const matched: MatchedFixture[] = [];
  const learned: LearnedLink[] = [];
  const usedEvents = new Set<string>();
  const done = new Set<string>();
  const ourKeys = new Set(input.fixtures.flatMap((f) => [normaliseKey(f.homeName), normaliseKey(f.awayName)]));

  const window = (f: OurFixture, tolerance: number) =>
    input.events.filter((e) => Math.abs(e.kickoff - f.kickoff) <= tolerance);

  const learn = (
    ourName: string,
    theirName: string,
    theirId: string | undefined,
    method: LearnedLink["method"],
    status: LearnedLink["status"],
  ) => {
    if (!theirId) return;
    const teamKey = normaliseKey(ourName);
    if (!teamKey || ctx.links.has(teamKey) || ctx.owners.has(theirId)) return;
    learned.push({ teamKey, teamName: ourName, competitorId: theirId, sportybetName: theirName, method, status });
    // Pending links still block a contradicting match in this round; they
    // only stay out of the stored id pass until confirmed.
    ctx.links.set(teamKey, theirId);
    ctx.owners.set(theirId, teamKey);
  };

  /**
   * `unsure` names a side matched on no name evidence at all: an anchor's
   * other club, or either club by elimination. Its id is learned as pending,
   * so one bad round cannot teach a wrong id for good.
   */
  const accept = (f: OurFixture, e: SportyBetEvent, method: MatchMethod, unsure: { home: boolean; away: boolean }) => {
    matched.push({ matchId: f.matchId, eventId: e.eventId, method, event: e });
    usedEvents.add(e.eventId);
    done.add(f.matchId);
    if (method !== "id") {
      learn(f.homeName, e.homeName, e.homeId, method, unsure.home ? "pending" : "trusted");
      learn(f.awayName, e.awayName, e.awayId, method, unsure.away ? "pending" : "trusted");
    }
  };
  const SURE = { home: false, away: false };

  const sides = (f: OurFixture, e: SportyBetEvent) =>
    [side(f.homeName, e.homeName, e.homeId, ctx), side(f.awayName, e.awayName, e.awayId, ctx)] as const;

  const idPass = (f: OurFixture): boolean => {
    const hits = window(f, ID_TOLERANCE_MS).filter((e) => {
      if (usedEvents.has(e.eventId)) return false;
      const [h, a] = sides(f, e);
      return h === "id" && a === "id";
    });
    if (hits.length === 0) return false;
    accept(f, closest(f, hits), "id", SURE);
    return true;
  };

  const namePass = (f: OurFixture): boolean => {
    const open = window(f, KICKOFF_TOLERANCE_MS).filter((e) => !usedEvents.has(e.eventId));
    const scored = open.map((e) => ({ e, s: sides(f, e) }));
    const sure = scored.filter(({ s }) => certain(s[0]) && certain(s[1])).map(({ e }) => e);
    if (sure.length > 0) {
      accept(f, closest(f, sure), "name", SURE);
      return true;
    }
    // Ambiguity counts every event in the window, used or not: "Manchester"
    // fitting two games is ambiguous even after one of them was taken.
    const loose = window(f, KICKOFF_TOLERANCE_MS).filter((e) => {
      const [h, a] = sides(f, e);
      return possible(h) && possible(a);
    });
    if (loose.length === 1 && !usedEvents.has(loose[0].eventId)) {
      accept(f, loose[0], "name", SURE);
      return true;
    }
    return false;
  };

  /** Their club on the other side is plainly another of our clubs this round. */
  const otherIsSomeoneElse = (ourOther: string, theirOther: string) => {
    const mine = keysFor(ourOther, ctx);
    return seedKeys(theirOther).some((k) => ourKeys.has(k) && !mine.has(k));
  };

  const anchorPass = (f: OurFixture): boolean => {
    const slot = window(f, SLOT_TOLERANCE_MS);
    const home = slot.filter((e) => certain(side(f.homeName, e.homeName, e.homeId, ctx)));
    const away = slot.filter((e) => certain(side(f.awayName, e.awayName, e.awayId, ctx)));
    for (const [anchored, isHome] of [
      [home, true],
      [away, false],
    ] as const) {
      if (anchored.length !== 1) continue;
      const e = anchored[0];
      if (usedEvents.has(e.eventId)) continue;
      const [h, a] = sides(f, e);
      const other = isHome ? a : h;
      if (other === "conflict") continue;
      const [ourOther, theirOther] = isHome ? [f.awayName, e.awayName] : [f.homeName, e.homeName];
      if (other === "none" && otherIsSomeoneElse(ourOther, theirOther)) continue;
      const unsure = other === "none";
      accept(f, e, "anchor", isHome ? { home: false, away: unsure } : { home: unsure, away: false });
      return true;
    }
    return false;
  };

  // Ids first across the whole round, so learned clubs are taken out of play
  // before any name is compared; then names and anchors until nothing moves,
  // since every anchor teaches an id the next fixture may need.
  for (const f of input.fixtures) idPass(f);
  for (let progress = true; progress; ) {
    progress = false;
    for (const f of input.fixtures) {
      if (done.has(f.matchId)) continue;
      if (idPass(f) || namePass(f) || anchorPass(f)) progress = true;
    }
  }

  if (input.eliminate) {
    const rest = input.fixtures.filter((f) => !done.has(f.matchId));
    const openFor = (f: OurFixture) =>
      window(f, SLOT_TOLERANCE_MS).filter((e) => {
        if (usedEvents.has(e.eventId)) return false;
        const [h, a] = sides(f, e);
        return h !== "conflict" && a !== "conflict";
      });
    for (const f of rest) {
      const options = openFor(f);
      if (options.length !== 1) continue;
      const e = options[0];
      const rivals = rest.filter((g) => !done.has(g.matchId) && openFor(g).some((x) => x.eventId === e.eventId));
      if (rivals.length !== 1) continue;
      const similar =
        nameSimilarity(f.homeName, e.homeName) >= ELIMINATION_MIN_SIMILARITY ||
        nameSimilarity(f.awayName, e.awayName) >= ELIMINATION_MIN_SIMILARITY;
      if (!similar) continue;
      accept(f, e, "elimination", { home: true, away: true });
    }
  }

  const unresolved = input.fixtures
    .filter((f) => !done.has(f.matchId))
    .map((f) => ({
      matchId: f.matchId,
      candidates: window(f, KICKOFF_TOLERANCE_MS)
        .filter((e) => !usedEvents.has(e.eventId))
        .map((e) => ({
          eventId: e.eventId,
          homeName: e.homeName,
          awayName: e.awayName,
          homeId: e.homeId,
          awayId: e.awayId,
          kickoff: e.kickoff,
          score: (nameSimilarity(f.homeName, e.homeName) + nameSimilarity(f.awayName, e.awayName)) / 2,
        }))
        .sort((x, y) => y.score - x.score)
        .slice(0, 3),
    }));

  return { matched, learned, unresolved };
}

/** One fixture against a board: ids, names and anchors, never elimination. */
export function matchOne(
  fixture: FixtureLike,
  events: readonly SportyBetEvent[],
  memory: Pick<MatchInput, "links" | "aliases" | "rejected"> = {},
): { event: SportyBetEvent; method: MatchMethod; learned: LearnedLink[] } | null {
  const out = matchRound({ ...memory, fixtures: [{ ...fixture, matchId: "_" }], events });
  const hit = out.matched[0];
  return hit ? { event: hit.event, method: hit.method, learned: out.learned } : null;
}
