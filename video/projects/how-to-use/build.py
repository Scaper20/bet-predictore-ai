#!/usr/bin/env python3
"""how-to-use: "How to use KiqStat", the carousel as a film (1:1, 36 s, 60 fps).

Hook -> volt title -> six steps (chance, market check, Forge, Code Hub, code editor, track), each a
product card that pushes in, does its job and pushes out on the beat -> the five habits on chalk ->
claim -> end card. Cut to the house bed (afro-pop, 120 BPM: a beat is 0.5 s, every scene starts on
one). Build:  python3 build.py && npx hyperframes check && npx hyperframes render -q delivery --fps 60
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "../../kit"))
import kiqstat_video as kq  # noqa: E402
from kiqstat_video import CURSOR, HELPERS, TAB, letters, scene, tab_to, tabs, title  # noqa: E402

W, H = kq.FORMATS["square"]
kq.prepare(ROOT, "how-to-use")


def write(name, text):
    kq.write(ROOT, name, text)


STEP = 3.5   # seconds per step: seven beats
N = 6

# Extra motion for this film: number counters, the card push between steps, the step counter.
MORE = """
    function count(sel, from, to, at, d, dec = 0, pre = "", suf = "") {
      const o = { v: from }, el = $(sel);
      tl.to(o, { v: to, duration: d, ease: "power3.out", onUpdate: () => { el.textContent = pre + o.v.toFixed(o.v >= 100 ? 0 : dec) + suf; } }, at);
      tl.call(() => { el.textContent = pre + from.toFixed(from >= 100 ? 0 : dec) + suf; }, null, 0);
    }
    function pushIn(sel, at) { tl.fromTo(sel, { x: 760, opacity: 0 }, { x: 0, opacity: 1, duration: 0.62, ease: "power4.out" }, at); }
    function pushOut(sel, at) { tl.to(sel, { x: -760, duration: 0.3, ease: "power3.in" }, at); tl.set(sel, { opacity: 0 }, at + 0.3); }
    function pop(sel, at, s = 1.18) {
      tl.fromTo(sel, { scale: 1 }, { scale: s, duration: 0.08, ease: "power2.out" }, at).to(sel, { scale: 1, duration: 0.3, ease: "power3.out" }, at + 0.08);
    }
"""
JS = HELPERS + MORE

# Shared layout for the six steps: counter, two-line title, card.
STEP_CSS = """
    #root { background: var(--ink-g); }
    #root .ctr { position: absolute; left: 96px; top: 60px; font-size: 28px; letter-spacing: 0.16em; color: var(--volt); }
    #root .ctr .ln { display: inline-block; vertical-align: top; }
    #root .st { top: 112px; font-size: 60px; }
    #root .st .acc { color: var(--volt); }
    #root .sc { left: 72px; right: 72px; top: 340px; padding: 34px 40px; }
    #root .lbl { font-size: 28px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); font-weight: 700; }
    #root .fx { font-size: 28px; color: var(--muted); }
    #root .big { font-family: "Unbounded", sans-serif; font-weight: 800; letter-spacing: -0.03em; color: var(--chalk); }
    #root .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    #root .rule { height: 2px; background: var(--line); margin: 24px -40px; }
    #root .leg { display: flex; align-items: center; gap: 20px; height: 84px; border-top: 2px solid var(--line); }
    #root .leg .dt { width: 18px; height: 18px; border-radius: 99px; background: var(--line2); flex: none; }
    #root .leg .tx { flex: 1; min-width: 0; }
    #root .leg .p { font-size: 30px; font-weight: 700; color: var(--chalk); }
    #root .leg .f { font-size: 28px; color: var(--dim); margin-top: 2px; }
    #root .leg .o { font-size: 28px; color: var(--muted); }
    #root .badge { font-size: 28px; }
"""


def step_scene(n, text, accent, body, css, js, card_in=True, card_out=True, extra_out=""):
    """One step: the counter rolls to n, the title rises, the card pushes in, does its job (js),
    and everything leaves on the last beat so the next step can arrive."""
    sid = f"st{n}"
    end = STEP - 0.42
    return scene(sid, STEP, STEP_CSS + css, f"""    <div class="ctr mono">STEP <span class="ln"><span class="li" id="{sid}-n">{n:02d}</span></span> / {N:02d}</div>
    <h1 class="t st" id="{sid}-t">{title(text, accent)}</h1>
{body}""", JS + f"""
    riseEach("#{sid}-n", 0.0, 0, 0.5);
    rise("#{sid}-t", 0.08);
    {"pushIn('#" + sid + "-card', 0);" if card_in else ""}
{js}
    leave("#{sid}-t", {end:.2f});
    tl.to("#{sid}-n", {{ yPercent: -130, duration: 0.28, ease: "power3.in" }}, {end + 0.08:.2f});
    {"pushOut('#" + sid + "-card', " + f"{end + 0.06:.2f}" + ");" if card_out else ""}
{extra_out}
""", W, H)


# ------------------------------------------------------------- S1 hook (0-2.5)
write("s1-hook.html", scene("s1", 2.5, """
    #root { background: var(--ink-g); }
    #s1-a { position: absolute; left: 96px; right: 60px; top: 300px; font-family: "Unbounded", sans-serif; font-weight: 800;
      font-size: 124px; line-height: 0.98; letter-spacing: -0.04em; color: var(--chalk); }
    #s1-b { top: 360px; font-size: 104px; }
    #s1-b .acc { color: var(--volt); }
    #s1-flood { position: absolute; inset: 0; background: var(--volt); clip-path: circle(0px at 540px 1000px); z-index: 20; }
""", f"""    <div id="s1-a"><span class="ln"><span class="li">{letters("STOP")}</span></span><span class="ln"><span class="li">{letters("GUESSING.")}</span></span></div>
    <h1 class="t" id="s1-b">{title("Play it / smart.", "smart")}</h1>
    <div id="s1-flood"></div>""", JS + """
    // frame 0 is the thumbnail: STOP is already up; GUESSING. rises under it
    riseEach("#s1-a .ln:nth-child(2) .lt", 0.12, 0.035, 0.55);
    tl.to("#s1-a .lt", { yPercent: -130, duration: 0.26, ease: "power3.in", stagger: 0.015 }, 1.18);
    tl.set("#s1-a .lt", { autoAlpha: 0 }, 1.62);
    rise("#s1-b", 1.42, 0.1, 0.55);
    tl.fromTo("#s1-flood", { clipPath: "circle(0px at 540px 1000px)" }, { clipPath: "circle(1500px at 540px 1000px)", duration: 0.4, ease: "power2.inOut" }, 2.08);
""", W, H))

# ------------------------------------------------------------ S2 title (2.5-4.5)
write("s2-title.html", scene("s2", 2.0, """
    #root { background: var(--volt); }
    #s2-how { top: 250px; font-size: 84px; color: var(--ink-g); }
    #s2-name { position: absolute; left: 96px; top: 360px; font-family: "Unbounded", sans-serif; font-weight: 800; font-size: 172px;
      line-height: 0.98; letter-spacing: -0.04em; color: var(--ink-g); }
    #s2-pill { position: absolute; left: 96px; top: 640px; border-radius: 999px; background: var(--ink-g); color: var(--volt);
      font-size: 32px; font-weight: 700; padding: 18px 34px; white-space: nowrap; }
    #s2-zoom { position: absolute; left: 96px; top: 640px; width: 330px; height: 82px; border-radius: 999px; background: var(--ink-g); z-index: 30; }
""", f"""    <h1 class="t" id="s2-how">{title("How to use")}</h1>
    <div id="s2-name"><span class="ln"><span class="li">{letters("KiqStat")}</span></span></div>
    <div id="s2-pill">6 steps · 30 seconds</div>
    <div id="s2-zoom"></div>""", JS + """
    rise("#s2-how", 0.04, 0.08, 0.55);
    riseEach("#s2-name .lt", 0.2, 0.035, 0.6);
    tl.fromTo("#s2-pill", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power4.out" }, 0.62);
    // through the pill into the first step (ink)
    tl.fromTo("#s2-zoom", { opacity: 0, scale: 1 }, { opacity: 0, scale: 1, duration: 0.01 }, 0);
    tl.to("#s2-zoom", { opacity: 1, duration: 0.06 }, 1.5);
    tl.to("#s2-zoom", { scale: 32, duration: 0.42, ease: "power3.in", transformOrigin: "50% 50%" }, 1.54);
""", W, H))

# --------------------------------------------------------- step 1: the chance
write("st1.html", step_scene(1, "Start with / the chance", "chance", """    <div class="card sc" id="st1-card">
      <div class="row"><span class="fx">Arsenal v Fulham · 15:00</span><span class="badge b-strong" id="st1-b1">Strong</span></div>
      <div class="row" style="margin-top: 18px; align-items: flex-end">
        <div><div class="lbl">Our pick</div><div style="font-size: 40px; font-weight: 700; color: var(--chalk); margin-top: 6px">Home or Draw</div></div>
        <div class="big" style="font-size: 96px" id="st1-pc">0%</div>
      </div>
      <div class="bar"><i id="st1-bar"></i></div>
      <div class="rule"></div>
      <div class="row" id="st1-r2"><span class="fx">Lyon v Nice · Over 3.5</span><span class="row" style="gap: 18px"><span class="big" style="font-size: 52px; color: var(--muted)" id="st1-pc2">0%</span><span class="badge b-risky" id="st1-b2">Risky</span></span></div>
    </div>
    <div class="tip" id="st1-tip"><span class="ln"><span class="li"><b>Build on Strong.</b></span></span></div>""", """
    #st1-card .bar { height: 14px; border-radius: 99px; background: var(--surf2); margin-top: 22px; overflow: hidden; }
    #st1-bar { display: block; height: 100%; width: 100%; background: var(--volt); border-radius: 99px; transform-origin: left center; }
    #root .tip { position: absolute; left: 96px; right: 96px; top: 900px; font-size: 32px; color: var(--muted); }
    #root .tip b { color: var(--volt); font-weight: 700; }
""", """
    count("#st1-pc", 0, 82, 0.4, 0.9, 0, "", "%");
    tl.fromTo("#st1-bar", { scaleX: 0 }, { scaleX: 0.82, duration: 0.9, ease: "power3.out" }, 0.4);
    wipe("#st1-b1", 1.05);
    count("#st1-pc2", 0, 31, 1.35, 0.6, 0, "", "%");
    wipe("#st1-b2", 1.6);
    tl.to("#st1-r2", { opacity: 0.32, duration: 0.35, ease: "power2.inOut" }, 2.1);
    rise("#st1-tip", 1.9);
    leave("#st1-tip", 3.08);
""", card_in=False, extra_out="""    tl.fromTo("#st1-card", { y: 90, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "expo.out" }, 0);"""))

# ------------------------------------------------------- step 2: market check
write("st2.html", step_scene(2, "Let the market / check us", "market", """    <div class="card sc" id="st2-card">
      <div class="fx">Rayo Vallecano v Elche · Home or Draw</div>
      <div class="row" style="margin-top: 26px; align-items: flex-end">
        <div><div class="lbl">Our chance</div><div class="big" style="font-size: 92px; margin-top: 6px" id="st2-us">0%</div></div>
        <div style="text-align: right"><div class="lbl">The market's</div><div class="big" style="font-size: 92px; margin-top: 6px; color: var(--muted)" id="st2-them">0%</div></div>
      </div>
      <div class="rule"></div>
      <div class="row"><span class="badge b-strong" id="st2-ok" style="font-size: 30px">✓ Market agrees</span><span class="mono fx">price 1.22</span></div>
    </div>
    <div class="card" id="st2-aside">
      <div class="row"><span class="badge b-amber" id="st2-sa" style="font-size: 30px">Set aside · Over 2.5</span><span class="mono fx">us 68% · market 41%</span></div>
    </div>""", """
    #st2-aside { left: 72px; right: 72px; top: 780px; padding: 26px 40px; border-color: rgba(255,176,32,.35); }
""", """
    count("#st2-us", 0, 76, 0.4, 0.85, 0, "", "%");
    count("#st2-them", 0, 78, 0.55, 0.85, 0, "", "%");
    wipe("#st2-ok", 1.4);
    tl.fromTo("#st2-aside", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power4.out" }, 1.55);
    wipe("#st2-sa", 1.7);
    pushOut("#st2-aside", 3.12);
"""))

# --------------------------------------------------------------- step 3: Forge
legs3 = [("Home or Draw", "Inter v Lecce", "1.21"), ("Over 1.5", "Ajax v Twente", "1.33"),
         ("Home win", "Porto v Braga", "1.62"), ("Under 9.5 corners", "Celtic v Hibs", "1.92")]
legs3_html = "\n".join(f"""        <div class="leg" id="st3-l{i}"><span class="dt" style="background: var(--volt)"></span><div class="tx"><div class="p">{p}</div><div class="f">{f}</div></div><span class="o mono">{o}</span></div>""" for i, (p, f, o) in enumerate(legs3))
write("st3.html", step_scene(3, "Ask for the odds. / Forge builds it.", "Forge", f"""    <div class="card sc" id="st3-card" style="top: 320px; padding-top: 28px; padding-bottom: 22px">
      <div class="row" style="gap: 18px">
        <div style="flex: 1"><div class="lbl">Odds</div><div class="inp mono"><span id="st3-typed"></span><span class="caret" id="st3-caret"></span></div></div>
        <div style="flex: 1"><div class="lbl">Games</div><div class="inp mono">4</div></div>
      </div>
      <div style="margin-top: 16px">
{legs3_html}
      </div>
      <div class="row" style="border-top: 2px solid var(--line); padding-top: 18px">
        <span class="fx">Total <b class="mono" style="color: var(--chalk)" id="st3-tot">1.00</b></span>
        <span class="fx">Chance <b style="color: var(--volt)" id="st3-ch">29%</b></span>
      </div>
    </div>""", """
    #root .inp { margin-top: 8px; height: 76px; display: flex; align-items: center; padding: 0 22px; border: 2px solid var(--line2); background: var(--surf2);
      border-radius: 16px; font-size: 38px; color: var(--chalk); }
    #st3-caret { width: 3px; height: 40px; background: var(--volt); margin-left: 4px; }
    #st3-ch { display: inline-block; }
""", """
    // typing 5.00, one key at a time
    const typed = $("#st3-typed");
    ["5", "5.", "5.0", "5.00"].forEach((s, i) => tl.call(() => { typed.textContent = s; }, null, 0.42 + i * 0.09));
    tl.call(() => { typed.textContent = ""; }, null, 0);
    tl.to("#st3-caret", { opacity: 0, duration: 0.01 }, 0.9);
    tl.fromTo("#st3-card .leg", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power4.out", stagger: 0.09 }, 0.85);
    count("#st3-tot", 1, 5.01, 1.0, 1.0, 2);
    tl.fromTo("#st3-ch", { opacity: 0 }, { opacity: 1, duration: 0.01 }, 2.0);
    pop("#st3-ch", 2.0, 1.3);
"""))

# ----------------------------------------------------------- step 4: Code Hub
TABS_CSS = """
    #root .tabs { top: 336px; }
    #root .sc { top: 430px; }
"""
write("st4.html", step_scene(4, "Grab a / ready code", "ready", f"""    {tabs("st4", 0, TAB[0][0], TAB[0][1])}
    <div class="card sc" id="st4-card">
      <div class="row" style="align-items: flex-start">
        <div><div class="mono" style="font-size: 28px; letter-spacing: 0.18em; color: var(--volt)">STEADY 2</div>
          <div class="fx" style="margin-top: 10px">3 games · chance <b style="color: var(--chalk)">55%</b></div></div>
        <div style="text-align: right"><div class="big" style="font-size: 88px" id="st4-odds">1.00</div><div class="lbl">odds</div></div>
      </div>
      <div class="code" id="st4-box">
        <div><div class="lbl">Booking code</div><div class="mono cd">5CKNWH</div></div>
        <div class="btn" id="st4-btn"><span class="ln"><span class="li" id="st4-c1">Copy</span></span><span class="ln cpd"><span class="li" id="st4-c2">Copied</span></span></div>
      </div>
    </div>
    {CURSOR.format(id="st4-cur")}""", TABS_CSS + """
    #root .code { display: flex; align-items: center; justify-content: space-between; margin-top: 28px; padding: 22px 28px; border-radius: 20px;
      border: 2px solid rgba(212,255,58,.35); background: rgba(212,255,58,.07); }
    #root .cd { font-size: 50px; letter-spacing: 0.14em; color: var(--chalk); margin-top: 4px; }
    #root .btn { position: relative; background: var(--volt); color: var(--ink-g); font-size: 32px; font-weight: 700; border-radius: 16px; padding: 16px 30px; min-width: 170px; text-align: center; }
    #root .cpd { position: absolute; left: 0; right: 0; top: 16px; }
""", """
    tl.fromTo("#st4-tabs", { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power4.out" }, 0.1);
    count("#st4-odds", 1, 2.1, 0.45, 0.8, 2);
    tl.set("#st4-c2", { yPercent: 130 }, 0);
    cursorPath("#st4-cur", [[1.1, 1140, 1140], [1.75, 860, 760]]);
    click("#st4-cur", 1.82);
    press("#st4-btn", 1.82);
    tl.to("#st4-c1", { yPercent: -130, duration: 0.28, ease: "power3.in" }, 1.86);
    tl.set("#st4-c1", { autoAlpha: 0 }, 2.15);
    tl.to("#st4-c2", { yPercent: 0, duration: 0.5, ease: "power4.out" }, 2.0);
    tl.fromTo("#st4-box", { borderColor: "rgba(212,255,58,.35)" }, { borderColor: "rgba(212,255,58,1)", duration: 0.2, yoyo: true, repeat: 1 }, 1.9);
    tl.to("#st4-cur", { opacity: 0, duration: 0.15 }, 2.5);
""", extra_out=""))

# ------------------------------------------------------- step 5: code editor
picks5 = [("Home win", "Home or Draw", "52% → 81%"), ("Over 1.5 2nd half", "Over 0.5 2nd half", "44% → 79%")]
picks5_html = "\n".join(f"""        <div class="leg" style="height: 104px"><div class="tx"><div class="p sw"><span class="ln"><span class="li" id="st5-a{i}">{a}</span></span><span class="ln nw"><span class="li" id="st5-b{i}">{b}</span></span></div>
          <div class="f" id="st5-w{i}"><span style="color: var(--amber)">{d}</span></div></div></div>""" for i, (a, b, d) in enumerate(picks5))
write("st5.html", step_scene(5, "Make any code / safer", "safer", f"""    {tabs("st5", 0, TAB[0][0], TAB[0][1])}
    <div class="card sc" id="st5-card" style="border-color: rgba(212,255,58,.3); padding-top: 26px">
      <div class="row" style="gap: 18px">
        <div class="box"><div class="lbl">Chance</div><div class="vv"><span class="old" id="st5-o1">0.4%</span><span class="big nv" id="st5-n1">0.4%</span></div></div>
        <div class="box"><div class="lbl">Odds</div><div class="vv"><span class="old" id="st5-o2">310</span><span class="big nv" id="st5-n2">310</span></div></div>
      </div>
      <div style="margin-top: 14px">
{picks5_html}
      </div>
      <div class="go" id="st5-go">Get the new booking code</div>
    </div>""", TABS_CSS + """
    #root .box { flex: 1; border-radius: 18px; background: var(--surf2); border: 2px solid var(--line); padding: 18px 22px; }
    #root .vv { display: flex; align-items: baseline; gap: 14px; margin-top: 6px; }
    #root .old { font-size: 28px; color: var(--dim); text-decoration: line-through; }
    #root .nv { font-size: 60px; }
    #root .sw { position: relative; }
    #root .nw { position: absolute; left: 0; right: 0; top: 0; color: var(--volt); }
    #root .go { margin-top: 18px; height: 84px; border-radius: 18px; background: var(--volt); color: var(--ink-g); font-size: 32px; font-weight: 700; display: grid; place-items: center; }
""", tab_to("st5", 0, 1, 0.12) + """
    tl.set(["#st5-o1", "#st5-o2", "#st5-w0", "#st5-w1"], { opacity: 0 }, 0);
    tl.set(["#st5-b0", "#st5-b1"], { yPercent: 130 }, 0);
    tl.to(["#st5-o1", "#st5-o2"], { opacity: 1, duration: 0.2 }, 0.75);
    count("#st5-n1", 0.4, 12, 0.8, 0.9, 1, "", "%");
    count("#st5-n2", 310, 48.6, 0.8, 0.9, 1);
    [0, 1].forEach((i) => {
      tl.to("#st5-a" + i, { yPercent: -130, duration: 0.28, ease: "power3.in" }, 1.3 + i * 0.25);
      tl.set("#st5-a" + i, { autoAlpha: 0 }, 1.6 + i * 0.25);
      tl.to("#st5-b" + i, { yPercent: 0, duration: 0.5, ease: "power4.out" }, 1.42 + i * 0.25);
      tl.to("#st5-w" + i, { opacity: 1, duration: 0.3 }, 1.45 + i * 0.25);
    });
    press("#st5-go", 2.55);
""", extra_out="""    tl.to("#st5-tabs", { y: -40, opacity: 0, duration: 0.3, ease: "power3.in" }, 3.1);"""))

# --------------------------------------------------------------- step 6: track
legs6 = [("Home or Draw", "Arsenal v Fulham", "2-0 · FT"), ("Over 1.5", "Ajax v Twente", "3-1 · FT"),
         ("Home win", "Porto v Braga", "1-0 · 67'"), ("Under 9.5 corners", "Celtic v Hibs", "20:00")]
legs6_html = "\n".join(f"""        <div class="leg"><span class="dt" id="st6-d{i}"></span><div class="tx"><div class="p">{p}</div><div class="f">{f}</div></div><span class="o mono" id="st6-s{i}">{s}</span></div>""" for i, (p, f, s) in enumerate(legs6))
write("st6.html", step_scene(6, "Track it. / We'll tell you.", "tell", f"""    <div class="card sc" id="st6-card" style="top: 478px; padding-top: 26px; padding-bottom: 12px">
      <div class="row" style="margin-bottom: 12px"><span style="font-size: 32px; font-weight: 700; color: var(--chalk)">My combo · 4 games</span><span class="badge" style="color: #ff7a1a; border-color: rgba(255,122,26,.45); background: rgba(255,122,26,.1)">In play</span></div>
{legs6_html}
    </div>
    <div class="notif" id="st6-nt">
      <svg viewBox="0 0 120 120"><path d="M71.73 17.06A42 42 0 1 0 96.37 44.42L80.99 48.83A26 26 0 1 1 65.74 31.89Z" fill="#F2F4EC"/><path d="M54.59 57.41L94.89 106.2L106.2 94.89L57.41 54.59Z" fill="#D4FF3A"/><circle cx="86.47" cy="28.57" r="10" fill="#D4FF3A"/></svg>
      <div><div class="nh">KiqStat · now</div><div class="nb">Leg in ✓ Porto 2-0</div></div>
    </div>
    <div id="st6-flood"></div>""", """
    #root .notif { position: absolute; left: 120px; right: 72px; top: 318px; display: flex; gap: 22px; align-items: center; background: var(--chalk);
      color: var(--ink-g); border-radius: 26px; padding: 22px 26px; z-index: 10; box-shadow: 0 24px 50px rgba(0,0,0,.5); }
    #root .notif svg { width: 64px; height: 64px; border-radius: 16px; background: var(--ink-g); padding: 6px; flex: none; }
    #root .nh { font-size: 28px; font-weight: 700; } #root .nb { font-size: 28px; color: #3b433f; margin-top: 2px; }
    #st6-flood { position: absolute; inset: 0; background: var(--l-ground); clip-path: circle(0px at 540px 370px); z-index: 30; }
""", """
    tl.set("#st6-nt", { opacity: 0, y: -200 }, 0);
    [0, 1].forEach((i) => tl.fromTo("#st6-d" + i, { backgroundColor: "#2e3a34", scale: 0.5 }, { backgroundColor: "#d4ff3a", scale: 1, duration: 0.35, ease: "power4.out" }, 0.55 + i * 0.25));
    tl.fromTo("#st6-d2", { backgroundColor: "#2e3a34" }, { backgroundColor: "#ff7a1a", duration: 0.2 }, 1.0);
    // the third game's goal: score ticks, dot lands volt, the notification drops in
    tl.call(() => { $("#st6-s2").textContent = "1-0 · 67'"; }, null, 0);
    tl.call(() => { $("#st6-s2").textContent = "2-0 · FT"; }, null, 1.55);
    tl.fromTo("#st6-d2", { scale: 1 }, { backgroundColor: "#d4ff3a", scale: 1.5, duration: 0.1, ease: "power2.out" }, 1.55).to("#st6-d2", { scale: 1, duration: 0.3 }, 1.65);
    tl.to("#st6-nt", { opacity: 1, y: 0, duration: 0.55, ease: "power4.out" }, 1.6);
    // hand-off: the notification floods the frame chalk
    tl.fromTo("#st6-flood", { clipPath: "circle(0px at 540px 370px)" }, { clipPath: "circle(1500px at 540px 370px)", duration: 0.42, ease: "power2.inOut" }, 3.05);
"""))

# ------------------------------------------------------- S9 five habits (chalk)
HABITS = ["Fewer games.", "Strong picks.", "Chance over payout.", "Edit every code.", "Set a budget."]
hab_html = "\n".join(f"""    <div class="hb" id="hb{i}" style="top: {400 + i * 104}px"><span class="ln"><span class="li"><span class="hn">{i + 1}</span>{h}</span></span></div>""" for i, h in enumerate(HABITS))
write("s9-habits.html", scene("s9", 4.5, """
    #root { background: var(--l-ground); }
    #s9-k { position: absolute; left: 96px; top: 96px; font-size: 28px; letter-spacing: 0.18em; color: var(--olive); }
    #s9-t { top: 150px; font-size: 64px; color: var(--ink-g); }
    #s9-t .acc { color: var(--olive); }
    #root .hb { position: absolute; left: 96px; right: 60px; font-family: "Unbounded"; font-weight: 800; font-size: 58px; letter-spacing: -0.03em; color: var(--ink-g); }
    #root .hn { display: inline-block; width: 86px; color: var(--olive); }
    #s9-flood { position: absolute; inset: 0; background: var(--volt); clip-path: circle(0px at 540px 980px); z-index: 30; }
""", f"""    <div id="s9-k" class="mono">THE SMART WAY</div>
    <h1 class="t" id="s9-t">{title("Five habits that / pay off", "pay")}</h1>
{hab_html}
    <div id="s9-flood"></div>""", JS + f"""
    tl.fromTo("#s9-k", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.25 }}, 0);
    rise("#s9-t", 0.02);
    {"".join(f'rise("#hb{i}", {0.5 + i * 0.5:.2f}); ' for i in range(len(HABITS)))}
    tl.fromTo("#s9-flood", {{ clipPath: "circle(0px at 540px 980px)" }}, {{ clipPath: "circle(1500px at 540px 980px)", duration: 0.42, ease: "power2.inOut" }}, 4.05);
""", W, H))

# ----------------------------------------------- S10 claim, S11 end card (kit)
write("s10-claim.html", kq.claim_scene("s10", 2.5, "Honest chances. / Smarter combos.", W, H, size=72))
write("s11-end.html", kq.endcard_scene("s11", 3.5, 'How to use KiqStat · <span class="u">kiqstat.app</span>', "Start free",
                                        "18+ · Examples for illustration", W, H))

# ----------------------------------------------------------------- index
SCENES = [("s1", "s1-hook", 0.0, 2.5), ("s2", "s2-title", 2.5, 2.0)]
SCENES += [(f"st{n}", f"st{n}", 4.5 + (n - 1) * STEP, STEP) for n in range(1, N + 1)]
SCENES += [("s9", "s9-habits", 25.5, 4.5), ("s10", "s10-claim", 30.0, 2.5), ("s11", "s11-end", 32.5, 3.5)]
S = {sid: start for sid, _, start, _ in SCENES}

# (id, kit sfx file, picture time in film seconds, file peak seconds, volume)
SFX = [
    ("x-stop", "impact-bass", 0.10, 0.073, 0.5), ("x-smart", "pop-hollow", 1.30, 0.160, 0.5),
    ("x-fl1", "whoosh-synth", 2.12, 0.345, 0.75),
    ("x-name", "boom-low", S["s2"] + 0.25, 0.080, 0.85), ("x-zoom", "whoosh", S["s2"] + 1.62, 0.162, 0.75),
    # step 1
    ("x-1b", "pop", S["st1"] + 1.05, 0.120, 0.5), ("x-1r", "thud-muffled", S["st1"] + 1.6, 0.070, 0.55),
    # step 2
    ("x-2in", "whoosh-quick", S["st2"] + 0.02, 0.10, 0.5), ("x-2ok", "pop", S["st2"] + 1.4, 0.120, 0.5), ("x-2sa", "pop-hollow", S["st2"] + 2.15, 0.160, 0.5),
    # step 3
    ("x-3in", "whoosh-quick", S["st3"] + 0.02, 0.10, 0.5),
    ("x-3k1", "key-press", S["st3"] + 0.42, 0.076, 0.5), ("x-3k2", "key-press", S["st3"] + 0.51, 0.076, 0.45),
    ("x-3k3", "key-press", S["st3"] + 0.60, 0.076, 0.45), ("x-3k4", "key-press", S["st3"] + 0.69, 0.076, 0.45),
    ("x-3ch", "pop-hollow", S["st3"] + 2.0, 0.160, 0.55),
    # step 4
    ("x-4in", "whoosh-quick", S["st4"] + 0.02, 0.10, 0.5), ("x-4cp", "click", S["st4"] + 1.82, 0.073, 0.9),
    # step 5
    ("x-5tab", "click-sharp", S["st5"] + 0.12, 0.125, 0.6), ("x-5sw1", "pop", S["st5"] + 1.7, 0.120, 0.45), ("x-5sw2", "pop", S["st5"] + 2.0, 0.120, 0.45),
    ("x-5go", "click", S["st5"] + 2.55, 0.073, 0.8),
    # step 6
    ("x-6in", "whoosh-quick", S["st6"] + 0.02, 0.10, 0.5), ("x-6nt", "pop-hollow", S["st6"] + 1.6, 0.160, 0.6),
    ("x-fl2", "whoosh-synth", S["st6"] + 3.08, 0.345, 0.7),
    # habits
    *[(f"x-h{i}", "key-press", S["s9"] + 0.5 + i * 0.5, 0.076, 0.55) for i in range(5)],
    ("x-fl3", "whoosh-synth", S["s9"] + 4.08, 0.345, 0.7),
    ("x-shrink", "whoosh", S["s10"] + 1.95, 0.162, 0.65), ("x-mark", "impact-bass", S["s11"] + 0.48, 0.073, 0.42),
]

BGM_SRC = "/tmp/claude-0/-home-user-bet-predictore-ai/d3e51c22-61b6-5a70-9937-9e8ce3545949/scratchpad/codehub-ad/assets/bgm/afro-pop-120.mp3"
os.makedirs(os.path.join(ROOT, "assets/bgm"), exist_ok=True)
if not os.path.exists(os.path.join(ROOT, "assets/bgm/afro-pop-120.mp3")) and os.path.exists(BGM_SRC):
    shutil.copy2(BGM_SRC, os.path.join(ROOT, "assets/bgm/afro-pop-120.mp3"))
bgm = ""
if os.path.exists(os.path.join(ROOT, "assets/bgm/afro-pop-120.mp3")):
    # Music: HeyGen catalog 2b7f3438 (the house bed), entered on its downbeat as in the Code Hub ad.
    bgm = """      <audio id="bgm" class="clip" src="assets/bgm/afro-pop-120.mp3" data-start="0" data-duration="36" data-media-start="1.505" data-track-index="2" data-volume="0.8" data-fade-out="1.5"></audio>"""
else:
    print("note: assets/bgm/afro-pop-120.mp3 is missing; fetch HeyGen catalog 2b7f3438 (video/README.md, Sound)")
kq.build_index(ROOT, SCENES, SFX, bgm, duration=36, w=W, h=H)
print(f"ok: {W}x{H}, 36 s, {len(SCENES)} scenes")
