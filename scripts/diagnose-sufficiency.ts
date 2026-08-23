/**
 * One-off diagnostic for the "not enough history to call" gap (Part 6 of
 * the feature-review pass) — reports how many training rows getSeasonResults
 * actually returns per curated league today, so a fix targets the real
 * cause instead of guessing.
 *
 * Usage: npx tsx scripts/diagnose-sufficiency.ts
 */
import "dotenv/config";
import { getSeasonResults, providerHealth } from "@/lib/providers";
import { LEAGUES } from "@/lib/leagues";
import { MIN_PUBLISHABLE_MATCHES, THIN_SAMPLE } from "@/lib/model/predict";

async function main() {
  console.log("providers:", providerHealth().map((p) => `${p.id}=${p.configured}`).join(" "));
  console.log(`thresholds: insufficient < ${MIN_PUBLISHABLE_MATCHES}, thin < ${THIN_SAMPLE}\n`);

  for (const league of LEAGUES) {
    const rows = await getSeasonResults(league);
    const level = rows.length < MIN_PUBLISHABLE_MATCHES ? "INSUFFICIENT" : rows.length < THIN_SAMPLE ? "thin" : "good";
    console.log(`${level.padEnd(13)} ${String(rows.length).padStart(4)} rows  ${league.name} (${league.code})`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
