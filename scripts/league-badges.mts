/**
 * Refreshes /public/leagues/<code>.webp from TheSportsDB league badges.
 * Run: npx tsx scripts/league-badges.mts  (free key, rate limited: be patient)
 * Badge URLs are kept in scripts/league-badges.json so a re-run only fetches
 * new competitions.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { LEAGUES } from "@/lib/leagues";

const FILE = "scripts/league-badges.json";
const urls: Record<string, string> = JSON.parse(readFileSync(FILE, "utf8"));
mkdirSync("public/leagues", { recursive: true });
for (const l of LEAGUES) {
  if (!urls[l.code] && l.ids.theSportsDb) {
    const r = await fetch(`https://www.thesportsdb.com/api/v1/json/123/lookupleague.php?id=${l.ids.theSportsDb}`);
    const lg = ((await r.json().catch(() => null)) as { leagues?: { strBadge?: string }[] } | null)?.leagues?.[0];
    if (lg?.strBadge) urls[l.code] = lg.strBadge;
    await new Promise((res) => setTimeout(res, 4000));
  }
  if (!urls[l.code]) continue;
  const png = Buffer.from(await (await fetch(`${urls[l.code]}/small`)).arrayBuffer());
  await sharp(png).trim().resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toFile(`public/leagues/${l.code}.webp`);
}
writeFileSync(FILE, JSON.stringify(urls, null, 1));
