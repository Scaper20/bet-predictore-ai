"""KiqStat video kit for HyperFrames.

Brand tokens, the measured motion grammar (video/DESIGN.md) and the app's own components, so a
new film is a build.py that imports this module, writes its scenes and calls build().

    import sys, os; sys.path.insert(0, "<repo>/video/kit")
    import kiqstat_video as kq
    kq.prepare(ROOT, "my-film")                     # assets, DESIGN.md, hyperframes.json
    kq.write(ROOT, "s01-hook.html", kq.scene("s01", 3.0, css, body, kq.HELPERS + js))
    kq.build_index(ROOT, scenes=[...], sfx=[...], bgm=...)

Everything a scene needs is inlined into its file at build time (HyperFrames scene files are
self-contained <template>s), so the kit is plain strings and small functions.
"""
import json
import os
import re
import shutil
import subprocess

KIT = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(KIT)
REPO = os.path.dirname(VIDEO)

FORMATS = {"square": (1080, 1080), "portrait": (1080, 1920), "landscape": (1920, 1080)}

# ------------------------------------------------------------------ brand
COLORS = {
    # ink world: the product, the app's dark theme
    "ink-g": "#07090b", "shell": "#0b0e0d", "surf": "#0f1513", "surf2": "#151c19",
    "line": "#1e2723", "line2": "#2e3a34", "chalk": "#f2f4ec", "muted": "#97a39c", "dim": "#6b7670",
    # accents and verdicts, as in the app
    "volt": "#d4ff3a", "rose": "#ff4d6d", "amber": "#ffb020",
    # chalk world: the app's light theme
    "l-ground": "#f4f5ef", "l-line": "#e1e4da", "l-muted": "#4c5650", "l-dim": "#78827c", "olive": "#4f6b00",
}

FONTS = """
    @font-face { font-family: "Unbounded"; src: url("assets/fonts/Unbounded-ExtraBold.ttf"); font-weight: 800; }
    @font-face { font-family: "Space Grotesk"; src: url("assets/fonts/SpaceGrotesk-Medium.ttf"); font-weight: 500; }
    @font-face { font-family: "Space Grotesk"; src: url("assets/fonts/SpaceGrotesk-Bold.ttf"); font-weight: 700; }
    @font-face { font-family: "IBM Plex Mono"; src: url("assets/fonts/IBMPlexMono-Medium.ttf"); font-weight: 500; }
"""

BASE = """
    #root { position: absolute; inset: 0; overflow: hidden; font-family: "Space Grotesk", sans-serif; font-weight: 500;
      --ink-g: #07090b; --shell: #0b0e0d; --surf: #0f1513; --surf2: #151c19; --line: #1e2723; --line2: #2e3a34;
      --chalk: #f2f4ec; --muted: #97a39c; --dim: #6b7670; --volt: #d4ff3a; --rose: #ff4d6d; --amber: #ffb020;
      --l-ground: #f4f5ef; --l-line: #e1e4da; --l-muted: #4c5650; --l-dim: #78827c; --olive: #4f6b00; }
    #root .t { position: absolute; left: 96px; right: 96px; font-family: "Unbounded", sans-serif; font-weight: 800;
      font-size: 64px; line-height: 1.08; letter-spacing: -0.025em; color: var(--chalk); }
    /* a masked line: the text rises into it and leaves upward through it; padding keeps descenders, margins keep layout */
    #root .ln { display: block; overflow: hidden; padding: 0.06em 0.05em 0.16em; margin: -0.06em -0.05em -0.16em; }
    #root .li { display: block; }
    #root .w, #root .lt { display: inline-block; }
    #root .mono { font-family: "IBM Plex Mono", monospace; font-weight: 500; }
    #root .badge { display: inline-flex; align-items: center; border-radius: 999px; border: 2px solid; padding: 4px 16px;
      font-size: 26px; font-weight: 700; letter-spacing: 0.02em; }
    #root .b-strong { color: var(--volt); background: rgba(212,255,58,.12); border-color: rgba(212,255,58,.3); }
    #root .b-fair { color: var(--muted); background: var(--surf2); border-color: var(--line); }
    #root .b-risky { color: var(--rose); background: rgba(255,77,109,.12); border-color: rgba(255,77,109,.3); }
    #root .b-amber { color: var(--amber); background: rgba(255,176,32,.12); border-color: rgba(255,176,32,.3); }
    #root .card { position: absolute; border-radius: 24px; border: 2px solid var(--line);
      background: linear-gradient(180deg, var(--surf) 0%, var(--shell) 100%); }
    #root .cursor { position: absolute; left: 0; top: 0; width: 60px; height: 60px; z-index: 50; }
    /* the app's tab row; the active fill is one pill (.hl) that slides between tabs */
    #root .tabs { position: absolute; left: 72px; top: 60px; display: flex; gap: 12px; }
    #root .tab { position: relative; z-index: 1; border-radius: 999px; border: 2px solid var(--line); color: var(--muted); padding: 10px 24px;
      font-size: 26px; font-weight: 700; white-space: nowrap; }
    #root .tab.on { border-color: transparent; color: var(--ink-g); }
    #root .tabs .hl { position: absolute; top: 0; height: 58px; border-radius: 999px; background: var(--volt); z-index: 0; }
"""

# Code Hub tab geometry inside .tabs, measured in Chrome with the real fonts: (x, width)
TAB = [(0, 235), (247, 201), (460, 196)]
TAB_NAMES = ["Today's codes", "Code editor", "Community"]

CURSOR = """<svg class="cursor" id="{id}" data-layout-allow-overflow viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.6 14.8 L10.6 21.6 L13.6 20.3 L10.7 13.6 L17 13.4 Z" fill="#07090b" stroke="#f2f4ec" stroke-width="1.4" stroke-linejoin="round"/></svg>"""

# ------------------------------------------------------------ motion (JS)
# Measured on the reference at 60 fps: a line travels one line height in ~0.4 s on a quart-out
# curve, the next line 0.07-0.08 s behind; it leaves upward in ~0.2 s, accelerating.
HELPERS = """
    function rise(sel, at, gap = 0.08, d = 0.62) {
      riseEach(sel + " .li", at, gap, d);
    }
    // text below its mask is also hidden (autoAlpha), so nothing peeks and checks see it as off
    function riseEach(sel, at, gap = 0.05, d = 0.62) {
      $$(sel).forEach((el, i) => tl.fromTo(el, { yPercent: 130, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: d, ease: "power4.out" }, at + i * gap));
    }
    function leave(sel, at, gap = 0.045) {
      $$(sel + " .li").forEach((el, i) => {
        tl.to(el, { yPercent: -130, duration: 0.28, ease: "power3.in" }, at + i * gap);
        tl.set(el, { autoAlpha: 0 }, at + i * gap + 0.28);
      });
    }
    function wipe(sel, at, d = 0.42) {
      tl.fromTo(sel, { clipPath: "inset(0% 100% 0% 0% round 999px)" }, { clipPath: "inset(0% 0% 0% 0% round 999px)", duration: d, ease: "power4.out" }, at);
    }
    function cursorPath(sel, pts) {
      // pts: [[t, x, y], ...]; first point is the entry position
      tl.fromTo($(sel), { x: pts[0][1], y: pts[0][2] }, { x: pts[0][1], y: pts[0][2], duration: 0.01 }, pts[0][0]);
      for (let i = 1; i < pts.length; i++) {
        const [t, x, y] = pts[i];
        const d = Math.max(0.05, t - pts[i - 1][0]);
        tl.to($(sel), { x, y, duration: d, ease: "power3.inOut" }, pts[i - 1][0]);
      }
    }
    function click(sel, at) {
      tl.to($(sel), { scale: 0.88, duration: 0.07, ease: "power2.out", transformOrigin: "10% 10%" }, at)
        .to($(sel), { scale: 1, duration: 0.22, ease: "power3.out" }, at + 0.07);
    }
    function press(sel, at) {
      tl.to(sel, { scale: 0.96, duration: 0.07, ease: "power2.out" }, at).to(sel, { scale: 1, duration: 0.25, ease: "power3.out" }, at + 0.07);
    }
"""


# ------------------------------------------------------------- components
def title(text, accent=None):
    """Each '/'-separated line in its own mask; words stay addressable for per-word rises."""
    out = []
    for line in text.split("/"):
        parts = []
        for w in line.strip().split(" "):
            c = "w" + (" acc" if accent and w.strip("?.,") == accent else "")
            parts.append(f'<span class="{c}">{w}</span>')
        out.append(f'<span class="ln"><span class="li">{" ".join(parts)}</span></span>')
    return "".join(out)


def letters(word):
    """A hero word split into letters, to rise one by one inside its line mask (riseEach)."""
    return "".join(f'<span class="lt">{c}</span>' for c in word)


def tabs(sid, on, hl_x, hl_w):
    """The Code Hub tab row with its sliding active pill at (hl_x, hl_w)."""
    t = "".join(f'<div class="tab{" on" if i == on else ""}" id="{sid}-tab{i}">{n}</div>' for i, n in enumerate(TAB_NAMES))
    return f'<div class="tabs" id="{sid}-tabs"><div class="hl" id="{sid}-hl" style="left: {hl_x}px; width: {hl_w}px"></div>{t}</div>'


def tab_to(sid, frm, to, at, light=False):
    """JS: slide the active pill from tab `frm` to tab `to` (ink world; light=True for the chalk theme)."""
    on_c, off_c, off_b = ("#ffffff", "#4c5650", "#e1e4da") if light else ("#07090b", "#97a39c", "#1e2723")
    dx = TAB[to][0] - TAB[frm][0]
    return f"""
    tl.to("#{sid}-hl", {{ x: "+={dx}", width: {TAB[to][1]}, duration: 0.42, ease: "power3.inOut" }}, {at});
    tl.to("#{sid}-tab{frm}", {{ color: "{off_c}", borderColor: "{off_b}", duration: 0.3, ease: "power2.inOut" }}, {at + 0.06:.2f});
    tl.to("#{sid}-tab{to}", {{ color: "{on_c}", borderColor: "rgba(0,0,0,0)", duration: 0.3, ease: "power2.inOut" }}, {at + 0.06:.2f});
"""


def scene(sid, dur, css, body, js, w=1080, h=1080):
    """A self-contained HyperFrames scene file; `js` runs with tl, $ and $$ in scope."""
    return f"""<template>
  <style>{FONTS}{BASE}{css}
  </style>
  <div id="root" data-composition-id="{sid}" data-width="{w}" data-height="{h}">
{body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    const $ = (s) => document.querySelector('[data-composition-id="{sid}"] ' + s);
    const $$ = (s) => document.querySelectorAll('[data-composition-id="{sid}"] ' + s);
{js}
    window.__timelines["{sid}"] = tl;
  </script>
</template>
"""


def wordmark():
    lockup = open(os.path.join(KIT, "brand/lockup.svg")).read()
    return re.search(r'<path transform="translate\(128\.87 80\.84\) scale\(0\.05935\)" d="([^"]+)"', lockup).group(1)


LOCK_W = 444  # end-card lockup width; the viewBox is 382.08 wide


def lockup_pos(w=1080, h=1080):
    return (w - LOCK_W) // 2, round(h * 376 / 1080)


def ball_xy(w=1080, h=1080):
    """Centre of the logo's volt ball on the end card: the claim's iris closes onto it."""
    lx, ly = lockup_pos(w, h)
    return lx + (86.47 - 8) * LOCK_W / 382.08, ly + (28.57 - 8) * LOCK_W / 382.08


def claim_scene(sid, dur, text, w=1080, h=1080, top=None, size=76):
    """Volt ground; the claim rises word by word, leaves upward, then the volt irises onto the ball."""
    bx, by = ball_xy(w, h)
    top = round(h * 400 / 1080) if top is None else top
    end = dur - 0.5
    r = 960 * max(w, h) // 1080  # covers the frame from the ball's position in every format
    return scene(sid, dur, f"""
    #root {{ background: var(--ink-g); }}
    #{sid}-volt {{ position: absolute; inset: 0; background: var(--volt); clip-path: circle({r}px at {bx:.1f}px {by:.1f}px); }}
    #{sid}-line {{ top: {top}px; right: 60px; font-size: {size}px; color: var(--ink-g); }}
""", f"""    <div id="{sid}-volt">
      <h1 class="t" id="{sid}-line">{title(text)}</h1>
    </div>""", HELPERS + f"""
    // the claim rises word by word inside its line masks
    riseEach("#{sid}-line .w", 0.1, 0.07, 0.7);
    leave("#{sid}-line", {end - 0.18:.2f});
    tl.fromTo("#{sid}-volt", {{ clipPath: "circle({r}px at {bx:.1f}px {by:.1f}px)" }}, {{ clipPath: "circle(12px at {bx:.1f}px {by:.1f}px)", duration: 0.5, ease: "power3.inOut" }}, {end:.1f});
""", w, h)


def endcard_scene(sid, dur, line_html, cta, foot, w=1080, h=1080):
    """The performed lockup (ring, needle, ball, wordmark), one line, the volt button and the footer."""
    lx, ly = lockup_pos(w, h)
    y = lambda v: round(h * v / 1080)  # noqa: E731
    return scene(sid, dur, f"""
    #root {{ background: var(--ink-g); }}
    #{sid}-lock {{ position: absolute; left: {lx}px; top: {ly}px; width: {LOCK_W}px; height: 121px; overflow: visible; }}
    #{sid}-l1 {{ position: absolute; left: 96px; right: 96px; top: {y(560)}px; text-align: center; font-family: "Unbounded", sans-serif; font-weight: 800;
      font-size: 44px; color: var(--chalk); letter-spacing: -0.02em; }}
    #{sid}-l1 .u {{ color: var(--volt); }}
    #{sid}-cta {{ position: absolute; left: 50%; top: {y(652)}px; transform: translateX(-50%); }}
    #{sid}-cta .btn {{ background: var(--volt); color: var(--ink-g); font-size: 36px; font-weight: 700; border-radius: 18px; padding: 22px 44px; white-space: nowrap; }}
    #{sid}-foot {{ position: absolute; left: 96px; right: 96px; top: {y(880)}px; text-align: center; font-size: 28px; color: var(--muted); }}
""", f"""    <svg id="{sid}-lock" viewBox="8 8 382.08 104">
      <path id="{sid}-ring" d="M71.73 17.06A42 42 0 1 0 96.37 44.42L80.99 48.83A26 26 0 1 1 65.74 31.89Z" fill="#F2F4EC"/>
      <path id="{sid}-needle" d="M54.59 57.41L94.89 106.2L106.2 94.89L57.41 54.59Z" fill="#D4FF3A"/>
      <circle id="{sid}-ball" cx="86.47" cy="28.57" r="10" fill="#D4FF3A"/>
      <path id="{sid}-word" transform="translate(128.87 80.84) scale(0.05935)" d="{wordmark()}" fill="#F2F4EC"/>
    </svg>
    <div id="{sid}-l1"><span class="ln"><span class="li">{line_html}</span></span></div>
    <div id="{sid}-cta"><div class="btn" id="{sid}-btn">{cta}</div></div>
    <div id="{sid}-foot">{foot}</div>""", HELPERS + f"""
    tl.fromTo("#{sid}-ring", {{ opacity: 0, scale: 0.6, rotation: -140, svgOrigin: "56 56" }}, {{ opacity: 1, scale: 1, rotation: 0, svgOrigin: "56 56", duration: 0.5, ease: "expo.out" }}, 0.05);
    tl.fromTo("#{sid}-needle", {{ scale: 0, svgOrigin: "56 56" }}, {{ scale: 1, svgOrigin: "56 56", duration: 0.4, ease: "expo.out" }}, 0.3);
    tl.fromTo("#{sid}-ball", {{ scale: 1, svgOrigin: "86.47 28.57" }}, {{ scale: 1.35, svgOrigin: "86.47 28.57", duration: 0.07, ease: "power2.out" }}, 0.48)
      .to("#{sid}-ball", {{ scale: 1, duration: 0.3, ease: "power3.out" }}, 0.55);
    tl.fromTo("#{sid}-word", {{ clipPath: "inset(0 100% 0 0)" }}, {{ clipPath: "inset(0 0% 0 0)", duration: 0.55, ease: "power4.out" }}, 0.5);
    rise("#{sid}-l1", 0.92);
    tl.fromTo("#{sid}-btn", {{ opacity: 0, y: 50, scale: 0.94 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.65, ease: "power4.out" }}, 1.08);
    tl.fromTo("#{sid}-foot", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4, ease: "power2.out" }}, 1.3);
""", w, h)


# ---------------------------------------------------------------- project
def write(root, name, text):
    os.makedirs(os.path.join(root, "compositions"), exist_ok=True)
    with open(os.path.join(root, "compositions", name), "w") as f:
        f.write(text)


def prepare(root, name):
    """Make `root` a HyperFrames project with the brand assets, the SFX palette and DESIGN.md."""
    a = os.path.join(root, "assets")
    for sub, src in (("fonts", os.path.join(REPO, "assets/fonts")), ("brand", os.path.join(KIT, "brand")),
                     ("sfx", os.path.join(KIT, "sfx")), ("vendor", os.path.join(KIT, "vendor"))):
        os.makedirs(os.path.join(a, sub), exist_ok=True)
        for f in os.listdir(src):
            if f.endswith((".ttf", ".svg", ".mp3", ".js")):
                shutil.copy2(os.path.join(src, f), os.path.join(a, sub, f))
    shutil.copy2(os.path.join(VIDEO, "DESIGN.md"), os.path.join(root, "DESIGN.md"))
    hf = os.path.join(root, "hyperframes.json")
    if not os.path.exists(hf):
        json.dump({"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
                   "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
                   "paths": {"blocks": "compositions", "components": "compositions/components", "assets": "assets"},
                   "media": {"autoProxy": True}, "authoringSkill": "hyperframes"}, open(hf, "w"), indent=2)
    pk = os.path.join(root, "package.json")
    if not os.path.exists(pk):
        json.dump({"name": name, "private": True, "type": "module",
                   "scripts": {"check": "npx --yes hyperframes check", "dev": "npx --yes hyperframes preview",
                               "render": "npx --yes hyperframes render -q delivery --fps 60"}}, open(pk, "w"), indent=2)


def sfx_duration(f):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          os.path.join(KIT, "sfx", f + ".mp3")], capture_output=True, text=True).stdout
    return round(float(out.strip()), 3)


def audio_tags(sfx):
    """sfx: [(id, file, picture time s, file peak s, volume)]. Each clip starts so its peak lands one
    frame after its picture; clips go on the first free lane from track 3 up."""
    lanes, rows = [], []
    for (i, f, t, pk, v) in sfx:
        st = max(0, round(t + 1 / 30 - pk, 3))
        du = sfx_duration(f)
        lane = next((k for k, end in enumerate(lanes) if end <= st), None)
        if lane is None:
            lanes.append(0)
            lane = len(lanes) - 1
        lanes[lane] = st + du
        rows.append(f"""      <audio id="{i}" class="clip" src="assets/sfx/{f}.mp3" data-start="{st}" data-duration="{du}" data-track-index="{3 + lane}" data-volume="{v}"></audio>""")
    return "\n".join(rows)


def build_index(root, scenes, sfx=(), bgm="", duration=None, w=1080, h=1080, fps=60, ground="#07090b"):
    """scenes: [(id, file stem, start s, duration s)]; bgm: a ready <audio> tag (see DESIGN.md Sound)."""
    duration = duration or round(max(s + d for _, _, s, d in scenes), 3)
    res = {v: k for k, v in FORMATS.items()}.get((w, h), "square")
    hosts = "\n".join(
        f"""      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{f}.html" data-start="{s}" data-duration="{d}"
        data-track-index="1" data-track-kind="graphics" data-width="{w}" data-height="{h}"></div>""" for sid, f, s, d in scenes)
    index = f"""<!doctype html>
<html lang="en" data-resolution="{res}"
  data-composition-variables='[
    {{"id":"color-ground","type":"color","label":"Background","default":"#07090b"}},
    {{"id":"color-ink","type":"color","label":"Text","default":"#f2f4ec"}},
    {{"id":"color-accent","type":"color","label":"Accent","default":"#d4ff3a"}}
  ]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={w}, height={h}" />
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {w}px; height: {h}px; overflow: hidden; background: {ground}; }}
      #main {{ position: relative; width: 100%; height: 100%; }}
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="{duration:g}" data-width="{w}" data-height="{h}" data-fps="{fps}" data-motion-blur="on">
{hosts}
{bgm}
{audio_tags(sfx)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    with open(os.path.join(root, "index.html"), "w") as f:
        f.write(index)
