// Builds the three photo posters (1200x1500, 4:5, exported at 2x): real football photography
// plus real screenshots of kiqstat.app (taken 12 Nov 2026) in a drawn phone frame.
// Run from the repo root: NODE_PATH=$(npm root -g) node docs/marketing/x-international-break-2026-11/build-photo.mjs
// Photos: Unsplash licence (free commercial use), see assets/SOURCES.md.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const b64 = (p) => readFileSync(p).toString("base64");
const font = (f) => b64(resolve(root, "assets/fonts", f));
const img = (f) => `data:image/${f.endsWith(".png") ? "png" : "jpeg"};base64,${b64(resolve(here, "assets", f))}`;
const lockup = (file) => readFileSync(resolve(root, "public/brand", file), "utf8").replace(/<svg /, '<svg class="lockup" ');

const base = `
@font-face{font-family:Unbounded;src:url(data:font/ttf;base64,${font("Unbounded-ExtraBold.ttf")});font-weight:800}
@font-face{font-family:Grotesk;src:url(data:font/ttf;base64,${font("SpaceGrotesk-Medium.ttf")});font-weight:500}
@font-face{font-family:Grotesk;src:url(data:font/ttf;base64,${font("SpaceGrotesk-Bold.ttf")});font-weight:700}
@font-face{font-family:Plex;src:url(data:font/ttf;base64,${font("IBMPlexMono-Medium.ttf")});font-weight:500}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1200px;height:1500px;font-family:Grotesk,sans-serif;font-weight:500;overflow:hidden}
.p{position:relative;width:1200px;height:1500px;overflow:hidden}
.bg{position:absolute;inset:0;background-size:cover}
.lockup{height:54px;width:auto;display:block}
.top{position:absolute;left:72px;right:72px;top:64px;display:flex;justify-content:space-between;align-items:center;z-index:5}
.mono{font-family:Plex,monospace;font-size:21px;letter-spacing:.06em;text-transform:uppercase}
.h{font-family:Unbounded;font-weight:800;letter-spacing:-.03em;line-height:.98;text-transform:uppercase;position:absolute;z-index:4}
.phone{position:absolute;z-index:3;width:470px;border-radius:64px;background:#000;padding:13px;border:3px solid #2E3A34;box-shadow:0 40px 80px rgba(0,0,0,.55)}
.phone .scr{border-radius:52px;overflow:hidden;position:relative;background:#07090B}
.phone img{width:100%;display:block}
.phone .scr{padding-top:50px}
.phone .isl{position:absolute;top:11px;left:50%;margin-left:-56px;width:112px;height:30px;border-radius:999px;background:#000;z-index:2}
.phone .st{position:absolute;top:13px;left:34px;right:34px;display:flex;justify-content:space-between;font-size:19px;font-weight:700;color:#F2F4EC;z-index:2}
.foot{position:absolute;left:72px;right:72px;bottom:56px;display:flex;justify-content:space-between;align-items:flex-end;font-size:21px;z-index:5}
.url{font-family:Unbounded;font-weight:800;font-size:28px}
.tagline{position:absolute;z-index:4;font-size:30px;font-weight:700;line-height:1.3}
`;
const phone = (screen, style, shift = 0) => `<div class="phone" style="${style}"><div class="scr"><div class="isl"></div><div class="st"><span>9:41</span><span style="letter-spacing:.08em;font-size:15px">5G ▮▮▮</span></div><img src="${img(screen)}" style="margin-top:${shift}px"></div></div>`;

/* 6. Ink: boot, ball and shadow. Tonight's match on the phone. */
const p6 = `<style>${base}
.p{background:#07090B;color:#F2F4EC}
.bg{background-image:url(${img("photo-px-3886235.jpg")});background-position:14% 0;height:1120px;bottom:auto;filter:saturate(.7) contrast(1.15) brightness(.78)}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,9,11,.5) 0%,rgba(7,9,11,0) 16%,rgba(7,9,11,0) 44%,rgba(7,9,11,.92) 68%,#07090B 75%)}
.bar{position:absolute;left:0;top:176px;background:#D4FF3A;color:#07090B;padding:10px 26px 10px 72px;z-index:4}
.h{left:72px;bottom:250px;font-size:80px}.h em{font-style:normal;color:#D4FF3A}
.tagline{left:72px;bottom:150px;width:540px;font-size:27px;color:#C9CFC6;font-weight:500}
.foot{color:#97A39C}.url{color:#F2F4EC}
</style><div class="p"><div class="bg"></div><div class="shade"></div>
<div class="top">${lockup("lockup.svg")}<div class="mono" style="color:#F2F4EC">Matchday</div></div>
<div class="bar mono">England v Croatia · Tonight 20:45 WAT</div>
${phone("screen-match.png", "right:56px;top:420px;transform:rotate(5deg)")}
<div class="h">Know the<br>chance<br><em>before<br>kick-off.</em></div>
<div class="tagline">Every match read by a model. Home, draw, away, and the pick it rates highest.</div>
<div class="foot"><div>A model's chance, not a certainty.<br>18+ · Play responsibly</div><div class="url">kiqstat.app</div></div>
</div>`;

/* 7. Volt duotone: the tackle. Today's picks on the phone. */
const p7 = `<style>${base}
.p{background:#D4FF3A;color:#07090B}
.bg{background-image:url(${img("photo-1553778263-73a83bab9b0c.jpg")});background-size:150%;background-position:8% 72%;filter:grayscale(1) contrast(1.5) brightness(1.05);mix-blend-mode:multiply;height:900px;bottom:auto}
.fade{position:absolute;left:0;right:0;top:640px;height:262px;background:linear-gradient(180deg,rgba(212,255,58,0),#D4FF3A)}
.h{left:72px;top:800px;font-size:104px}
.tagline{left:72px;top:1140px;width:520px}
.chip{position:absolute;left:72px;top:1280px;z-index:4;background:#07090B;color:#D4FF3A;border-radius:999px;padding:14px 30px;font-size:26px;font-weight:700}
.foot{color:#07090B}
.top .mono{background:#07090B;color:#D4FF3A;padding:8px 16px;border-radius:8px}
</style><div class="p"><div class="bg"></div><div class="fade"></div>
<div class="top">${lockup("lockup.svg")}<div class="mono">17 games today</div></div>
${phone("screen-picks.png", "right:64px;top:500px;transform:rotate(-4deg)")}
<div class="h">Don't<br>guess.<br>Check.</div>
<div class="tagline">The model's pick and its chance on every game, free in 27 competitions.</div>
<div class="chip">Start free</div>
<div class="foot"><div>A model's chance, not a certainty.<br>18+ · Play responsibly</div></div>
<div class="url" style="position:absolute;right:72px;bottom:56px;z-index:5">kiqstat.app</div>
</div>`;

/* 8. Night pitch: the record. Track page on the phone. */
const p8 = `<style>${base}
.p{background:#07090B;color:#F2F4EC}
.bg{background-image:url(${img("photo-1431324155629-1a6deb1dec8d.jpg")});background-position:50% 20%;filter:saturate(.75) contrast(1.1)}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,9,11,.35) 0%,rgba(7,9,11,.1) 30%,rgba(7,9,11,.9) 74%,#07090B 100%)}
.h{left:72px;top:210px;font-size:88px}.h em{font-style:normal;color:#D4FF3A}
.stat{position:absolute;left:72px;bottom:240px;z-index:4}
.stat b{display:block;font-family:Unbounded;font-size:104px;letter-spacing:-.04em;line-height:1;color:#D4FF3A}
.stat span{display:block;margin-top:12px;font-size:26px;line-height:1.3;width:470px;color:#C9CFC6}
.foot{color:#97A39C}.url{color:#F2F4EC}
</style><div class="p"><div class="bg"></div><div class="shade"></div>
<div class="top">${lockup("lockup.svg")}<div class="mono">Public record</div></div>
<div class="h">Every pick<br>graded.<br><em>Even the<br>bad ones.</em></div>
${phone("screen-track.png", "right:44px;top:800px;width:580px;transform:rotate(4deg)")}
<div class="stat"><b>70.4%</b><span>of 999 graded picks landed.<br>703 won, 296 lost. All on the Track page.</span></div>
<div class="foot"><div><div class="url" style="margin-bottom:18px">kiqstat.app</div>Past results don't promise future ones.<br>18+ · Play responsibly</div></div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
for (const [name, html] of [["06-matchday", p6], ["07-dont-guess", p7], ["08-public-record", p8]]) {
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(here, `${name}.jpg`), type: "jpeg", quality: 92 });
  console.log("wrote", name);
}
await browser.close();
