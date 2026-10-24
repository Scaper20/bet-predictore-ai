#!/usr/bin/env python3
"""KiqStat Code Hub ad (1080x1080, 45 s, 60 fps): the reference film for the video kit.
Builds compositions/ and index.html here with video/kit (see video/DESIGN.md for the style).
Run: python3 video/examples/code-hub-ad/build.py, then `npx hyperframes check` in this folder.
Music: HeyGen catalog 2b7f3438 at assets/bgm/afro-pop-120.mp3 (see video/README.md, Sound)."""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "../../kit"))
import kiqstat_video as kq  # noqa: E402
from kiqstat_video import CURSOR, HELPERS, TAB, letters, scene, tabs, title  # noqa: E402,F401

kq.prepare(ROOT, "code-hub-ad")


def write(name, text):
    kq.write(ROOT, name, text)


# ---------------------------------------------------------------- S01 hook-cut
S01_ROWS = [
    ("Over 1.5 Goals", "Arsenal v Fulham", "1.28"),
    ("Chelsea or Draw", "Chelsea v Spurs", "1.33"),
    ("Both teams to score", "Liverpool v Brentford", "1.72"),
    ("Inter or Draw", "Inter v Lazio", "1.30"),
    ("Over 3.5 Goals", "Napoli v Torino", "2.85"),
]
rows = "\n".join(
    f"""          <div class="row" id="s01-r{i}"><span class="dot" id="s01-d{i}"></span>
            <div class="lab"><div class="pk" id="s01-p{i}">{p}<span class="strike" id="s01-x{i}"></span></div><div class="fx">{f}</div></div>
            <div class="pr mono">{o}</div></div>""" for i, (p, f, o) in enumerate(S01_ROWS))
# S01-S03 share one card frame at the same box; only its content scrolls across the seams
HOOK_CARD = "left: 72px; right: 72px; top: 348px; height: 672px; overflow: hidden;"
write("s01-hook-cut.html", scene("s01", 2.5, f"""
    #root {{ background: var(--ink-g); }}
    #s01-title {{ top: 96px; }}
    #s01-title .acc {{ color: var(--rose); }}
    #s01-slip {{ {HOOK_CARD} padding: 30px 40px; }}
    #s01-slip .hd {{ display: flex; justify-content: space-between; align-items: center; padding-bottom: 22px; border-bottom: 2px solid var(--line); }}
    #s01-slip .hd .k {{ font-size: 30px; font-weight: 700; color: var(--chalk); }}
    #s01-slip .hd .o {{ font-size: 30px; color: var(--muted); }}
    #s01-slip .hd .o b {{ color: var(--chalk); font-family: "IBM Plex Mono", monospace; font-weight: 500; }}
    #s01-missed {{ margin-left: 14px; }}
    #s01-slip .row {{ display: flex; align-items: center; gap: 26px; height: 108px; border-bottom: 2px solid var(--line); }}
    #s01-slip .row:last-child {{ border-bottom: 0; }}
    #s01-slip .dot {{ width: 24px; height: 24px; border-radius: 50%; background: var(--line2); flex: none; }}
    #s01-slip .lab {{ flex: 1; min-width: 0; }}
    #s01-slip .pk {{ position: relative; display: inline-block; font-size: 34px; font-weight: 700; color: var(--chalk); }}
    #s01-slip .strike {{ position: absolute; left: -4px; right: -4px; top: 52%; height: 4px; background: var(--rose); transform-origin: left center; transform: scaleX(0); }}
    #s01-slip .fx {{ font-size: 26px; color: var(--muted); margin-top: 4px; }}
    #s01-slip .pr {{ font-size: 32px; color: var(--muted); }}
""", f"""    <h1 class="t" id="s01-title">{title("One game cut / your code again?", accent="cut")}</h1>
    <div class="card" id="s01-slip">
      <div id="s01-in">
        <div class="hd"><span class="k">Your code · 5 games<span class="badge b-risky" id="s01-missed">Missed</span></span><span class="o">Odds <b>10.85</b></span></div>
{rows}
      </div>
    </div>""", HELPERS + """
    // frame 0 is the thumbnail: title and slip already on screen
    tl.fromTo("#s01-missed", { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0);
    [0.25, 0.5, 0.75, 1.0].forEach((t, i) =>
      tl.fromTo("#s01-d" + i, { backgroundColor: "#2e3a34", scale: 0.5 }, { backgroundColor: "#d4ff3a", scale: 1, duration: 0.36, ease: "power4.out" }, t));
    tl.fromTo("#s01-d4", { backgroundColor: "#2e3a34", scale: 0.5 }, { backgroundColor: "#ff4d6d", scale: 1.25, duration: 0.14, ease: "power4.out" }, 1.5)
      .to("#s01-d4", { scale: 1, duration: 0.3, ease: "power3.out" }, 1.64)
      .fromTo("#s01-x4", { scaleX: 0 }, { scaleX: 1, duration: 0.34, ease: "power4.out" }, 1.52)
      .fromTo("#s01-p4", { color: "#f2f4ec" }, { color: "#ff4d6d", duration: 0.16 }, 1.52)
      .fromTo("#s01-slip", { x: 0 }, { x: -8, duration: 0.04, ease: "power1.out" }, 1.5)
      .to("#s01-slip", { x: 5, duration: 0.05, ease: "power1.inOut" }, 1.54)
      .to("#s01-slip", { x: 0, duration: 0.1, ease: "power2.out" }, 1.59);
    tl.set("#s01-missed", { opacity: 1 }, 1.62);
    wipe("#s01-missed", 1.62);
    // hand-off: the title leaves upward and the slip scrolls out of the card, which stays
    leave("#s01-title", 2.17);
    tl.to("#s01-in", { y: -300, opacity: 0, duration: 0.33, ease: "power3.in" }, 2.17);
"""))

# -------------------------------------------------------------- S02 hook-risky
rows2 = "\n".join(
    f"""          <div class="row" id="s02-r{i}"><div class="lab"><div class="pk">{p}</div><div class="fx">{f}</div></div>
            <span class="badge b-amber q" id="s02-q{i}">?</span></div>""" for i, (p, f) in enumerate([
        ("Over 1.5 Goals", "Man City v Wolves"),
        ("Chelsea or Draw", "Chelsea v Leeds"),
        ("Over 1.5 Goals", "Barcelona v Celta"),
        ("Over 3.5 Goals", "Juventus v Genoa"),
        ("Both teams to score", "Brighton v Fulham"),
    ]))
write("s02-hook-risky.html", scene("s02", 2.0, f"""
    #root {{ background: var(--ink-g); }}
    #s02-title {{ top: 96px; }}
    #s02-title .acc {{ color: var(--volt); }}
    #s02-list {{ {HOOK_CARD} padding: 14px 40px; }}
    #s02-in {{ position: relative; }}
    #s02-list .row {{ position: relative; display: flex; align-items: center; gap: 24px; height: 128px; border-bottom: 2px solid var(--line); }}
    #s02-list .row:last-child {{ border-bottom: 0; }}
    #s02-list .lab {{ flex: 1; }}
    #s02-list .pk {{ font-size: 34px; font-weight: 700; color: var(--chalk); }}
    #s02-list .fx {{ font-size: 26px; color: var(--muted); margin-top: 4px; }}
    #s02-list .q {{ font-size: 30px; padding: 4px 22px; }}
    #s02-scan {{ position: absolute; left: -22px; right: -22px; top: 8px; height: 112px; border-radius: 16px;
      background: rgba(242,244,236,.07); border: 2px solid rgba(242,244,236,.18); }}
""", f"""    <h1 class="t" id="s02-title">{title("Not sure which / pick is risky?", accent="risky")}</h1>
    <div class="card" id="s02-list">
      <div id="s02-in">
        <div id="s02-scan"></div>
{rows2}
      </div>
    </div>""", HELPERS + """
    rise("#s02-title", 0.02);
    // the picks scroll up into the same card the slip just left
    tl.fromTo("#s02-list .row", { y: 260, opacity: 0 }, { y: 0, opacity: 1, duration: 0.62, ease: "power4.out", stagger: 0.045 }, 0);
    tl.fromTo("#s02-scan", { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out" }, 0.3);
    // the scanner hunts down the list and finds nothing for sure
    const ys = [0, 128, 256, 384, 512];
    [0.42, 0.66, 0.9, 1.14].forEach((t, i) => tl.to("#s02-scan", { y: ys[i + 1], duration: 0.22, ease: "power3.inOut" }, t));
    tl.to("#s02-scan", { y: 128, duration: 0.3, ease: "power3.inOut" }, 1.36);
    [0, 1, 2, 3, 4].forEach((i) =>
      tl.fromTo("#s02-q" + i, { scale: 1 }, { scale: 1.15, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.inOut" }, 0.4 + i * 0.24));
    leave("#s02-title", 1.66);
    tl.to("#s02-in", { y: -300, opacity: 0, duration: 0.33, ease: "power3.in" }, 1.67);
"""))

# -------------------------------------------------------------- S03 hook-blind
write("s03-hook-blind.html", scene("s03", 2.3, f"""
    #root {{ background: var(--ink-g); }}
    #s03-title {{ top: 96px; }}
    #s03-title .acc {{ color: var(--volt); }}
    #s03-chat {{ {HOOK_CARD} padding: 0; }}
    #s03-chat .hd {{ display: flex; align-items: center; gap: 20px; padding: 26px 36px; border-bottom: 2px solid var(--line); }}
    #s03-chat .av {{ width: 64px; height: 64px; border-radius: 50%; background: var(--surf2); border: 2px solid var(--line2);
      display: grid; place-items: center; font-size: 28px; font-weight: 700; color: var(--muted); }}
    #s03-chat .gn {{ font-size: 32px; font-weight: 700; color: var(--chalk); }}
    #s03-chat .gm {{ font-size: 26px; color: var(--muted); }}
    #s03-chat .msgs {{ padding: 30px 36px; display: flex; flex-direction: column; gap: 22px; }}
    #s03-chat .bub {{ align-self: flex-start; max-width: 82%; background: var(--surf2); border: 2px solid var(--line);
      border-radius: 8px 28px 28px 28px; padding: 16px 26px; transform-origin: 0% 0%; }}
    #s03-chat .who {{ font-size: 26px; font-weight: 700; color: var(--amber); }}
    #s03-chat .msg {{ font-size: 32px; color: var(--chalk); margin-top: 4px; }}
    #s03-chat .msg .mono {{ color: var(--chalk); background: rgba(242,244,236,.08); border-radius: 8px; padding: 2px 10px; letter-spacing: 0.12em; }}
    #s03-flood {{ position: absolute; inset: 0; background: var(--volt); clip-path: circle(0px at 330px 930px); z-index: 20; }}
""", f"""    <h1 class="t" id="s03-title">{title("Copying codes from / strangers, blind?", accent="blind")}</h1>
    <div class="card" id="s03-chat">
      <div class="hd" id="s03-hd"><div class="av">FC</div><div><div class="gn">Football Codes</div><div class="gm">2,481 members</div></div></div>
      <div class="msgs">
        <div class="bub" id="s03-b0"><div class="who">Tobi</div><div class="msg">Today's banker <span class="mono">7XK2QP</span></div></div>
        <div class="bub" id="s03-b1"><div class="who">Kola</div><div class="msg">Try mine <span class="mono">Q4RW8B</span></div></div>
        <div class="bub" id="s03-b2"><div class="who">Sade</div><div class="msg">50 odds, trust me <span class="mono">9TLM2C</span></div></div>
      </div>
    </div>
    <div id="s03-flood"></div>""", HELPERS + """
    rise("#s03-title", 0.02);
    tl.fromTo("#s03-hd", { y: 200, opacity: 0 }, { y: 0, opacity: 1, duration: 0.62, ease: "power4.out" }, 0);
    [0.22, 0.47, 0.72].forEach((t, i) =>
      tl.fromTo("#s03-b" + i, { opacity: 0, y: 46, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power4.out" }, t));
    // the last bubble floods the frame volt
    tl.fromTo("#s03-flood", { clipPath: "circle(0px at 330px 930px)" }, { clipPath: "circle(1500px at 330px 930px)", duration: 0.35, ease: "power2.inOut" }, 1.95);
"""))

# ----------------------------------------------------------------- S04 reveal
# big tab geometry on the volt ground, measured: x 96 / 421 / 701, widths 309 / 264 / 259, height 85
write("s04-reveal.html", scene("s04", 4.2, """
    #root { background: var(--volt); }
    #s04-a { top: 330px; font-size: 88px; color: var(--ink-g); }
    #s04-name { position: absolute; left: 96px; top: 250px; font-family: "Unbounded", sans-serif; font-weight: 800;
      font-size: 172px; line-height: 0.98; letter-spacing: -0.04em; color: var(--ink-g); }
    #s04-by { position: absolute; left: 100px; top: 610px; font-size: 40px; font-weight: 700; color: var(--ink-g); }
    #s04-tabs { position: absolute; left: 96px; top: 760px; display: flex; gap: 16px; }
    #s04-tabs .tab { font-size: 34px; padding: 18px 32px; border: 3px solid var(--ink-g); color: var(--ink-g); background: var(--volt); }
    #s04-tabs .tab.on { background: var(--ink-g); border-color: var(--ink-g); color: var(--volt); z-index: 3; }
    #s04-t1 { z-index: 2; }
    #s04-zoom { position: absolute; left: 96px; top: 760px; width: 309px; height: 85px; border-radius: 999px; background: var(--ink-g); z-index: 30; }
""", f"""    <h1 class="t" id="s04-a">{title("There's a / smarter way")}</h1>
    <div id="s04-name"><span class="ln"><span class="li">{letters("Code")}</span></span><span class="ln"><span class="li">{letters("Hub")}</span></span></div>
    <div id="s04-by"><span class="ln"><span class="li">by KiqStat</span></span></div>
    <div id="s04-tabs" data-motion-blur="off">
      <div class="tab on" id="s04-t0">Today's codes</div>
      <div class="tab" id="s04-t1">Code editor</div>
      <div class="tab" id="s04-t2">Community</div>
    </div>
    <div id="s04-zoom"></div>
    {CURSOR.format(id="s04-cur")}""", HELPERS + """
    rise("#s04-a", 0.08, 0.1, 0.7);
    leave("#s04-a", 1.42);
    // the name rises letter by letter, like the reference's hero numerals
    riseEach("#s04-name .lt", 1.62, 0.04, 0.7);
    rise("#s04-by", 2.0);
    // the tab row unfolds: the active pill lands, the other two slide out from behind it
    tl.fromTo("#s04-t0", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.55, ease: "power4.out" }, 2.3);
    tl.fromTo("#s04-t1", { x: -325, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: "power4.out" }, 2.42);
    tl.fromTo("#s04-t2", { x: -605, opacity: 0 }, { x: 0, opacity: 1, duration: 0.78, ease: "power4.out" }, 2.46);
    // the zoom plate sits exactly on the active pill and fills it on the click
    tl.fromTo("#s04-zoom", { opacity: 0, scale: 1 }, { opacity: 0, scale: 1, duration: 0.01 }, 0);
    cursorPath("#s04-cur", [[3.05, 1120, 1120], [3.62, 330, 818]]);
    click("#s04-cur", 3.7);
    press("#s04-t0", 3.7);
    tl.to("#s04-zoom", { opacity: 1, duration: 0.08, ease: "power1.out" }, 3.72);
    tl.to("#s04-zoom", { scale: 30, duration: 0.4, ease: "power3.in", transformOrigin: "50% 50%" }, 3.78);
    tl.to("#s04-cur", { opacity: 0, duration: 0.12 }, 3.82);
"""))

# ----------------------------------------------------------------- S05 todays
LEGS = [
    ("Arsenal or Draw", "Arsenal v Everton", "1.28"),
    ("Over 1.5 Goals", "Real Madrid v Getafe", "1.22"),
    ("Both teams to score", "Brighton v Villa", "1.95"),
    ("Over 2.5 Goals", "PSV v Ajax", "1.68"),
]
legs = "\n".join(
    f"""          <li class="leg" id="s05-l{i}"><span class="dot"></span><div class="lab"><div class="pk">{p}</div><div class="fx">{f} · 18:00</div></div><span class="pr mono">{o}</span></li>"""
    for i, (p, f, o) in enumerate(LEGS))
write("s05-todays.html", scene("s05", 7.5, """
    #root { background: var(--ink-g); }
    #s05-cam { position: absolute; inset: 0; }
    #s05-t1 { top: 140px; } #s05-t2 { top: 140px; }
    #s05-t1 .acc, #s05-t2 .acc { color: var(--volt); }
    #s05-card { left: 72px; right: 72px; top: 332px; height: 704px; overflow: hidden; }
    #s05-card .hd { display: flex; justify-content: space-between; align-items: flex-start; padding: 24px 36px 20px; border-bottom: 2px solid var(--line); }
    #s05-card .tier { font-size: 26px; letter-spacing: 0.18em; color: var(--volt); }
    #s05-card .blurb { font-size: 28px; color: var(--muted); margin-top: 8px; }
    #s05-card .odds { font-family: "Unbounded", sans-serif; font-weight: 800; font-size: 80px; line-height: 1; color: var(--chalk); text-align: right; letter-spacing: -0.02em; }
    #s05-card .ol { font-size: 24px; color: var(--muted); letter-spacing: 0.1em; text-align: right; margin-top: 6px; }
    #s05-card .meta { padding: 16px 36px 0; font-size: 28px; color: var(--muted); }
    #s05-card .meta b { color: var(--chalk); }
    #s05-card ul { list-style: none; padding: 8px 36px 0; margin: 0; }
    #s05-card .leg { display: flex; align-items: center; gap: 22px; height: 76px; }
    #s05-card .dot { width: 18px; height: 18px; border-radius: 50%; background: var(--line2); flex: none; }
    #s05-card .lab { flex: 1; min-width: 0; }
    #s05-card .pk { font-size: 30px; font-weight: 700; color: var(--chalk); }
    #s05-card .fx { font-size: 25px; color: var(--muted); }
    #s05-card .pr { font-size: 30px; color: var(--muted); }
    #s05-box { position: absolute; left: 36px; right: 36px; bottom: 30px; height: 112px; border-radius: 18px; border: 2px solid rgba(212,255,58,.3);
      background: rgba(212,255,58,.08); display: flex; align-items: center; justify-content: space-between; padding: 0 28px; }
    #s05-box .bl { font-size: 24px; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
    #s05-box .bc { font-size: 44px; letter-spacing: 0.12em; color: var(--chalk); }
    #s05-copy { position: relative; overflow: hidden; background: var(--volt); color: var(--ink-g); font-weight: 700; font-size: 30px; border-radius: 14px; padding: 14px 30px; min-width: 150px; text-align: center; }
    #s05-copy span { display: block; }
    #s05-copy .c2 { position: absolute; inset: 0; display: grid; place-items: center; }
""", f"""    <div id="s05-cam">
      {tabs("s05", 0, TAB[0][0], TAB[0][1])}
      <h1 class="t" id="s05-t1">{title("Fresh codes / every morning", accent="morning")}</h1>
      <h1 class="t" id="s05-t2">{title("Built on the model's / strongest reads", accent="strongest")}</h1>
      <div class="card" id="s05-card">
        <div class="hd"><div><div class="tier mono">BALANCED 5</div><div class="blurb">The everyday combo</div></div>
          <div><div class="odds" id="s05-odds">5.12</div><div class="ol">ODDS</div></div></div>
        <div class="meta" id="s05-meta">4 games · model chance <b>24%</b> (1 in 4)</div>
        <ul>
{legs}
        </ul>
        <div id="s05-box"><div><div class="bl">BOOKING CODE</div><div class="bc mono">K7Q2MX</div></div>
          <div id="s05-copy"><span class="c1">Copy</span><span class="c2">Copied</span></div></div>
      </div>
    </div>
    {CURSOR.format(id="s05-cur")}""", HELPERS + f"""
    // arrive from the zoom-through: the card settles from slightly large, the tab row drops in
    tl.fromTo("#s05-card", {{ scale: 1.12, filter: "blur(12px)", opacity: 0 }}, {{ scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.7, ease: "expo.out" }}, 0);
    tl.fromTo("#s05-tabs", {{ y: -110, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.62, ease: "power4.out" }}, 0.12);
    rise("#s05-t1", 0.28);
    tl.fromTo("#s05-card .leg", {{ opacity: 0, y: 44 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power4.out", stagger: 0.07 }}, 0.45);
    tl.fromTo("#s05-box", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power4.out" }}, 0.8);
    tl.fromTo("#s05-copy .c2", {{ yPercent: 130, autoAlpha: 0 }}, {{ yPercent: 130, autoAlpha: 0, duration: 0.01 }}, 0);
    // count the odds up as the card lands
    const o = {{ v: 1 }};
    tl.fromTo(o, {{ v: 1 }}, {{ v: 5.12, duration: 1.2, ease: "power2.out", onUpdate: () => {{ $("#s05-odds").textContent = o.v.toFixed(2); }} }}, 0.3);
    // push in on the price and the model chance; the tab row rides off the top with the camera
    leave("#s05-t1", 2.2);
    tl.to("#s05-cam", {{ scale: 1.16, x: 0, y: (540 - 640) * 1.16, duration: 0.8, ease: "power3.inOut" }}, 2.32);
    tl.to("#s05-cam", {{ scale: 1, x: 0, y: 0, duration: 0.7, ease: "power3.inOut" }}, 4.1);
    rise("#s05-t2", 4.55);
    cursorPath("#s05-cur", [[5.35, 1120, 1120], [5.95, 905, 958]]);
    click("#s05-cur", 6.0);
    press("#s05-copy", 6.0);
    tl.to("#s05-copy .c1", {{ yPercent: -130, duration: 0.3, ease: "power3.in" }}, 6.04).set("#s05-copy .c1", {{ autoAlpha: 0 }}, 6.34);
    tl.to("#s05-copy .c2", {{ yPercent: 0, autoAlpha: 1, duration: 0.45, ease: "power4.out" }}, 6.2);
    // on to the editor tab: the active pill slides across, the page pushes left
    tl.to("#s05-cur", {{ x: 470, y: 92, duration: 0.45, ease: "power3.inOut" }}, 6.55);
    click("#s05-cur", 7.02);
    leave("#s05-t2", 7.0);
    tl.to("#s05-hl", {{ x: {TAB[1][0] - TAB[0][0]}, width: {TAB[1][1]}, duration: 0.42, ease: "power3.inOut" }}, 7.04);
    tl.to("#s05-tab0", {{ color: "#97a39c", borderColor: "#1e2723", duration: 0.3, ease: "power2.inOut" }}, 7.1);
    tl.to("#s05-tab1", {{ color: "#07090b", borderColor: "rgba(30,39,35,0)", duration: 0.3, ease: "power2.inOut" }}, 7.1);
    tl.to("#s05-card", {{ x: -760, opacity: 0, duration: 0.36, ease: "power3.in" }}, 7.14);
    tl.to("#s05-cur", {{ opacity: 0, duration: 0.2 }}, 7.24);
"""))

# ----------------------------------------------------------------- S06 editor
SCAN = [
    ("Over 1.5 Goals", "Man City v Wolves", "90%", "strong", "Strong"),
    ("Chelsea or Draw", "Chelsea v Leeds", "70%", "fair", "Fair"),
    ("Over 1.5 Goals", "Barcelona v Celta", "82%", "strong", "Strong"),
    ("Over 3.5 Goals", "Juventus v Genoa", "25%", "risky", "Risky"),
    ("Both teams to score", "Brighton v Fulham", "62%", "fair", "Fair"),
]
scan_rows = "\n".join(
    f"""          <li class="sr" id="s06-r{i}"><div class="lab"><div class="pk">{p}</div><div class="fx">{f}</div></div>
            <span class="pc mono">{pc}</span><span class="badge b-{v}" id="s06-b{i}">{vl}</span></li>""" for i, (p, f, pc, v, vl) in enumerate(SCAN))
SAFE = [
    ("Over 1.5 Goals", "Man City v Wolves", "90%", None),
    ("Chelsea or Draw", "Chelsea v Leeds", "70%", None),
    ("Over 1.5 Goals", "Barcelona v Celta", "82%", None),
    ("Juventus or Draw", "Juventus v Genoa", "74%", "was Over 3.5 Goals"),
    ("Both teams to score", "Brighton v Fulham", "62%", None),
]
safe_rows = "\n".join(
    f"""          <li class="sr{' ch' if was else ''}" id="s06-s{i}"><div class="lab"><div class="pk">{p}</div><div class="fx{' was' if was else ''}">{was or f}</div></div><span class="pc mono">{pc}</span></li>"""
    for i, (p, f, pc, was) in enumerate(SAFE))
code = "".join(f'<span class="ch" id="s06-c{i}">{c}</span>' for i, c in enumerate("7XK2QP"))
write("s06-editor.html", scene("s06", 12.5, """
    #root { background: var(--ink-g); }
    #s06-ground { position: absolute; inset: 0; background: var(--l-ground); clip-path: circle(0px at 352px 364px); }
    #s06-cam { position: absolute; inset: 0; }
    #s06-t1, #s06-t2, #s06-t3 { top: 140px; }
    #s06-t1 .acc, #s06-t2 .acc, #s06-t3 .acc { color: var(--volt); }
    #s06-in { position: absolute; left: 72px; top: 316px; width: 560px; height: 96px; border-radius: 18px; border: 2px solid var(--line2);
      background: var(--surf2); display: flex; align-items: center; padding: 0 26px; }
    #s06-ph { position: absolute; left: 26px; font-size: 30px; color: var(--dim); }
    #s06-code { font-size: 46px; letter-spacing: 0.14em; color: var(--chalk); }
    #s06-code .ch { display: inline-block; }
    #s06-btn { position: absolute; left: 652px; top: 316px; width: 356px; height: 96px; border-radius: 18px; background: var(--volt);
      color: var(--ink-g); font-size: 34px; font-weight: 700; display: grid; place-items: center; }
    /* the community's post box, built where the safer card lands (identical to S07's) */
    #s06-post { position: absolute; left: 72px; top: 316px; width: 560px; height: 96px; border-radius: 18px; border: 2px solid var(--l-line);
      background: #fff; display: flex; align-items: center; padding: 0 26px; font-size: 46px; letter-spacing: 0.14em; color: var(--ink-g); opacity: 0; }
    .s06c { left: 72px; right: 72px; top: 440px; height: 600px; padding: 22px 34px; }
    #s06-scan { overflow: hidden; }
    #s06-scan .hd, #s06-safe .hd { display: flex; justify-content: space-between; align-items: baseline; }
    #s06-scan .cd { font-size: 36px; letter-spacing: 0.12em; color: var(--chalk); }
    #s06-scan .rd, #s06-safe .rd { font-size: 26px; color: var(--muted); }
    .s06c .tot { display: flex; gap: 70px; margin: 12px 0 8px; }
    .s06c .tl { font-size: 24px; letter-spacing: 0.12em; color: var(--muted); font-weight: 700; }
    .s06c .tv { font-family: "Unbounded", sans-serif; font-weight: 800; font-size: 46px; color: var(--chalk); margin-top: 2px; }
    .s06c ul { list-style: none; margin: 0; padding: 0; }
    .s06c .sr { display: flex; align-items: center; gap: 18px; height: 82px; border-top: 2px solid var(--line); margin: 0 -34px; padding: 0 34px; }
    .s06c .lab { flex: 1; min-width: 0; }
    .s06c .pk { font-size: 30px; font-weight: 700; color: var(--chalk); }
    .s06c .fx { font-size: 25px; color: var(--muted); }
    .s06c .fx.was { color: var(--amber); font-weight: 700; }
    .s06c .pc { font-size: 28px; color: var(--muted); min-width: 70px; text-align: right; }
    .s06c .badge { min-width: 112px; justify-content: center; }
    #s06-safe { background: linear-gradient(180deg, #151d12 0%, #0f150d 100%); border-color: rgba(212,255,58,.35); }
    #s06-safe .ttl { font-size: 32px; font-weight: 700; color: var(--chalk); }
    #s06-safe .sr { height: 66px; }
    #s06-safe .sr.ch { background: rgba(212,255,58,.08); margin: 0 -34px; padding: 0 34px; }
    #s06-safe .sr.ch .pk { color: var(--volt); }
    #s06-new { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 12px; border-top: 2px solid var(--line); }
    #s06-new .nl { font-size: 26px; color: var(--muted); }
    #s06-new .nl b { color: var(--chalk); font-family: "IBM Plex Mono", monospace; font-weight: 500; letter-spacing: 0.12em; font-size: 34px; margin-left: 8px; }
    #s06-new .nb { background: var(--volt); color: var(--ink-g); font-weight: 700; font-size: 28px; border-radius: 14px; padding: 12px 26px; }
""", f"""    <div id="s06-ground"></div>
    <div id="s06-cam">
      {tabs("s06", 1, TAB[1][0], TAB[1][1])}
      <h1 class="t" id="s06-t1">{title("Paste any code", accent="any")}</h1>
      <h1 class="t" id="s06-t2">{title("See every pick's read", accent="every")}</h1>
      <h1 class="t" id="s06-t3">{title("Make it safer / in one tap", accent="safer")}</h1>
      <div id="s06-in"><span id="s06-ph">Booking code, e.g. 5CKNWH</span><span id="s06-code" class="mono">{code}</span></div>
      <div id="s06-btn">Make it safer</div>
      <div id="s06-post" class="mono">M3ZT8P</div>
      <div class="card s06c" id="s06-scan">
        <div class="hd" id="s06-scan-hd"><span class="cd mono">7XK2QP</span><span class="rd">5 of 5 games read</span></div>
        <div class="tot" id="s06-scan-tot"><div><div class="tl">AS IT IS: CHANCE</div><div class="tv">8%</div></div><div><div class="tl">ODDS</div><div class="tv">11.40</div></div></div>
        <ul>
{scan_rows}
        </ul>
      </div>
      <div class="card s06c" id="s06-safe">
        <div class="hd"><span class="ttl">Safer version</span><span class="rd">1 changed</span></div>
        <div class="tot"><div><div class="tl">EDITED: CHANCE</div><div class="tv" id="s06-chance">8%</div></div><div><div class="tl">FAIR ODDS</div><div class="tv">4.22</div></div></div>
        <ul>
{safe_rows}
        </ul>
        <div id="s06-new"><span class="nl">New code<b>M3ZT8P</b></span><span class="nb">Copy</span></div>
      </div>
    </div>
    {CURSOR.format(id="s06-cur")}""", HELPERS + f"""
    // the editor page pushes in from the right under the same tab row
    tl.fromTo(["#s06-in", "#s06-btn"], {{ x: 760, opacity: 0 }}, {{ x: 0, opacity: 1, duration: 0.62, ease: "power4.out", stagger: 0.04 }}, 0);
    rise("#s06-t1", 0.06);
    // typing the code from the chat
    tl.fromTo("#s06-code .ch", {{ opacity: 0, y: 12 }}, {{ opacity: 0, y: 12, duration: 0.01 }}, 0);
    tl.to("#s06-ph", {{ opacity: 0, duration: 0.12 }}, 0.45);
    for (let i = 0; i < 6; i++) tl.to("#s06-c" + i, {{ opacity: 1, y: 0, duration: 0.14, ease: "power3.out" }}, 0.55 + i * 0.13);
    cursorPath("#s06-cur", [[1.35, 1120, 700], [1.95, 860, 372]]);
    click("#s06-cur", 2.0);
    press("#s06-btn", 2.0);
    tl.to("#s06-cur", {{ x: 1120, y: 1000, duration: 0.5, ease: "power3.in" }}, 2.3);
    tl.to("#s06-cur", {{ opacity: 0, duration: 0.01 }}, 2.85);
    // the read unfolds down from under the input
    tl.fromTo("#s06-scan", {{ clipPath: "inset(0% 0% 100% 0% round 24px)", y: -20 }}, {{ clipPath: "inset(0% 0% 0% 0% round 24px)", y: 0, duration: 0.75, ease: "power4.out" }}, 2.2);
    tl.fromTo(["#s06-scan-hd", "#s06-scan-tot"], {{ opacity: 0, y: 30 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power4.out", stagger: 0.06 }}, 2.28);
    tl.fromTo("#s06-scan .sr", {{ opacity: 0, y: 36 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power4.out", stagger: 0.06 }}, 2.4);
    leave("#s06-t1", 2.3);
    rise("#s06-t2", 2.55);
    for (let i = 0; i < 5; i++) wipe("#s06-b" + i, 3.2 + i * 0.22);
    // push in on the risky pick
    tl.to("#s06-cam", {{ scale: 1.12, x: 0, y: (540 - 760) * 1.12, duration: 0.8, ease: "power3.inOut" }}, 5.15);
    tl.to(["#s06-r0", "#s06-r1", "#s06-r2", "#s06-r4"], {{ opacity: 0.3, duration: 0.45, ease: "power2.inOut" }}, 5.25);
    tl.fromTo("#s06-r3", {{ backgroundColor: "rgba(255,77,109,0)", boxShadow: "inset 0 0 0 2px rgba(255,77,109,0)" }},
      {{ backgroundColor: "rgba(255,77,109,0.10)", boxShadow: "inset 0 0 0 3px rgba(255,77,109,0.7)", duration: 0.45, ease: "power2.inOut" }}, 5.3);
    tl.to("#s06-cam", {{ scale: 1, x: 0, y: 0, duration: 0.7, ease: "power3.inOut" }}, 6.9);
    leave("#s06-t2", 7.0);
    rise("#s06-t3", 7.25);
    // the safer version slides up over the read like a sheet; the read sinks behind it
    tl.fromTo("#s06-safe", {{ y: 660 }}, {{ y: 0, duration: 0.75, ease: "power4.out" }}, 7.85);
    tl.to("#s06-scan", {{ scale: 0.95, opacity: 0, duration: 0.6, ease: "power2.out" }}, 7.95);
    const c = {{ v: 8 }};
    tl.fromTo(c, {{ v: 8 }}, {{ v: 24, duration: 1.3, ease: "power2.out", onUpdate: () => {{ $("#s06-chance").textContent = Math.round(c.v) + "%"; }} }}, 8.3);
    tl.fromTo("#s06-s3", {{ backgroundColor: "rgba(212,255,58,0.08)" }}, {{ backgroundColor: "rgba(212,255,58,0.18)", duration: 0.4, yoyo: true, repeat: 1, ease: "power2.inOut" }}, 8.4);
    // carry the safer code across: it shrinks into the community's post box while the world turns chalk
    leave("#s06-t3", 11.3);
    tl.to(["#s06-in", "#s06-btn"], {{ opacity: 0, duration: 0.25, ease: "power2.in" }}, 11.4);
    tl.to("#s06-safe", {{ scale: 0.3, x: -188, y: -376, duration: 0.6, ease: "power3.inOut" }}, 11.5);
    tl.to("#s06-safe", {{ opacity: 0, duration: 0.25, ease: "power2.in" }}, 12.0);
    tl.to("#s06-post", {{ opacity: 1, duration: 0.25, ease: "power2.out" }}, 12.17);
    // the light world floods out from where the code lands
    tl.fromTo("#s06-ground", {{ clipPath: "circle(0px at 352px 364px)" }}, {{ clipPath: "circle(1250px at 352px 364px)", duration: 0.48, ease: "power2.inOut" }}, 11.98);
    // the tab row stays: it takes the light theme and its pill slides to Community
    tl.to("#s06-hl", {{ x: {TAB[2][0] - TAB[1][0]}, width: {TAB[2][1]}, backgroundColor: "#4f6b00", duration: 0.45, ease: "power3.inOut" }}, 12.0);
    tl.to(["#s06-tab0", "#s06-tab1"], {{ backgroundColor: "#ffffff", borderColor: "#e1e4da", color: "#4c5650", duration: 0.4, ease: "power2.inOut" }}, 12.04);
    tl.to("#s06-tab2", {{ color: "#ffffff", borderColor: "rgba(225,228,218,0)", duration: 0.4, ease: "power2.inOut" }}, 12.04);
"""))

# -------------------------------------------------------------- S07 community
POSTS = [
    ("1", "M3ZT8P", "You · 0 landed, 0 missed", "Well priced", "b-strong", "5", "4.60", "24%", True),
    ("2", "H8NV3K", "Ada · 14 landed, 6 missed", "Fair price", "b-fair", "4", "5.20", "19%", False),
    ("3", "Q4RW8B", "Kola · 3 landed, 9 missed", "Short price", "b-risky", "5", "18.50", "3.1%", False),
]
posts = "\n".join(
    f"""        <li class="post{' me' if me else ''}" id="s07-p{i}"><div class="top"><span class="rk">{rk}</span>
          <div class="who"><div class="pc mono">{c}</div><div class="rec" id="s07-rec{i}">{rec}</div></div><span class="badge {bt}" id="s07-bd{i}">{bl}</span></div>
          <div class="st"><div><div class="sl">GAMES</div><div class="sv">{g}</div></div><div><div class="sl">ODDS</div><div class="sv">{od}</div></div><div><div class="sl">OUR CHANCE</div><div class="sv">{ch}</div></div></div></li>"""
    for i, (rk, c, rec, bl, bt, g, od, ch, me) in enumerate(POSTS))
write("s07-community.html", scene("s07", 7.5, """
    #root { background: var(--l-ground); }
    #s07-cam { position: absolute; inset: 0; }
    #root .t { color: var(--ink-g); }
    #s07-t1, #s07-t2 { top: 140px; }
    #s07-t1 .acc, #s07-t2 .acc { color: var(--olive); }
    #root .tab { border-color: var(--l-line); color: var(--l-muted); background: #fff; }
    #root .tab.on { background: transparent; border-color: transparent; color: #fff; }
    #root .tabs .hl { background: var(--olive); }
    #s07-in { position: absolute; left: 72px; top: 316px; width: 560px; height: 96px; border-radius: 18px; border: 2px solid var(--l-line);
      background: #fff; display: flex; align-items: center; padding: 0 26px; font-size: 46px; letter-spacing: 0.14em; color: var(--ink-g); }
    #s07-btn { position: absolute; left: 652px; top: 316px; width: 356px; height: 96px; border-radius: 18px; background: var(--olive);
      color: #fff; font-size: 34px; font-weight: 700; display: grid; place-items: center; }
    #s07-list { position: absolute; left: 72px; right: 72px; top: 440px; list-style: none; margin: 0; padding: 0; }
    #s07-list .post { position: absolute; left: 0; right: 0; height: 186px; border-radius: 22px; border: 2px solid var(--l-line); background: #fff;
      padding: 18px 28px; box-shadow: 0 24px 60px -24px rgba(7,9,11,.35); }
    #s07-list .post.me { border-color: rgba(79,107,0,.5); background: #f7f9ef; z-index: 2; }
    #s07-list .top { display: flex; align-items: center; gap: 22px; }
    #s07-list .rk { font-family: "Unbounded", sans-serif; font-weight: 800; font-size: 46px; color: var(--l-dim); width: 40px; }
    #s07-list .who { flex: 1; }
    #s07-list .pc { font-size: 34px; letter-spacing: 0.12em; color: var(--ink-g); }
    #s07-list .rec { display: inline-block; font-size: 28px; color: var(--l-muted); border-radius: 8px; padding: 0 6px; margin-left: -6px; }
    #s07-list .b-strong { color: var(--olive); background: rgba(79,107,0,.1); border-color: rgba(79,107,0,.3); }
    #s07-list .b-fair { color: var(--l-muted); background: #eef0e8; border-color: var(--l-line); }
    #s07-list .b-risky { color: #c8233f; background: rgba(200,35,63,.08); border-color: rgba(200,35,63,.3); }
    #s07-list .st { display: grid; grid-template-columns: repeat(3, 1fr); margin: 14px 0 0 62px; }
    #s07-list .sl { font-size: 22px; letter-spacing: 0.12em; color: var(--l-dim); font-weight: 700; }
    #s07-list .sv { font-size: 34px; font-weight: 700; color: var(--ink-g); }
    #s07-flood { position: absolute; inset: 0; background: var(--volt); clip-path: circle(0px at 830px 364px); z-index: 40; }
""", f"""    <div id="s07-cam">
      {tabs("s07", 2, TAB[2][0], TAB[2][1])}
      <h1 class="t" id="s07-t1">{title("Post it. / The model ranks it.", accent="ranks")}</h1>
      <h1 class="t" id="s07-t2">{title("Every poster's / record, counted", accent="record,")}</h1>
      <div id="s07-in" class="mono">M3ZT8P</div>
      <div id="s07-btn">Post my code</div>
      <ol id="s07-list">
{posts}
      </ol>
    </div>
    <div id="s07-flood"></div>
    {CURSOR.format(id="s07-cur")}""", HELPERS + """
    // frame 0 matches the end of S06: tab row and post box already in place
    tl.fromTo("#s07-btn", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.6, ease: "power4.out" }, 0.04);
    rise("#s07-t1", 0.12);
    cursorPath("#s07-cur", [[0.4, 1120, 900], [0.95, 860, 372]]);
    click("#s07-cur", 1.0);
    press("#s07-btn", 1.0);
    tl.to("#s07-cur", { x: 1120, y: 1060, duration: 0.5, ease: "power3.in" }, 1.3);
    tl.to("#s07-cur", { opacity: 0, duration: 0.01 }, 1.85);
    // the others rise into the list; ours lands at the bottom, then the model sorts it to the top
    tl.fromTo("#s07-bd0", { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0);
    tl.fromTo("#s07-p1", { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.62, ease: "power4.out" }, 1.1);
    tl.fromTo("#s07-p2", { y: 294, opacity: 0 }, { y: 204, opacity: 1, duration: 0.62, ease: "power4.out" }, 1.17);
    tl.fromTo("#s07-p0", { y: 498, opacity: 0 }, { y: 408, opacity: 1, duration: 0.62, ease: "power4.out" }, 1.24);
    tl.to("#s07-p0", { y: 0, duration: 0.7, ease: "power3.inOut" }, 1.95);
    tl.to("#s07-p1", { y: 204, duration: 0.7, ease: "power3.inOut" }, 2.0);
    tl.to("#s07-p2", { y: 408, duration: 0.7, ease: "power3.inOut" }, 2.05);
    tl.set("#s07-bd0", { opacity: 1 }, 2.52);
    wipe("#s07-bd0", 2.52);
    // records
    leave("#s07-t1", 4.0);
    rise("#s07-t2", 4.25);
    tl.to("#s07-list", { scale: 1.05, transformOrigin: "50% 75%", duration: 0.7, ease: "power3.inOut" }, 4.3);
    tl.fromTo(["#s07-rec1", "#s07-rec2"], { backgroundColor: "rgba(79,107,0,0)" }, { backgroundColor: "rgba(79,107,0,0.12)", duration: 0.35, ease: "power2.out", stagger: 0.12 }, 4.8);
    tl.to("#s07-list", { scale: 1, duration: 0.5, ease: "power3.inOut" }, 6.55);
    tl.fromTo("#s07-flood", { clipPath: "circle(0px at 830px 364px)" }, { clipPath: "circle(1500px at 830px 364px)", duration: 0.4, ease: "power2.inOut" }, 7.1);
"""))

# ----------------------------------------------------------------- S08 claim
write("s08-claim.html", kq.claim_scene("s08", 3.0, "Read every code / before you book it"))

# --------------------------------------------------------------- S09 endcard
write("s09-endcard.html", kq.endcard_scene("s09", 3.5, 'Code Hub · <span class="u">kiqstat.app</span>',
                                           "Check any code free", "18+ · Example codes for illustration"))

# ------------------------------------------------------------------ index.html
SCENES = [("s01", "s01-hook-cut", 0.0, 2.5), ("s02", "s02-hook-risky", 2.5, 2.0), ("s03", "s03-hook-blind", 4.5, 2.3),
          ("s04", "s04-reveal", 6.8, 4.2), ("s05", "s05-todays", 11.0, 7.5), ("s06", "s06-editor", 18.5, 12.5),
          ("s07", "s07-community", 31.0, 7.5), ("s08", "s08-claim", 38.5, 3.0), ("s09", "s09-endcard", 41.5, 3.5)]

# (id, file, picture time in film seconds, file peak seconds, volume)
SFX = [
    ("sx-dot1", "key-press", 0.25, 0.076, 0.55), ("sx-dot2", "key-press", 0.50, 0.076, 0.55),
    ("sx-dot3", "key-press", 0.75, 0.076, 0.55), ("sx-dot4", "key-press", 1.00, 0.076, 0.55),
    ("sx-cut", "thud-muffled", 1.50, 0.070, 1.0),
    ("sx-whip1", "whoosh-quick", 2.50, 0.215, 0.7), ("sx-whip2", "whoosh-airy", 4.50, 0.450, 0.65),
    ("sx-msg1", "pop-hollow", 4.80, 0.160, 0.7), ("sx-msg2", "pop", 5.05, 0.120, 0.6), ("sx-msg3", "pop-hollow", 5.30, 0.160, 0.7),
    ("sx-flood1", "whoosh-synth", 6.62, 0.345, 0.8),
    ("sx-slam", "boom-low", 8.50, 0.080, 0.9),
    ("sx-click1", "click-sharp", 10.50, 0.125, 0.9), ("sx-zoom", "whoosh", 10.95, 0.162, 0.8),
    ("sx-copy", "click", 17.00, 0.073, 0.9), ("sx-tab", "click-sharp", 18.02, 0.125, 0.8),
    ("sx-key1", "key-press", 19.05, 0.076, 0.45), ("sx-key2", "key-press", 19.18, 0.076, 0.45), ("sx-key3", "key-press", 19.31, 0.076, 0.45),
    ("sx-key4", "key-press", 19.44, 0.076, 0.45), ("sx-key5", "key-press", 19.57, 0.076, 0.45), ("sx-key6", "key-press", 19.70, 0.076, 0.45),
    ("sx-safer", "click", 20.50, 0.073, 0.9),
    ("sx-b1", "pop-hollow", 21.75, 0.160, 0.5), ("sx-b2", "pop", 21.97, 0.120, 0.45), ("sx-b3", "pop-hollow", 22.19, 0.160, 0.5),
    ("sx-b4", "pop", 22.41, 0.120, 0.6), ("sx-b5", "pop-hollow", 22.63, 0.160, 0.5),
    ("sx-risky", "thud-muffled", 23.75, 0.070, 0.7),
    ("sx-riser", "riser", 26.50, 3.472, 0.55),
    ("sx-carry", "whoosh-airy", 30.35, 0.450, 0.75),
    ("sx-post", "click-sharp", 32.00, 0.125, 0.9), ("sx-sort", "whoosh-quick", 33.20, 0.215, 0.7), ("sx-priced", "pop", 33.52, 0.120, 0.7),
    ("sx-flood2", "whoosh-synth", 38.30, 0.345, 0.8),
    ("sx-shrink", "whoosh", 41.25, 0.162, 0.7),
    ("sx-mark", "impact-bass", 42.00, 0.073, 0.42),
]
bgm = """      <audio id="bgm" class="clip" src="assets/bgm/afro-pop-120.mp3" data-start="0" data-duration="45" data-media-start="1.505" data-track-index="2" data-volume="0.8" data-fade-out="1.5"></audio>"""
if not os.path.exists(os.path.join(ROOT, "assets/bgm/afro-pop-120.mp3")):
    print("note: assets/bgm/afro-pop-120.mp3 is missing; fetch HeyGen catalog 2b7f3438 (video/README.md, Sound)")
kq.build_index(ROOT, SCENES, SFX, bgm, duration=45)
print("ok")
