/**
 * Checks the direct SportyBet path end to end against the live site, without
 * a database: fetches each competition's board, matches fixtures to it with
 * the new matcher and with the old name-only rule side by side, and can book
 * a real two-pick code and read it back.
 *
 * Runs the app's own modules, so it needs the react-server condition (the
 * modules import "server-only"):
 *
 *   npx tsx --conditions=react-server scripts/smoke-sportybet.ts
 *   npx tsx --conditions=react-server scripts/smoke-sportybet.ts --fixtures=fixtures.tsv
 *   npx tsx --conditions=react-server scripts/smoke-sportybet.ts --fixtures=fixtures.tsv --book
 *   npx tsx --conditions=react-server scripts/smoke-sportybet.ts --league=premier-league
 *
 * --fixtures is a TSV of our fixtures, one per line: league code, kickoff
 * (epoch ms), home name, away name. Without it only the boards are checked.
 * Booking is free and harmless (a code is only a shared selection list), but
 * it is a real call, so it only happens with --book.
 */
import { readFileSync } from "node:fs";
import { LEAGUES } from "../src/lib/leagues";
import { findFixture, KICKOFF_TOLERANCE_MS } from "../src/lib/odds/match-fixture";
import { planBooking } from "../src/lib/odds/booking";
import { createShareCode, fetchTournamentEvents, readShareCode } from "../src/lib/odds/sportybet-direct";
import { matchRound, type MatchedFixture, type OurFixture } from "../src/lib/odds/sportybet-match";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);

function readFixtures(path: string): (OurFixture & { league: string })[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line, i) => {
      const [league, kickoff, homeName, awayName] = line.split("\t");
      return { league, matchId: `row-${i + 1}`, kickoff: Number(kickoff), homeName, awayName };
    });
}

async function main() {
  const only = arg("league");
  const path = arg("fixtures");
  const fixtures = path ? readFixtures(path) : [];
  const leagues = LEAGUES.filter((l) => l.ids.sportyBet && (!only || l.code === only));
  const matched: MatchedFixture[] = [];
  let total = 0;
  let listed = 0;
  let old = 0;

  for (const league of leagues) {
    const events = await fetchTournamentEvents(league.ids.sportyBet!);
    if (!events) {
      console.log(`${league.code.padEnd(24)} SportyBet did not answer`);
      continue;
    }
    const ours = fixtures.filter((f) => f.league === league.code);
    if (ours.length === 0) {
      console.log(`${league.code.padEnd(24)} ${events.length} events, with competitor ids: ${events.filter((e) => e.homeId).length}`);
      continue;
    }
    const out = matchRound({ fixtures: ours, events, eliminate: true });
    const byMethod: Record<string, number> = {};
    for (const m of out.matched) byMethod[m.method] = (byMethod[m.method] ?? 0) + 1;
    const inWindow = ours.filter((f) => events.some((e) => Math.abs(e.kickoff - f.kickoff) <= KICKOFF_TOLERANCE_MS));
    const nameOnly = ours.filter((f) => findFixture(f, events)).length;
    console.log(
      `${league.code.padEnd(24)} ${events.length} events | ours ${ours.length}, listed ${inWindow.length} | name-only ${nameOnly}, new ${out.matched.length} ${JSON.stringify(byMethod)}`,
    );
    for (const m of out.matched) {
      const f = ours.find((x) => x.matchId === m.matchId)!;
      if (m.method !== "name" || !findFixture(f, events)) {
        console.log(`    + ${m.method.padEnd(11)} ${f.homeName} v ${f.awayName}  =>  ${m.event.homeName} v ${m.event.awayName}`);
      }
    }
    for (const u of out.unresolved.filter((u) => u.candidates.length)) {
      const f = ours.find((x) => x.matchId === u.matchId)!;
      const best = u.candidates.map((c) => `${c.homeName} v ${c.awayName} (${c.score.toFixed(2)})`).join(" | ");
      console.log(`    ? ${f.homeName} v ${f.awayName}  best: ${best}`);
    }
    matched.push(...out.matched);
    total += ours.length;
    listed += inWindow.length;
    old += nameOnly;
  }

  if (fixtures.length) {
    console.log(`\nTotal: ${total} fixtures, ${listed} listed on SportyBet. Name-only matched ${old}; new matcher ${matched.length}.`);
  }

  if (flag("book")) {
    const legs = matched
      .filter((m) => m.event.kickoff - Date.now() > 60 * 60_000)
      .slice(0, 2)
      .map((m) => ({ market: "1x2:home", eventId: m.eventId, kickoff: m.event.kickoff }));
    const plan = planBooking(legs);
    if (!plan.ok) {
      console.log("\nNothing bookable:", JSON.stringify(plan.problems));
      return;
    }
    const booked = await createShareCode(plan.selections);
    if (!booked) {
      console.log("\nBooking refused.");
      process.exitCode = 1;
      return;
    }
    const back = await readShareCode(booked.bookingCode);
    console.log(
      `\nBooked ${booked.bookingCode} (${booked.selectionsCount} picks, loads until ${new Date(booked.deadline).toISOString()}); read back: ${back ? `${back.selectionsCount} picks` : "unreadable"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
