/** End-to-end check: real results -> fitted ratings -> a real fixture's markets. */
import { getSeasonResults, getUpcoming, getH2H, getTrainingResults } from "@/lib/providers";
import { leagueByCode } from "@/lib/leagues";
import { buildPrediction } from "@/lib/model/predict";
import { fitLeague } from "@/lib/model/fit";

async function main() {
  const epl = leagueByCode("premier-league")!;
  const results = await getSeasonResults(epl);
  console.log(`EPL training rows: ${results.length}`);

  const fit = fitLeague(results);
  console.log(`fit: matches=${fit.matchesUsed} homeAdv=${fit.homeAdvantage.toFixed(3)} rho=${fit.rho.toFixed(3)} base=${fit.baseRate.toFixed(3)}`);

  const top = [...fit.ratings.values()].sort((a, b) => b.attack - a.attack).slice(0, 5);
  console.log("strongest attacks:", top.map((r) => `${r.name} ${r.attack.toFixed(2)}`).join(", "));
  const best = [...fit.ratings.values()].sort((a, b) => b.defence - a.defence).slice(0, 5);
  console.log("strongest defences:", best.map((r) => `${r.name} ${r.defence.toFixed(2)}`).join(", "));

  const upcoming = await getUpcoming(7);
  const fixture = upcoming[0];
  if (!fixture) { console.log("no upcoming fixture available"); return; }

  const training = await getTrainingResults(fixture);
  const h2h = await getH2H(fixture);
  console.log(`\ntraining for fixture: ${training.rows.length} rows from ${training.leagueName} (curated=${training.curated})`);

  const p = buildPrediction(fixture, training.rows, h2h);
  console.log(`\nFIXTURE: ${p.match.home.name} vs ${p.match.away.name} (${p.match.league.name}) ${p.match.kickoff}`);
  console.log(`xG: ${p.markets.expectedGoals.home.toFixed(2)} - ${p.markets.expectedGoals.away.toFixed(2)}`);
  console.log(`1X2: H ${(p.markets.home*100).toFixed(1)}%  D ${(p.markets.draw*100).toFixed(1)}%  A ${(p.markets.away*100).toFixed(1)}%  (sum ${((p.markets.home+p.markets.draw+p.markets.away)*100).toFixed(4)}%)`);
  console.log(`O2.5 ${(p.markets.over["2.5"]*100).toFixed(1)}%  BTTS ${(p.markets.bttsYes*100).toFixed(1)}%`);
  console.log(`data quality ${p.model.dataQuality.toFixed(0)}/100, uncertainty ${p.model.uncertainty.toFixed(2)}, rows ${p.model.matchesUsed}`);
  console.log(`TOP PICK: ${p.topPick?.label} @ fair ${p.topPick?.fairOdds.toFixed(2)} (${(p.topPick!.probability*100).toFixed(1)}%, conf ${p.topPick?.confidence.toFixed(0)})`);
  console.log("next picks:", p.picks.slice(1,5).map(x=>`${x.label} ${(x.probability*100).toFixed(0)}%`).join(" | "));
  console.log(`top scores:`, p.markets.correctScore.slice(0,4).map(s=>`${s.home}-${s.away} ${(s.probability*100).toFixed(1)}%`).join(" "));
  console.log(`home form: ${p.form.home.entries.map(e=>e.result).join("")} | away form: ${p.form.away.entries.map(e=>e.result).join("")}`);
  console.log(`h2h meetings: ${p.h2h.meetings}, avg goals ${p.h2h.avgGoals.toFixed(2)}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
