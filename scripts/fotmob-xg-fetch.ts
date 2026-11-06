/**
 * Fetches team xG per finished match from FotMob into a local JSONL cache, for
 * the walk-forward tests (scripts/audit-eval.ts --xg=<file>). Read-only, polite
 * (a few requests a second at most) and resumable: matches already in the file
 * are skipped. Stops at 31 Oct 2026, the frozen holdout (scripts/lib/holdout.ts).
 *
 * FotMob's feed is unofficial and its xG is licensed data (ingestion/.../fotmob.py
 * says as much): this is for internal model testing, not for display or redistribution.
 *
 *   npx tsx scripts/fotmob-xg-fetch.ts --out=<file.jsonl> [--leagues=47,87,55,54,53] [--from=2022] [--workers=3]
 */
import fs from "node:fs";
import { TUNING_END } from "./lib/holdout";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const OUT = arg("out");
if (!OUT) throw new Error("--out=<file.jsonl> is required");
const LEAGUES = (arg("leagues") ?? "47,87,55,54,53").split(",").map(Number);
const FROM_YEAR = Number(arg("from") ?? 2022);
const WORKERS = Number(arg("workers") ?? 3);
const GAP_MS = 1000;
const END = Date.parse(TUNING_END) + 86_400_000;
const UA = { "User-Agent": "Mozilla/5.0 (KiqStatResearch)" };

// FotMob's JSON is untyped and unofficial: read defensively, never trust a shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(url: string, tries = 3): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 429) await new Promise((res) => setTimeout(res, 15_000));
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}

/** "2 - 1" -> [2, 1]; the final score is on the status line, not on the team objects. */
const scoreOf = (s: unknown): [number, number] => {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(s ?? ""));
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const xgOf = (m: any): [number, number] | null => {
  for (const g of m?.content?.stats?.Periods?.All?.stats ?? [])
    for (const s of g.stats ?? [])
      if (s.key === "expected_goals" && Array.isArray(s.stats)) {
        const a = Number(s.stats[0]), b = Number(s.stats[1]);
        return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
      }
  return null;
};

async function main() {
  const done = new Set<string>();
  if (fs.existsSync(OUT!)) for (const l of fs.readFileSync(OUT!, "utf8").split("\n")) if (l) done.add(String(JSON.parse(l).id));
  const jobs: { league: number; season: string; id: number; date: string; home: string; away: string; hg: number; ag: number }[] = [];
  for (const league of LEAGUES) {
    const first = await get(`https://www.fotmob.com/api/data/leagues?id=${league}`);
    const seasons: string[] = (first?.allAvailableSeasons ?? []).filter((s: string) => Number(s.slice(0, 4)) >= FROM_YEAR);
    for (const season of seasons) {
      const d = await get(`https://www.fotmob.com/api/data/leagues?id=${league}&season=${encodeURIComponent(season)}`);
      for (const x of d?.fixtures?.allMatches ?? []) {
        if (!x.status?.finished || done.has(String(x.id))) continue;
        const t = Date.parse(x.status.utcTime);
        if (!(t < END)) continue;
        jobs.push({ league, season, id: x.id, date: x.status.utcTime, home: x.home?.name, away: x.away?.name, hg: scoreOf(x.status?.scoreStr)[0], ag: scoreOf(x.status?.scoreStr)[1] });
      }
      await new Promise((res) => setTimeout(res, GAP_MS));
    }
    process.stderr.write(`league ${league}: ${jobs.length} to fetch so far\n`);
  }
  process.stderr.write(`${jobs.length} matches to fetch, ${done.size} already held\n`);
  let next = 0, ok = 0, missing = 0;
  const out = fs.createWriteStream(OUT!, { flags: "a" });
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      for (;;) {
        const j = jobs[next++];
        if (!j) return;
        const m = await get(`https://www.fotmob.com/api/data/matchDetails?matchId=${j.id}`);
        const xg = m ? xgOf(m) : null;
        if (xg) {
          out.write(JSON.stringify({ ...j, hxg: xg[0], axg: xg[1] }) + "\n");
          ok++;
        } else missing++;
        if ((ok + missing) % 250 === 0) process.stderr.write(`${ok + missing}/${jobs.length} (no xG: ${missing})\n`);
        await new Promise((res) => setTimeout(res, GAP_MS));
      }
    }),
  );
  out.end();
  process.stderr.write(`done: ${ok} with xG, ${missing} without\n`);
}

void main();
