#!/usr/bin/env python3
"""__NAME__: a KiqStat film started from the video kit's starter (video/new.py).

Five scenes in the house style (video/DESIGN.md): hook question over a product card -> volt reveal
with the product name -> the product doing its job -> claim -> performed end card. Edit COPY and the
scene blocks, then:  python3 build.py && npx hyperframes check && npx hyperframes render -q delivery --fps 60
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, "__KIT__")
import kiqstat_video as kq  # noqa: E402
from kiqstat_video import CURSOR, HELPERS, TAB, letters, scene, tabs, title  # noqa: E402

FORMAT = "__FORMAT__"          # square | portrait | landscape
W, H = kq.FORMATS[FORMAT]

# ------------------------------------------------------------------ copy
# One accent word per title (it must match a word in the line, without punctuation).
COPY = {
    "hook": ("One game cut / your code again?", "cut"),
    "turn": "There's a / smarter way",
    "name": ["Code", "Hub"],
    "by": "by KiqStat",
    "open": "Open Code Hub",
    "t1": ("Paste any code", "any"),
    "t2": ("See every pick's read", "every"),
    "button": "Make it safer",
    "claim": "Read every code / before you book it",
    "end_line": 'Code Hub · <span class="u">kiqstat.app</span>',
    "cta": "Check any code free",
    "foot": "18+ · Example codes for illustration",
}
HOOK_ROWS = [("Over 1.5 Goals", "Arsenal v Fulham", "1.28"), ("Chelsea or Draw", "Chelsea v Spurs", "1.33"),
             ("Inter or Draw", "Inter v Lazio", "1.30"), ("Over 3.5 Goals", "Napoli v Torino", "2.85")]
READ_ROWS = [("Over 1.5 Goals", "Man City v Wolves", "90%", "strong", "Strong"),
             ("Chelsea or Draw", "Chelsea v Leeds", "70%", "fair", "Fair"),
             ("Over 3.5 Goals", "Juventus v Genoa", "25%", "risky", "Risky"),
             ("Both teams to score", "Brighton v Fulham", "62%", "fair", "Fair")]

# ---------------------------------------------------------------- layout
# card = (left, right, top) in px; titles keep the kit's 96 px left margin
LAYOUT = {
    "square": dict(title_top=96, title_right=96, card=(72, 72, 348), p_title_top=140, p_card=(72, 72, 330)),
    "portrait": dict(title_top=200, title_right=96, card=(72, 72, 600), p_title_top=220, p_card=(72, 72, 480)),
    "landscape": dict(title_top=380, title_right=1000, card=(1000, 96, 150), p_title_top=380, p_card=(1000, 96, 150)),
}[FORMAT]
# portrait has height to spare: UI and type grow 30% so the product fills the frame on a phone
U = 1.3 if FORMAT == "portrait" else 1


def px(v):
    return f"{round(v * U)}px"


CL, CR, CT = LAYOUT["card"]
PL, PR, PT = LAYOUT["p_card"]

kq.prepare(ROOT, "__NAME__")


def write(name, text):
    kq.write(ROOT, name, text)


# ------------------------------------------------------------- S1 hook (0-3 s)
rows = "\n".join(f"""          <div class="row" id="s1-r{i}"><span class="dot" id="s1-d{i}"></span>
            <div class="lab"><div class="pk" id="s1-p{i}">{p}<span class="strike" id="s1-x{i}"></span></div><div class="fx">{f}</div></div>
            <div class="pr mono">{o}</div></div>""" for i, (p, f, o) in enumerate(HOOK_ROWS))
last = len(HOOK_ROWS) - 1
write("s1-hook.html", scene("s1", 3.0, f"""
    #root {{ background: var(--ink-g); }}
    #s1-title {{ top: {LAYOUT['title_top']}px; right: {LAYOUT['title_right']}px; font-size: {px(64)}; }}
    #s1-title .acc {{ color: var(--rose); }}
    #s1-card {{ left: {CL}px; right: {CR}px; top: {CT}px; padding: 30px 40px; overflow: hidden; }}
    #s1-card .hd {{ display: flex; justify-content: space-between; padding-bottom: 22px; border-bottom: 2px solid var(--line);
      font-size: {px(30)}; font-weight: 700; color: var(--chalk); }}
    #s1-card .row {{ display: flex; align-items: center; gap: 26px; height: {px(108)}; border-bottom: 2px solid var(--line); }}
    #s1-card .row:last-child {{ border-bottom: 0; }}
    #s1-card .dot {{ width: {px(24)}; height: {px(24)}; border-radius: 50%; background: var(--line2); flex: none; }}
    #s1-card .lab {{ flex: 1; min-width: 0; }}
    #s1-card .pk {{ position: relative; display: inline-block; font-size: {px(34)}; font-weight: 700; color: var(--chalk); }}
    #s1-card .strike {{ position: absolute; left: -4px; right: -4px; top: 52%; height: 4px; background: var(--rose); transform-origin: left center; transform: scaleX(0); }}
    #s1-card .fx {{ font-size: {px(26)}; color: var(--muted); margin-top: 4px; }}
    #s1-card .pr {{ font-size: {px(32)}; color: var(--muted); }}
    #s1-flood {{ position: absolute; inset: 0; background: var(--volt); clip-path: circle(0px at {W // 2}px {H - 120}px); z-index: 20; }}
""", f"""    <h1 class="t" id="s1-title">{title(*COPY['hook'])}</h1>
    <div class="card" id="s1-card">
      <div class="hd"><span>Your code · {len(HOOK_ROWS)} games</span><span class="mono">10.85</span></div>
{rows}
    </div>
    <div id="s1-flood"></div>""", HELPERS + f"""
    // frame 0 is the thumbnail: title and card already on screen
    [0.3, 0.6, 0.9].slice(0, {last}).forEach((t, i) =>
      tl.fromTo("#s1-d" + i, {{ backgroundColor: "#2e3a34", scale: 0.5 }}, {{ backgroundColor: "#d4ff3a", scale: 1, duration: 0.36, ease: "power4.out" }}, t));
    tl.fromTo("#s1-d{last}", {{ backgroundColor: "#2e3a34", scale: 0.5 }}, {{ backgroundColor: "#ff4d6d", scale: 1.25, duration: 0.14, ease: "power4.out" }}, 1.4)
      .to("#s1-d{last}", {{ scale: 1, duration: 0.3, ease: "power3.out" }}, 1.54)
      .fromTo("#s1-x{last}", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.34, ease: "power4.out" }}, 1.42)
      .fromTo("#s1-p{last}", {{ color: "#f2f4ec" }}, {{ color: "#ff4d6d", duration: 0.16 }}, 1.42);
    // hand-off: a volt flood from under the card
    tl.fromTo("#s1-flood", {{ clipPath: "circle(0px at {W // 2}px {H - 120}px)" }}, {{ clipPath: "circle({max(W, H) * 1.3:.0f}px at {W // 2}px {H - 120}px)", duration: 0.4, ease: "power2.inOut" }}, 2.6);
""", W, H))

# ----------------------------------------------------------- S2 reveal (3-6.2 s)
name = "".join(f'<span class="ln"><span class="li">{letters(n)}</span></span>' for n in COPY["name"])
pill_top = round(H * 760 / 1080)
write("s2-reveal.html", scene("s2", 3.2, f"""
    #root {{ background: var(--volt); }}
    #s2-turn {{ top: {round(H * 330 / 1080)}px; font-size: 88px; color: var(--ink-g); }}
    #s2-name {{ position: absolute; left: 96px; top: {round(H * 250 / 1080)}px; font-family: "Unbounded", sans-serif; font-weight: 800;
      font-size: 172px; line-height: 0.98; letter-spacing: -0.04em; color: var(--ink-g); }}
    #s2-by {{ position: absolute; left: 100px; top: {round(H * 250 / 1080) + 360}px; font-size: 40px; font-weight: 700; color: var(--ink-g); }}
    #s2-open {{ position: absolute; left: 96px; top: {pill_top}px; border-radius: 999px; background: var(--ink-g); color: var(--volt);
      font-size: 34px; font-weight: 700; padding: 18px 34px; white-space: nowrap; }}
    #s2-zoom {{ position: absolute; left: 96px; top: {pill_top}px; width: 360px; height: 85px; border-radius: 999px; background: var(--ink-g); z-index: 30; }}
""", f"""    <h1 class="t" id="s2-turn">{title(COPY['turn'])}</h1>
    <div id="s2-name">{name}</div>
    <div id="s2-by"><span class="ln"><span class="li">{COPY['by']}</span></span></div>
    <div id="s2-open">{COPY['open']}</div>
    <div id="s2-zoom"></div>
    {CURSOR.format(id="s2-cur")}""", HELPERS + """
    rise("#s2-turn", 0.08, 0.1, 0.7);
    leave("#s2-turn", 1.2);
    riseEach("#s2-name .lt", 1.4, 0.04, 0.7);
    rise("#s2-by", 1.75);
    tl.fromTo("#s2-open", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.55, ease: "power4.out" }, 1.95);
    // zoom through the button into the product
    tl.fromTo("#s2-zoom", { opacity: 0, scale: 1 }, { opacity: 0, scale: 1, duration: 0.01 }, 0);
    cursorPath("#s2-cur", [[2.15, 1120, 1120], [2.6, 280, """ + str(pill_top + 50) + """]]);
    click("#s2-cur", 2.66);
    press("#s2-open", 2.66);
    tl.to("#s2-zoom", { opacity: 1, duration: 0.08, ease: "power1.out" }, 2.68);
    tl.to("#s2-zoom", { scale: 30, duration: 0.42, ease: "power3.in", transformOrigin: "50% 50%" }, 2.76);
    tl.to("#s2-cur", { opacity: 0, duration: 0.12 }, 2.8);
""", W, H))

# --------------------------------------------------------- S3 product (6.2-11.2 s)
read_rows = "\n".join(f"""        <li class="sr" id="s3-r{i}"><div class="lab"><div class="pk">{p}</div><div class="fx">{f}</div></div>
          <span class="pc mono">{pc}</span><span class="badge b-{v}" id="s3-b{i}">{vl}</span></li>""" for i, (p, f, pc, v, vl) in enumerate(READ_ROWS))
risky = next(i for i, r in enumerate(READ_ROWS) if r[3] == "risky")
write("s3-product.html", scene("s3", 5.0, f"""
    #root {{ background: var(--ink-g); }}
    #s3-t1, #s3-t2 {{ top: {LAYOUT['p_title_top']}px; right: {LAYOUT['title_right']}px; font-size: {px(64)}; }}
    #s3-t1 .acc, #s3-t2 .acc {{ color: var(--volt); }}
    #s3-card {{ left: {PL}px; right: {PR}px; top: {PT + 140 if FORMAT != 'landscape' else PT}px; padding: 22px 34px; overflow: hidden; }}
    #s3-card .hd {{ display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 14px; }}
    #s3-card .cd {{ font-size: {px(36)}; letter-spacing: 0.12em; color: var(--chalk); }}
    #s3-card .rd {{ font-size: {px(26)}; color: var(--muted); }}
    #s3-card ul {{ list-style: none; margin: 0; padding: 0; }}
    #s3-card .sr {{ display: flex; align-items: center; gap: 18px; height: {px(88)}; border-top: 2px solid var(--line); margin: 0 -34px; padding: 0 34px; }}
    #s3-card .lab {{ flex: 1; min-width: 0; }}
    #s3-card .pk {{ font-size: {px(30)}; font-weight: 700; color: var(--chalk); }}
    #s3-card .fx {{ font-size: {px(25)}; color: var(--muted); }}
    #s3-card .pc {{ font-size: {px(28)}; color: var(--muted); min-width: 70px; text-align: right; }}
    #s3-card .badge {{ min-width: {px(112)}; justify-content: center; font-size: {px(26)}; }}
    #s3-btn {{ margin-top: 18px; height: {px(88)}; border-radius: 18px; background: var(--volt); color: var(--ink-g); font-size: {px(34)}; font-weight: 700;
      display: grid; place-items: center; }}
    #s3-flood {{ position: absolute; inset: 0; background: var(--volt); clip-path: circle(0px at 50% 85%); z-index: 40; }}
""", f"""    {tabs("s3", 1, TAB[1][0], TAB[1][1])}
    <h1 class="t" id="s3-t1">{title(*COPY['t1'])}</h1>
    <h1 class="t" id="s3-t2">{title(*COPY['t2'])}</h1>
    <div class="card" id="s3-card">
      <div class="hd" id="s3-hd"><span class="cd mono">7XK2QP</span><span class="rd">{len(READ_ROWS)} of {len(READ_ROWS)} games read</span></div>
      <ul>
{read_rows}
      </ul>
      <div id="s3-btn">{COPY['button']}</div>
    </div>
    <div id="s3-flood"></div>
    {CURSOR.format(id="s3-cur")}""", HELPERS + f"""
    // arrive from the zoom-through: the card settles from slightly large, the tab row drops in
    tl.fromTo("#s3-card", {{ scale: 1.12, filter: "blur(12px)", opacity: 0 }}, {{ scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.7, ease: "expo.out" }}, 0);
    tl.fromTo("#s3-tabs", {{ y: -110, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.62, ease: "power4.out" }}, 0.12);
    rise("#s3-t1", 0.28);
    tl.fromTo("#s3-card .sr", {{ opacity: 0, y: 36 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power4.out", stagger: 0.06 }}, 0.4);
    for (let i = 0; i < {len(READ_ROWS)}; i++) wipe("#s3-b" + i, 0.9 + i * 0.2);
    leave("#s3-t1", 2.0);
    rise("#s3-t2", 2.25);
    tl.to("#s3-card .sr:not(#s3-r{risky})", {{ opacity: 0.35, duration: 0.45, ease: "power2.inOut" }}, 2.5);
    tl.fromTo("#s3-r{risky}", {{ backgroundColor: "rgba(255,77,109,0)" }}, {{ backgroundColor: "rgba(255,77,109,0.10)", duration: 0.45, ease: "power2.inOut" }}, 2.55);
    cursorPath("#s3-cur", [[3.0, {W + 40}, {H + 40}], [3.6, {W // 2}, {H - 160}]]);
    click("#s3-cur", 3.66);
    press("#s3-btn", 3.66);
    // hand-off: the button floods the frame volt
    tl.to("#s3-cur", {{ opacity: 0, duration: 0.12 }}, 3.9);
    tl.fromTo("#s3-flood", {{ clipPath: "circle(0px at 50% 85%)" }}, {{ clipPath: "circle({max(W, H) * 1.3:.0f}px at 50% 85%)", duration: 0.45, ease: "power2.inOut" }}, 4.55);
""", W, H))

# --------------------------------------------------- S4 claim, S5 end card (kit)
write("s4-claim.html", kq.claim_scene("s4", 3.0, COPY["claim"], W, H))
write("s5-endcard.html", kq.endcard_scene("s5", 3.5, COPY["end_line"], COPY["cta"], COPY["foot"], W, H))

# ----------------------------------------------------------------- index
SCENES = [("s1", "s1-hook", 0.0, 3.0), ("s2", "s2-reveal", 3.0, 3.2), ("s3", "s3-product", 6.2, 5.0),
          ("s4", "s4-claim", 11.2, 3.0), ("s5", "s5-endcard", 14.2, 3.5)]
# (id, kit sfx file, picture time in film seconds, file peak seconds, volume)
SFX = [
    ("sx-d1", "key-press", 0.30, 0.076, 0.55), ("sx-d2", "key-press", 0.60, 0.076, 0.55), ("sx-d3", "key-press", 0.90, 0.076, 0.55),
    ("sx-cut", "thud-muffled", 1.40, 0.070, 1.0),
    ("sx-flood1", "whoosh-synth", 2.62, 0.345, 0.8),
    ("sx-name", "boom-low", 4.40, 0.080, 0.9),
    ("sx-open", "click-sharp", 5.66, 0.125, 0.9), ("sx-zoom", "whoosh", 5.95, 0.162, 0.8),
    ("sx-b1", "pop-hollow", 7.12, 0.160, 0.5), ("sx-b2", "pop", 7.32, 0.120, 0.45), ("sx-b3", "pop-hollow", 7.52, 0.160, 0.5), ("sx-b4", "pop", 7.72, 0.120, 0.45),
    ("sx-risky", "thud-muffled", 8.75, 0.070, 0.7),
    ("sx-tap", "click", 9.86, 0.073, 0.9), ("sx-flood2", "whoosh-synth", 10.75, 0.345, 0.8),
    ("sx-shrink", "whoosh", 13.95, 0.162, 0.7), ("sx-mark", "impact-bass", 14.70, 0.073, 0.42),
]
# Music: put a bed at assets/bgm/bed.mp3 (video/README.md, Sound) and it is mixed in at 0.8.
bgm = ""
if os.path.exists(os.path.join(ROOT, "assets/bgm/bed.mp3")):
    bgm = """      <audio id="bgm" class="clip" src="assets/bgm/bed.mp3" data-start="0" data-duration="17.7" data-track-index="2" data-volume="0.8" data-fade-out="1.5"></audio>"""
kq.build_index(ROOT, SCENES, SFX, bgm, w=W, h=H)
print(f"ok: {FORMAT} {W}x{H}, {SCENES[-1][2] + SCENES[-1][3]:g} s")
