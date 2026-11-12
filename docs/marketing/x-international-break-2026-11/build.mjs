// Builds the three X posters (1200x1200, exported at 2x) from real KiqStat data.
// Run from the repo root: NODE_PATH=$(npm root -g) node docs/marketing/x-international-break-2026-11/build.mjs
// Figures come from predictions_log on 12 Nov 2026; edit DATA to reuse for another round.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // resolved through NODE_PATH
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const font = (f) => readFileSync(resolve(root, "assets/fonts", f)).toString("base64");
const lockup = (file) => readFileSync(resolve(root, "public/brand", file), "utf8").replace(/<svg /, '<svg class="lockup" ');

const DATA = {
  match: { comp: "UEFA Nations League", when: "Thu 12 Nov · 20:45 WAT", home: "England", away: "Croatia",
    pick: "England to win", price: "1.27", market: 77, model: 75,
    also: [["Over 2.5 goals", 72], ["Both teams to score", 59]] },
  receipt: { day: "Sunday 8 November", total: 65, won: 47, lost: 18,
    rows: [
      ["Atlético Madrid", "1-2", "Barcelona", "Atlético under 2.5 goals", 82, true],
      ["Fiorentina", "2-2", "Juventus", "Juventus to score", 80, true],
      ["Sunderland", "1-0", "Chelsea", "Chelsea to score", 79, false],
      ["Genoa", "1-2", "AC Milan", "AC Milan to score", 77, true],
      ["Man United", "4-4", "Aston Villa", "Villa over 2.5 corners", 77, false],
      ["Crystal Palace", "1-3", "Liverpool", "Liverpool under 7.5 corners", 73, true],
      ["Celta Vigo", "0-0", "Levante", "Celta to score", 81, false],
      ["Inter Milan", "2-0", "Como", "Como under 5.5 corners", 81, true],
    ],
    allWon: "1,241", allTotal: "1,702", allPct: 73, since: "22 Aug" },
  slate: { count: 23, rows: [
      ["THU 18:00", "Turkey", "Belgium", "Belgium or draw", 75],
      ["THU 20:45", "England", "Croatia", "England to win", 75],
      ["FRI 15:30", "Saudi Arabia", "South Korea", "Over 1.5 goals", 71],
      ["FRI 20:45", "Netherlands", "Greece", "Greece under 1.5 goals", 70],
      ["FRI 20:45", "Serbia", "Germany", "Serbia under 1.5 goals", 73],
      ["SAT 01:00", "Colombia", "Chile", "Over 1.5 goals", 73],
    ] },
};

const base = `
@font-face{font-family:Unbounded;src:url(data:font/ttf;base64,${font("Unbounded-ExtraBold.ttf")});font-weight:800}
@font-face{font-family:Grotesk;src:url(data:font/ttf;base64,${font("SpaceGrotesk-Medium.ttf")});font-weight:500}
@font-face{font-family:Grotesk;src:url(data:font/ttf;base64,${font("SpaceGrotesk-Bold.ttf")});font-weight:700}
@font-face{font-family:Plex;src:url(data:font/ttf;base64,${font("IBMPlexMono-Medium.ttf")});font-weight:500}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1200px;height:1200px;font-family:Grotesk,sans-serif;font-weight:500;overflow:hidden}
.p{width:1200px;height:1200px;padding:64px 72px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.lockup{height:52px;width:auto;display:block}
.mono{font-family:Plex,monospace;font-weight:500;letter-spacing:.04em}
.h{font-family:Unbounded;font-weight:800;letter-spacing:-.025em;line-height:1.08}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:22px}
.url{font-family:Unbounded;font-weight:800;font-size:26px;letter-spacing:-.01em}
`;

/* 1. Ink: one match, market price against the model. */
const m = DATA.match;
const p1 = `<style>${base}
.p{background:#07090B;color:#F2F4EC}
.tag{font-size:22px;color:#97A39C;text-transform:uppercase}
.teams{margin-top:84px;font-size:30px;color:#97A39C;font-weight:700}
.h{font-size:76px;margin-top:18px}
.h em{font-style:normal;color:#D4FF3A}
.card{margin-top:56px;background:linear-gradient(180deg,#0F1513,#0B0E0D);border:2px solid #1E2723;border-radius:24px;padding:38px 40px}
.row{display:grid;grid-template-columns:330px 1fr 130px;align-items:center;gap:26px}
.row+.row{margin-top:30px}
.lab{font-size:21px;color:#97A39C;white-space:nowrap}.lab b{display:block;color:#F2F4EC;font-size:28px;font-weight:700}
.track{height:34px;background:#151C19;border-radius:999px;overflow:hidden}
.fill{height:100%;border-radius:999px}
.num{font-family:Plex;font-size:54px;text-align:right}
.also{display:flex;gap:14px;margin-top:34px;padding-top:28px;border-top:2px solid #1E2723;font-size:23px;color:#97A39C;align-items:center}
.chip{border:2px solid #2E3A34;border-radius:999px;padding:8px 18px;color:#F2F4EC}
.chip span{font-family:Plex;color:#D4FF3A;margin-left:8px}
.q{margin-top:52px;font-size:46px;font-weight:700}
.foot{color:#6B7670}.url{color:#F2F4EC}
</style><div class="p">
<div class="top">${lockup("lockup.svg")}<div class="tag mono">${m.comp} · ${m.when}</div></div>
<div class="teams">${m.home} v ${m.away}</div>
<div class="h">The price says ${m.market}%.<br>Our model says <em>${m.model}%.</em></div>
<div class="card">
 <div class="row"><div class="lab"><b>Market price</b><span class="mono">${m.pick} @ ${m.price}</span></div><div class="track"><div class="fill" style="width:${m.market}%;background:#F2F4EC"></div></div><div class="num">${m.market}%</div></div>
 <div class="row"><div class="lab"><b>KiqStat model</b><span class="mono">chance of an ${m.home} win</span></div><div class="track"><div class="fill" style="width:${m.model}%;background:#D4FF3A"></div></div><div class="num" style="color:#D4FF3A">${m.model}%</div></div>
 <div class="also">Same match:${m.also.map(([l, v]) => `<div class="chip">${l}<span>${v}%</span></div>`).join("")}</div>
</div>
<div class="q">Short price, big name. In or out?</div>
<div class="foot"><div>A model's chance, not a certainty.<br>18+ · Play responsibly</div><div class="url">kiqstat.app</div></div>
</div>`;

/* 2. Chalk: last Sunday's settled picks, losses included. */
const r = DATA.receipt;
const p2 = `<style>${base}
.p{background:#F4F5EF;color:#07090B;padding-top:56px}
.tag{font-size:22px;color:#4C5650;text-transform:uppercase}
.h{font-size:60px;margin-top:44px}
.h .w{color:#4F6B00}.h .l{color:#D6274B}
.sub{margin-top:14px;font-size:26px;color:#4C5650}
.list{margin-top:30px;border-top:2px solid #07090B}
.r{display:grid;grid-template-columns:1fr 330px 86px 110px;gap:18px;align-items:center;padding:17px 0;border-bottom:2px solid #E1E4DA;font-size:25px}
.r .g{font-weight:700}.r .g i{font-style:normal;font-family:Plex;margin:0 10px;font-weight:500}
.r .pk{color:#4C5650;font-size:22px}
.r .c{font-family:Plex;text-align:right;color:#78827C}
.b{font-family:Plex;font-size:19px;text-align:center;border-radius:999px;padding:6px 0;border:2px solid}
.b.w{color:#4F6B00;border-color:#4F6B00}.b.l{color:#fff;background:#D6274B;border-color:#D6274B}
.all{margin-top:26px;font-size:26px;line-height:1.35}.all b{font-family:Plex;font-weight:500;background:#07090B;color:#D4FF3A;padding:2px 10px;border-radius:8px}
.foot{color:#78827C}.url{color:#07090B}
</style><div class="p">
<div class="top">${lockup("lockup-ink.svg")}<div class="tag mono">Settled · ${r.day}</div></div>
<div class="h">${r.total} picks.<br><span class="w">${r.won} landed.</span> <span class="l">${r.lost} didn't.</span></div>
<div class="sub">Eight of the ${r.total}, exactly as published. We don't delete the red ones.</div>
<div class="list">${r.rows.map(([h, s, a, pk, c, w]) => `<div class="r"><div class="g">${h}<i>${s}</i>${a}</div><div class="pk">${pk}</div><div class="c">${c}%</div><div class="b ${w ? "w" : "l"}">${w ? "LANDED" : "MISSED"}</div></div>`).join("")}</div>
<div class="all">Since ${r.since}: <b>${r.allWon} of ${r.allTotal}</b> settled picks landed (${r.allPct}%). All on the Track page.</div>
<div class="foot"><div>Past results don't promise future ones.<br>18+ · Play responsibly</div><div class="url">kiqstat.app/football/track-record</div></div>
</div>`;

/* 3. Volt: the international slate. */
const s = DATA.slate;
const p3 = `<style>${base}
.p{background:#D4FF3A;color:#07090B}
.tag{font-size:22px;text-transform:uppercase}
.h{font-size:68px;margin-top:40px}
.sub{margin-top:12px;font-size:26px;font-weight:700}
.card{margin-top:26px;background:#07090B;color:#F2F4EC;border-radius:24px;padding:8px 36px}
.r{display:grid;grid-template-columns:150px 1fr 190px 84px;gap:20px;align-items:center;padding:12px 0;border-bottom:2px solid #1E2723}
.r:last-child{border:0}
.t{font-family:Plex;font-size:21px;color:#97A39C}
.g{font-size:27px;font-weight:700}.g small{display:block;font-size:22px;font-weight:500;color:#97A39C;margin-top:3px}
.track{height:14px;background:#151C19;border-radius:999px}.fill{height:100%;background:#D4FF3A;border-radius:999px}
.c{font-family:Plex;font-size:30px;text-align:right;color:#D4FF3A}
.q{margin-top:26px;font-size:36px;font-weight:700}
.foot{color:#07090B}.url{color:#07090B}
</style><div class="p">
<div class="top">${lockup("lockup-ink.svg")}<div class="tag mono">International break · 12–14 Nov</div></div>
<div class="h">No club football.<br>${s.count} games priced.</div>
<div class="sub">The model's chance on six of them. Times in WAT.</div>
<div class="card">${s.rows.map(([t, h, a, pk, c]) => `<div class="r"><div class="t">${t}</div><div class="g">${h} v ${a}<small>${pk}</small></div><div class="track"><div class="fill" style="width:${c}%"></div></div><div class="c">${c}%</div></div>`).join("")}</div>
<div class="q">Which one are you leaving out?</div>
<div class="foot"><div>A model's chance, not a certainty.<br>18+ · Play responsibly</div><div class="url">kiqstat.app</div></div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
for (const [name, html] of [["01-price-vs-model", p1], ["02-sunday-receipt", p2], ["03-break-slate", p3]]) {
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const over = await page.evaluate(() => { const p = document.querySelector(".p"); return p.scrollHeight - p.clientHeight; });
  if (over > 0) console.warn(`${name}: content overflows by ${over}px`);
  await page.screenshot({ path: resolve(here, `${name}.png`) });
  console.log("wrote", name);
}
await browser.close();
