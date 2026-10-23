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
 *   npx tsx --conditions=react-server scripts/smoke-sportybet.ts --results=europa-league
 *   npx tsx --conditions=react-server scripts/smoke-sportybet.ts --backtest=finished.tsv --links=links.tsv
 *
 * --fixtures is a TSV of our fixtures, one per line: league code, kickoff
 * (epoch ms), home name, away name. Without it only the boards are checked.
 * Booking is free and harmless (a code is only a shared selection list), but
 * it is a real call, so it only happens with --book. --results prints
 * SportyBet's final scores for a competition over the last three days: the
 * ground truth the link verification (sportybet-verify.ts) checks against.
 *
 * --backtest proves the matcher against games already played: our finished
 * fixtures (the --fixtures columns plus a fifth, the score "2:1") are matched
 * to SportyBet's results for the same days, each match is checked against
 * SportyBet's final score, and accuracy is reported per method. --links is
 * the learned club ids to start from (league, team key, competitor id), as
 * exported from public.sportybet_competitors; without it the run starts
 * from names alone.
 */
import { readFileSync } from "node:fs";
import { LEAGUES } from "../src/lib/leagues";
import { readEvent, scoreVerdict, type EventResult, type SportyBetEvent } from "../src/lib/odds/sportybet-api";
import { findFixture, KICKOFF_TOLERANCE_MS } from "../src/lib/odds/match-fixture";
import { planBooking } from "../src/lib/odds/booking";
import { createShareCode, fetchResults, fetchTournamentEvents, readShareCode } from "../src/lib/odds/sportybet-direct";
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

async function printResults(code: string) {
  const league = LEAGUES.find((l) => l.code === code);
  if (!league?.ids.sportyBet) throw new Error(`${code} has no SportyBet id`);
  const results = await fetchResults(league.ids.sportyBet, Date.now() - 3 * 86_400_000, Date.now());
  if (!results) throw new Error("SportyBet did not answer");
  console.log(`${code}: ${results.length} finished in the last 3 days`);
  for (const r of results) {
    console.log(`  ${r.eventId}  ${r.void ? "called off" : `${r.setScore}  (halves ${r.halves.join(", ")})`}`);
  }
}

const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A finished event with its competitor ids, from the detail endpoint; spaced to stay polite. */
async function detail(eventId: string): Promise<SportyBetEvent | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await pause(attempt === 0 ? 2_100 : 6_000);
    const res = await fetch(`https://www.sportybet.com/api/ng/factsCenter/event?eventId=${eventId}&productId=3`, {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.sportybet.com/ng/m/" },
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { bizCode?: number; data?: Record<string, unknown> } | null;
    const event = body?.bizCode === 10000 && body.data ? readEvent(body.data) : null;
    if (event) return event;
  }
  console.log(`    ! no detail for ${eventId}`);
  return null;
}

async function backtest(path: string, linksPath?: string) {
  const rows = readFileSync(path, "utf8").trim().split("\n").map((line, i) => {
    const [league, kickoff, homeName, awayName, score] = line.split("\t");
    const [home, away] = score.split(":").map(Number);
    return { league, matchId: `row-${i + 1}`, kickoff: Number(kickoff), homeName, awayName, home, away };
  });
  const links = new Map<string, Map<string, string>>();
  for (const line of linksPath ? readFileSync(linksPath, "utf8").trim().split("\n") : []) {
    const [league, teamKey, competitorId] = line.split("\t");
    if (!links.has(league)) links.set(league, new Map());
    links.get(league)!.set(teamKey, competitorId);
  }

  const tally: Record<string, { confirmed: number; mismatch: number }> = {};
  let total = 0;
  let listed = 0;
  let nameOnly = 0;
  const only = arg("league");
  for (const league of LEAGUES.filter((l) => l.ids.sportyBet && (!only || l.code === only))) {
    const ours = rows.filter((r) => r.league === league.code);
    if (ours.length === 0) continue;
    const kicks = ours.map((r) => r.kickoff);
    const results = await fetchResults(league.ids.sportyBet!, Math.min(...kicks) - 6 * 3_600_000, Math.max(...kicks) + 6 * 3_600_000);
    if (!results) {
      console.log(`${league.code.padEnd(24)} SportyBet did not answer`);
      continue;
    }
    const byId = new Map<string, EventResult>(results.map((r) => [r.eventId, r]));
    console.log(`  ${league.code}: ${results.length} results on SportyBet`);
    const events: SportyBetEvent[] = [];
    for (const r of results.filter((x) => !x.void)) {
      const e = await detail(r.eventId);
      if (e) events.push(e);
    }
    const out = matchRound({ fixtures: ours, events, links: links.get(league.code), eliminate: true });
    const line: Record<string, string> = {};
    for (const m of out.matched) {
      const f = ours.find((x) => x.matchId === m.matchId)!;
      const verdict = scoreVerdict({ home: f.home, away: f.away }, byId.get(m.eventId)!);
      const t = (tally[m.method] ??= { confirmed: 0, mismatch: 0 });
      t[verdict]++;
      line[m.method] = `${(line[m.method] ? Number(line[m.method].split("/")[0]) : 0) + (verdict === "confirmed" ? 1 : 0)}/${
        (line[m.method] ? Number(line[m.method].split("/")[1]) : 0) + 1
      }`;
      if (verdict === "mismatch") {
        console.log(`    ✗ ${m.method}: ${f.homeName} v ${f.awayName} ${f.home}:${f.away}  =>  ${m.event.homeName} v ${m.event.awayName} ${byId.get(m.eventId)!.setScore}`);
      }
    }
    const inWindow = ours.filter((f) => events.some((e) => Math.abs(e.kickoff - f.kickoff) <= KICKOFF_TOLERANCE_MS));
    const old = ours.filter((f) => findFixture(f, events)).length;
    console.log(
      `${league.code.padEnd(24)} ours ${ours.length}, on SportyBet ${inWindow.length} | name-only ${old}, new ${out.matched.length} | confirmed by score ${JSON.stringify(line)}`,
    );
    for (const u of out.unresolved.filter((u) => u.candidates.length)) {
      const f = ours.find((x) => x.matchId === u.matchId)!;
      console.log(`    ? ${f.homeName} v ${f.awayName}  best: ${u.candidates.map((c) => `${c.homeName} v ${c.awayName}`).join(" | ")}`);
    }
    total += ours.length;
    listed += inWindow.length;
    nameOnly += old;
  }
  const confirmed = Object.values(tally).reduce((n, t) => n + t.confirmed, 0);
  const mismatch = Object.values(tally).reduce((n, t) => n + t.mismatch, 0);
  console.log(`\nTotal: ${total} finished fixtures, ${listed} on SportyBet. Name-only matched ${nameOnly}; new matcher ${confirmed + mismatch}.`);
  console.log(`Checked against SportyBet's final scores: ${confirmed} confirmed, ${mismatch} mismatched.`);
  for (const [method, t] of Object.entries(tally)) console.log(`  ${method.padEnd(12)} ${t.confirmed} confirmed, ${t.mismatch} mismatched`);
}

async function main() {
  const results = arg("results");
  if (results) return printResults(results);
  const bt = arg("backtest");
  if (bt) return backtest(bt, arg("links"));
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
