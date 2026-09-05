import { NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { leagueByProviderName } from "@/lib/leagues";
import { priceQuotes, type QuoteRequest } from "@/lib/odds";

/**
 * Live prices for the selections on a user's slip.
 *
 * The slip lives in the browser's own storage and has never been near a
 * provider, so unlike the match page there is no server-side fixture to look
 * up: the client sends what it holds and the server matches it to a bookmaker
 * by name and kickoff. That matching refuses far more often than it guesses --
 * see match-fixture.ts -- which is the correct bias when the alternative is
 * quoting one match's price against another's.
 *
 * Cost of abuse is deliberately flat. Both providers are fetched a whole
 * competition at a time behind a TTL cache, so a thousand calls to this route
 * spend exactly what one spends. The cap below is about response size and
 * fairness, not about the meter.
 */

export const dynamic = "force-dynamic";

/** Per-user and never worth a shared cache: prices move and slips differ. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * More legs than any slip the UI can build.
 *
 * The slip view warns at five and the accumulator maths is meaningless well
 * before twenty, so this bounds a malformed or hostile payload rather than
 * constraining a real user.
 */
const MAX_LEGS = 20;

interface IncomingLeg {
  matchId?: unknown;
  homeName?: unknown;
  awayName?: unknown;
  kickoff?: unknown;
  league?: unknown;
  market?: unknown;
  label?: unknown;
  probability?: unknown;
  fairOdds?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  // Same wall as the panel on the match page: an account, not a payment.
  const entitlement = await getEntitlement();
  if (!entitlement.signedIn) {
    return NextResponse.json(
      { error: "Sign in to see live prices.", locked: true },
      { status: 403, headers: NO_STORE },
    );
  }

  const body = (await request.json().catch(() => null)) as { legs?: IncomingLeg[] } | null;
  const incoming = Array.isArray(body?.legs) ? body.legs.slice(0, MAX_LEGS) : [];
  if (incoming.length === 0) {
    return NextResponse.json({ prices: [] }, { headers: NO_STORE });
  }

  const keys: string[] = [];
  const requests: QuoteRequest[] = [];

  for (const leg of incoming) {
    const matchId = str(leg.matchId);
    const homeName = str(leg.homeName);
    const awayName = str(leg.awayName);
    const market = str(leg.market);
    const probability = num(leg.probability);
    const fairOdds = num(leg.fairOdds);
    const kickoff = str(leg.kickoff);
    if (!matchId || !homeName || !awayName || !market || probability === null || !kickoff) {
      continue;
    }

    const at = Date.parse(kickoff);
    if (!Number.isFinite(at)) continue;

    // The slip stores the competition's display name, not its slug. Resolving
    // it is what decides whether a consensus is even reachable, and an
    // unresolved name yields a local price alone rather than a wrong league.
    const league = leagueByProviderName(str(leg.league) ?? "");

    keys.push(`${matchId}|${market}`);
    requests.push({
      homeName,
      awayName,
      kickoff: at,
      leagueCode: league?.code,
      market,
      label: str(leg.label) ?? market,
      probability,
      fairOdds: fairOdds ?? (probability > 0 ? 1 / probability : 0),
    });
  }

  try {
    const priced = await priceQuotes(requests);
    return NextResponse.json(
      {
        prices: priced.map((row, i) => ({
          key: keys[i],
          market: row.market,
          price: row.local,
          rating: row.priceVerdict?.rating ?? null,
          reason: row.priceVerdict?.reason ?? row.modelVerdict?.reason ?? null,
          marketPrice: row.consensus ? 1 / row.consensus.fairProbability : null,
          best: row.consensus?.best.price ?? null,
          books: row.consensus?.books ?? null,
        })),
      },
      { headers: NO_STORE },
    );
  } catch {
    // A price nobody can read is a missing price, not a broken page: the slip
    // renders perfectly well from the model's own break-even.
    return NextResponse.json({ prices: [] }, { headers: NO_STORE });
  }
}
