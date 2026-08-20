/** Manual smoke check: proves the adapters return real, live upstream data. */
import { getLive, getUpcoming, getSeasonResults, providerHealth } from "@/lib/providers";
import { leagueByCode } from "@/lib/leagues";

async function main() {
  console.log("providers:", providerHealth().map((p) => `${p.id}=${p.configured}`).join(" "));

  const live = await getLive();
  console.log(`\nLIVE: ${live.length}`);
  for (const m of live.slice(0, 6)) {
    console.log(`  [${m.league.name}] ${m.home.name} ${m.score.home ?? "-"}-${m.score.away ?? "-"} ${m.away.name} (${m.status} ${m.minute ?? ""}') src=${m.source}`);
  }

  const up = await getUpcoming(5);
  console.log(`\nUPCOMING(5d): ${up.length}`);
  for (const m of up.slice(0, 10)) {
    console.log(`  ${m.kickoff}  [${m.league.name}] ${m.home.name} vs ${m.away.name}  src=${m.source}`);
  }

  const epl = leagueByCode("premier-league")!;
  const res = await getSeasonResults(epl);
  console.log(`\nEPL RESULTS: ${res.length}`);
  for (const r of res.slice(-5)) {
    console.log(`  ${new Date(r.date).toISOString().slice(0,10)} ${r.homeName} ${r.homeGoals}-${r.awayGoals} ${r.awayName}`);
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
