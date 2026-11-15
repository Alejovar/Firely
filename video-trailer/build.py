"""Firely trailer (EN, <=30 s). Builds index.html + compositions/*.html from the voiceover timing and real data.

Screens are real captures of the production web app and of the Android build (integration/mobile-main);
the 2012 chart is rebuilt from web/public/data/harmonization.json with English labels.
Run: python3 -I build.py
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
A = ROOT / "assets"
SCRIPT = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
SCENES = list(SCRIPT)
LEAD = {"t1": 0.45}
TAIL = {"t1": 0.0, "t2": 0.25, "t3": 0.25, "t4": 0.35, "t5": 0.3, "t6": 1.25}


def duration(path: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                                capture_output=True, text=True, check=True).stdout.strip())


TIMING, start = {}, 0.0
for s in SCENES:
    al = json.loads((A / "vo" / f"{s}.json").read_text(encoding="utf-8"))
    d = duration(A / "vo" / f"{s}.mp3")
    lead = LEAD.get(s, 0.15)
    slot = round(lead + d + TAIL[s], 2)
    TIMING[s] = {"start": round(start, 2), "slot": slot, "lead": lead, "vo": d,
                 "text": "".join(al["characters"]), "times": al["character_start_times_seconds"]}
    start += slot
TOTAL = round(start, 2)


def W(scene: str, phrase: str) -> float:
    t = TIMING[scene]
    i = t["text"].find(phrase)
    if i < 0:
        raise KeyError(f"{scene}: {phrase!r}")
    return round(t["lead"] + t["times"][i], 2)


FONTS = (A / "fonts" / "fonts.css").read_text(encoding="utf-8")
BASE = FONTS + """
#root{position:absolute;inset:0;overflow:hidden;background:#1a1f1c;color:#e9ece6;font-family:'Atkinson Hyperlegible Next',sans-serif}
.serif{font-family:'Source Serif 4',Georgia,serif}
.mono{font-family:'Atkinson Hyperlegible Mono',monospace}
.w{display:inline-block}
.laptop{position:absolute;background:#0b0e0c;border:14px solid #0b0e0c;border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden}
.laptop img{display:block;width:100%;height:100%;object-fit:cover}
.base{position:absolute;height:22px;background:#2b332e;border-radius:0 0 18px 18px}
.phone{position:absolute;background:#0b0e0c;border:12px solid #0b0e0c;border-radius:58px;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden}
.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;border-radius:44px}
.tag{position:absolute;font-size:30px;font-weight:700;color:#e9ece6;letter-spacing:.02em}
.tag b{color:#f26a1b}
"""
KF = """
function words(sel){document.querySelectorAll(sel).forEach(el=>{if(el.dataset.split)return;el.dataset.split=1;el.innerHTML=el.textContent.trim().split(/\\s+/).map(w=>`<span class="w">${w}</span>`).join(' ');});}
function wordsIn(tl,sel,at,gap=0.06){tl.fromTo(sel+' .w',{opacity:0,filter:'blur(8px)',y:10},{opacity:1,filter:'blur(0px)',y:0,duration:0.18,ease:'power3.out',stagger:gap},at);}
"""


def scene(sid, css, body, js):
    slot = TIMING[sid]["slot"]
    return f"""<template>
<style>{BASE}{css}</style>
<div id="root" data-composition-id="{sid}" data-width="1920" data-height="1080" data-start="0" data-duration="{slot}">
{body}
</div>
<script>
(function(){{
{KF}
const D={slot};
const tl=gsap.timeline({{paused:true}});
{js}
window.__timelines['{sid}']=tl;
}})();
</script>
</template>
"""


# ------------------------------------------------------------------ data
SER = json.loads((ROOT.parent / "web/public/data/harmonization.json").read_text())["countries"]["Mexico"]["series"]
RAW = [(r["year"], r["modis_raw"] if r["year"] <= 2011 else r["viirs_raw"]) for r in SER]
HARM = [(r["year"], r["harmonized"]) for r in SER]
X0, X1, YT, YB, YMAX = 260, 1660, 300, 900, 800_000


def cx(y):
    return X0 + (y - 2001) / 24 * (X1 - X0)


def cy(v):
    return YB - v / YMAX * (YB - YT)


def path(pts):
    return "M" + " L".join(f"{cx(y):.1f},{cy(v):.1f}" for y, v in pts)


AXES = "".join(
    f'<line x1="{X0}" x2="{X1}" y1="{cy(v):.0f}" y2="{cy(v):.0f}" stroke="#3a4540" stroke-width="{2 if v == 0 else 1}"/>'
    f'<text x="{X0 - 20}" y="{cy(v) + 10:.0f}" text-anchor="end" fill="#9aa69f" font-size="28" font-family="Atkinson Hyperlegible Mono">{"0" if v == 0 else f"{v // 1000}k"}</text>'
    for v in (0, 200_000, 400_000, 600_000, 800_000)) + "".join(
    f'<text x="{cx(y):.0f}" y="{YB + 46}" text-anchor="middle" fill="#9aa69f" font-size="28" font-family="Atkinson Hyperlegible Mono">{y}</text>'
    for y in (2001, 2005, 2009, 2012, 2017, 2021, 2025))
CHART = f"""<svg id="CH" viewBox="0 0 1920 1080" style="position:absolute;inset:0;width:1920px;height:1080px" data-layout-ignore>
  <rect x="{cx(2001):.0f}" y="{YT}" width="{cx(2011.5) - cx(2001):.0f}" height="{YB - YT}" fill="#e9ece6" opacity=".045"/>
  {AXES}
  <line x1="{cx(2012):.0f}" x2="{cx(2012):.0f}" y1="{YT}" y2="{YB}" stroke="#9aa69f" stroke-width="2" stroke-dasharray="6 7"/>
  <text x="{cx(2012) + 12:.0f}" y="{YT + 30}" fill="#9aa69f" font-size="28" font-family="Atkinson Hyperlegible Next">VIIRS starts</text>
  <path id="RAW" d="{path(RAW)}" pathLength="100" fill="none" stroke="#c9d1cb" stroke-width="6" stroke-dasharray="100 120" stroke-dashoffset="110" stroke-linejoin="round"/>
  <path id="HARM" d="{path(HARM)}" pathLength="100" fill="none" stroke="#f26a1b" stroke-width="8" stroke-dasharray="100 120" stroke-dashoffset="110" stroke-linejoin="round"/>
  <text id="RAWL" x="{cx(2025) + 16:.0f}" y="{cy(RAW[-1][1]) + 10:.0f}" fill="#c9d1cb" font-size="32" font-weight="700" font-family="Atkinson Hyperlegible Next">Raw</text>
  <text id="HARML" x="{cx(2025) + 16:.0f}" y="{cy(HARM[-1][1]) + 10:.0f}" fill="#f26a1b" font-size="32" font-weight="700" font-family="Atkinson Hyperlegible Next">Firely</text>
</svg>"""


# ------------------------------------------------------------------ t1 hook: the real web map, fires of March 2021
def t1():
    s, slot = "t1", TIMING["t1"]["slot"]
    nasa = W(s, "NASA")
    css = """
#t1-cam{position:absolute;left:0;top:0;width:1920px;height:1080px}
#t1-map{position:absolute;left:-40px;top:-300px;width:2000px;height:auto}
#t1-shade{position:absolute;inset:0;background:radial-gradient(ellipse at 60% 40%, rgba(26,31,28,0) 35%, rgba(26,31,28,.85) 100%)}
#t1-k{position:absolute;left:110px;top:640px;font-size:44px;font-weight:700;color:#f26a1b;letter-spacing:.04em}
#t1-h{position:absolute;left:104px;top:700px;width:1500px;font-size:132px;font-weight:600;line-height:1;letter-spacing:-.01em;text-shadow:0 6px 30px rgba(0,0,0,.6)}
#t1-c{position:absolute;right:30px;bottom:20px;font-size:22px;color:#c9d1cb;background:rgba(26,31,28,.75);padding:4px 10px;border-radius:6px}
"""
    body = f"""
<div id="t1-cam" class="clip" data-start="0" data-duration="{slot}"><img id="t1-map" src="assets/shots/web_map.jpg" alt="Firely web map, Sierra de Arteaga, March 2021"></div>
<div id="t1-shade" class="clip" data-start="0" data-duration="{slot}"></div>
<div id="t1-k" class="clip" data-start="0.3" data-duration="{slot - 0.3}">SIERRA DE ARTEAGA · MARCH 2021</div>
<div id="t1-h" class="serif clip" data-start="{nasa - 0.2}" data-duration="{slot - nasa + 0.2}">25 years of fire, seen from space</div>
<div id="t1-c" class="clip" data-start="0" data-duration="{slot}" data-layout-ignore>Firely web app · NASA FIRMS</div>
"""
    js = f"""
tl.fromTo('#t1-map',{{scale:1.18,x:-60,y:20,transformOrigin:'62% 62%'}},{{scale:1.0,x:0,y:0,duration:D-0.25,ease:'power2.out'}},0);
tl.fromTo('#t1-k',{{opacity:0,x:-24,filter:'blur(6px)'}},{{opacity:1,x:0,filter:'blur(0px)',duration:0.5,ease:'expo.out'}},0.3);
words('#t1-h');wordsIn(tl,'#t1-h',{nasa - 0.2},0.07);
tl.to(['#t1-h','#t1-k'],{{opacity:0,filter:'blur(10px)',duration:0.2,ease:'power3.in'}},D-0.22);
tl.to('#t1-map',{{scale:1.25,filter:'blur(6px)',duration:0.25,ease:'power3.in'}},D-0.25);
"""
    return scene(s, css, body, js)


# ------------------------------------------------------------------ t2 the fake jump
def t2():
    s, slot = "t2", TIMING["t2"]["slot"]
    y2012, broke = W(s, "2012"), W(s, "broke")
    css = """
#t2-h{position:absolute;left:120px;top:90px;font-size:84px;font-weight:600;margin:0}
#t2-st{position:absolute;left:1040px;top:430px;padding:14px 30px;border:8px solid #f26a1b;color:#f26a1b;border-radius:10px;font-size:92px;font-weight:700;letter-spacing:.05em;background:rgba(26,31,28,.9)}
#t2-shake{position:absolute;inset:0}
"""
    body = f"""
<div id="t2-shake" class="clip" data-start="0" data-duration="{slot}">{{T2_CHART}}</div>
<h1 id="t2-h" class="serif clip" data-start="0" data-duration="{slot}">Then the satellite changed</h1>
<div id="t2-st" class="serif clip" data-start="{broke - 0.05}" data-duration="{slot - broke + 0.05}">FAKE JUMP</div>
"""
    T2_CHART = "\n".join(l for l in CHART.replace('id="', 'id="t2-').split("\n") if 't2-HARM' not in l)
    body = body.replace("{T2_CHART}", T2_CHART)
    shakes = "".join(f"tl.set('#t2-shake',{{x:{dx},y:{dy}}},{broke + 0.033 * i:.3f});"
                     for i, (dx, dy) in enumerate([(14, -8), (-12, 6), (9, 5), (-6, -4), (3, 2), (0, 0)]))
    js = f"""
words('#t2-h');wordsIn(tl,'#t2-h',0.05);
tl.fromTo('#t2-RAW',{{strokeDashoffset:110}},{{strokeDashoffset:0,duration:{broke - 0.4},ease:'power1.in'}},0.2);
tl.fromTo('#t2-RAWL',{{opacity:0}},{{opacity:1,duration:0.2}},{broke - 0.3});
{shakes}
tl.fromTo('#t2-st',{{opacity:0,scale:1.9,rotation:-16}},{{opacity:1,scale:1,rotation:-8,duration:0.18,ease:'power4.in'}},{broke - 0.05});
tl.to(['#t2-h','#t2-st'],{{opacity:0,filter:'blur(8px)',duration:0.2,ease:'power3.in'}},D-0.22);
"""
    return scene(s, css, body, js)


# ------------------------------------------------------------------ t3 Firely: one series
def t3():
    s, slot = "t3", TIMING["t3"]["slot"]
    stitches, one = W(s, "stitches"), W(s, "one honest")
    css = """
#t3-logo{position:absolute;left:120px;top:70px;width:150px;height:150px}
#t3-name{position:absolute;left:300px;top:78px;font-size:120px;font-weight:700;margin:0;line-height:1}
#t3-sub{position:absolute;left:304px;top:206px;font-size:40px;color:#c9d1cb}
#t3-sub b{color:#f26a1b}
"""
    body = f"""
<div id="t3-ch" class="clip" data-start="0" data-duration="{slot}">{CHART.replace('id="', 'id="t3-').replace('id="t3-RAW" d=', 'id="t3-RAW" style="stroke-dashoffset:0" d=')}</div>
<svg id="t3-logo" class="clip" data-start="0" data-duration="{slot}" viewBox="0 0 512 512">
  <path id="t3-hex" d="M256 70 L417 163 Q429 170 429 184 L429 328 Q429 342 417 349 L270 434 Q256 442 242 434 L95 349 Q83 342 83 328 L83 184 Q83 170 95 163 L242 78 Q249 74 256 70 Z" fill="#f26a1b"/>
  <path d="M256 140 C300 200 344 236 334 310 C326 368 292 398 256 398 C220 398 186 368 178 310 C172 262 204 236 220 196 C228 232 242 250 258 254 C248 214 240 178 256 140 Z" fill="#1a1f1c"/>
  <path id="t3-drop" d="M256 300 C276 322 288 338 284 358 C280 376 268 386 256 386 C244 386 232 376 228 358 C225 342 238 326 256 300 Z" fill="#7cc7ff"/>
</svg>
<h1 id="t3-name" class="serif clip" data-start="0" data-duration="{slot}">Firely</h1>
<div id="t3-sub" class="clip" data-start="{stitches}" data-duration="{slot - stitches}">MODIS + VIIRS → <b>one series</b>, 2001–2026</div>
"""
    js = f"""
tl.fromTo('#t3-logo',{{scale:0.2,rotation:-30,opacity:0,transformOrigin:'50% 50%'}},{{scale:1,rotation:0,opacity:1,duration:0.55,ease:'back.out(2)'}},0.0);
tl.fromTo('#t3-drop',{{y:-200,opacity:0}},{{y:0,opacity:1,duration:0.45,ease:'bounce.out'}},0.35);
tl.fromTo('#t3-name',{{opacity:0,x:-30,filter:'blur(12px)'}},{{opacity:1,x:0,filter:'blur(0px)',duration:0.35,ease:'expo.out'}},0.15);
tl.fromTo('#t3-sub',{{opacity:0,filter:'blur(8px)'}},{{opacity:1,filter:'blur(0px)',duration:0.25}},{stitches});
tl.to('#t3-RAW',{{opacity:0.3,duration:0.5}},{stitches});
tl.fromTo('#t3-HARM',{{strokeDashoffset:110}},{{strokeDashoffset:0,duration:{one - stitches + 0.6},ease:'power2.inOut'}},{stitches});
tl.fromTo('#t3-HARML',{{opacity:0,x:-10}},{{opacity:1,x:0,duration:0.3}},{one + 0.5});
tl.to('#t3-ch',{{scale:0.45,x:-300,y:200,opacity:0,duration:0.3,ease:'power3.in'}},D-0.3);
tl.to(['#t3-logo','#t3-name','#t3-sub'],{{opacity:0,filter:'blur(8px)',duration:0.22,ease:'power3.in'}},D-0.25);
"""
    return scene(s, css, body, js)


# ------------------------------------------------------------------ t4 proof: web + mobile
def t4():
    s, slot = "t4", TIMING["t4"]["slot"]
    pocket, normal, coming = W(s, "carry it"), W(s, "See what's normal"), W(s, "what's coming")
    lx, ly, lw, lh = 70, 150, 1160, 653   # laptop screen box
    px, py, pw, ph = 1390, 70, 420, 909   # phone screen box
    css = f"""
#t4-lap{{left:{lx}px;top:{ly}px;width:{lw}px;height:{lh}px}}
#t4-base{{left:{lx - 60}px;top:{ly + lh + 28}px;width:{lw + 120}px}}
#t4-ph{{left:{px}px;top:{py}px;width:{pw}px;height:{ph}px}}
.t4-m{{position:absolute;inset:0}}
#t4-tw{{left:{lx}px;top:{ly + lh + 70}px}}
#t4-tm{{left:{px + 30}px;top:{py + ph + 18}px;font-size:28px}}
#t4-card{{position:absolute;left:{lx + 200}px;top:{ly + 60}px;width:780px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);border:2px solid #3a4540}}
#t4-out{{position:absolute;left:{lx + 170}px;top:{ly + 200}px;width:820px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);border:2px solid #3a4540}}
"""
    body = f"""
<div id="t4-lap" class="laptop clip" data-start="0" data-duration="{slot}"><img id="t4-web" src="assets/shots/web_full.jpg" alt="Firely web app: 3D map, calendar and outlook"></div>
<div id="t4-base" class="base clip" data-start="0" data-duration="{slot}"></div>
<div id="t4-tw" class="tag clip" data-start="0" data-duration="{slot}">On the <b>web</b></div>
<div id="t4-ph" class="phone clip" data-start="{pocket - 0.3}" data-duration="{slot - pocket + 0.3}">
  <img id="t4-m1" class="t4-m" src="assets/shots/m_map.jpg" alt="Firely Android app, map">
  <img id="t4-m2" class="t4-m" src="assets/shots/m_cal.jpg" alt="Firely Android app, calendar">
  <img id="t4-m3" class="t4-m" src="assets/shots/m_field.jpg" alt="Firely Android app, field areas">
</div>
<div id="t4-tm" class="tag clip" data-start="{pocket}" data-duration="{slot - pocket}">In your <b>pocket</b> · Android</div>
<img id="t4-card" class="clip" data-start="{normal}" data-duration="{slot - normal}" src="assets/shots/web_card.png" alt="84.8 times above the median">
<img id="t4-out" class="clip" data-start="{coming - 0.1}" data-duration="{slot - coming + 0.1}" src="assets/shots/web_outlook.png" alt="1-3 month outlook">
"""
    js = f"""
tl.fromTo('#t4-lap',{{y:120,opacity:0,scale:1.08}},{{y:0,opacity:1,scale:1,duration:0.55,ease:'expo.out'}},0);
tl.fromTo('#t4-base',{{y:120,opacity:0}},{{y:0,opacity:1,duration:0.55,ease:'expo.out'}},0.03);
tl.fromTo('#t4-web',{{scale:1.0,transformOrigin:'30% 60%'}},{{scale:1.06,duration:D,ease:'none'}},0);
tl.fromTo('#t4-tw',{{opacity:0,x:-20}},{{opacity:1,x:0,duration:0.3}},0.35);
tl.fromTo('#t4-ph',{{x:520,rotation:8}},{{x:0,rotation:0,duration:0.6,ease:'back.out(1.3)'}},{pocket - 0.3});
tl.fromTo('#t4-tm',{{opacity:0}},{{opacity:1,duration:0.3}},{pocket + 0.2});
tl.set('#t4-m2,#t4-m3',{{opacity:0}},0);
tl.fromTo('#t4-m2',{{opacity:0,y:40}},{{opacity:1,y:0,duration:0.25,ease:'power2.out'}},{normal + 0.2});
tl.fromTo('#t4-m3',{{opacity:0,y:40}},{{opacity:1,y:0,duration:0.25,ease:'power2.out'}},{coming + 0.1});
tl.fromTo('#t4-card',{{opacity:0,scale:0.5,x:420,y:-60,transformOrigin:'100% 0%'}},{{opacity:1,scale:1,x:0,y:0,duration:0.45,ease:'expo.out'}},{normal});
tl.to('#t4-card',{{opacity:0,y:-30,duration:0.2,ease:'power3.in'}},{coming - 0.15});
tl.fromTo('#t4-out',{{opacity:0,scale:0.5,x:420,y:260,transformOrigin:'100% 100%'}},{{opacity:1,scale:1,x:0,y:0,duration:0.45,ease:'expo.out'}},{coming - 0.1});
tl.to(['#t4-lap','#t4-base','#t4-tw','#t4-out'],{{x:-200,opacity:0,filter:'blur(6px)',duration:0.25,ease:'power3.in'}},D-0.27);
"""
    return scene(s, css, body, js)


# ------------------------------------------------------------------ t5 Gotita + alert
def t5():
    s, slot = "t5", TIMING["t5"]["slot"]
    alert = W(s, "Get an alert")
    css = """
#t5-web{left:70px;top:150px;width:1160px;height:653px}
#t5-base{left:10px;top:831px;width:1280px}
#t5-ph{left:1390px;top:70px;width:420px;height:909px}
#t5-g{position:absolute;left:1040px;top:600px;width:430px}
#t5-h{position:absolute;left:84px;top:40px;font-size:76px;font-weight:600;margin:0}
#t5-n{position:absolute;left:440px;top:-10px;width:1040px;padding:22px 28px;border-radius:22px;background:#17212b;border:2px solid #2b5278;box-shadow:0 24px 60px rgba(0,0,0,.6);font-size:30px;line-height:1.35;color:#fff;display:flex;gap:20px;align-items:flex-start}
#t5-n img{width:64px;height:64px;border-radius:50%}
#t5-n b{display:block;font-size:30px}
#t5-n .x{color:#ffb37e;font-weight:700}
"""
    body = f"""
<h1 id="t5-h" class="serif clip" data-start="0" data-duration="{slot}">Ask Gotita</h1>
<div id="t5-web" class="laptop clip" data-start="0" data-duration="{slot}"><img src="assets/shots/web_chat.jpg" alt="Gotita answering on the web app"></div>
<div id="t5-base" class="base clip" data-start="0" data-duration="{slot}"></div>
<div id="t5-ph" class="phone clip" data-start="0" data-duration="{slot}"><img src="assets/shots/m_chat.jpg" alt="Gotita answering on the Android app"></div>
<img id="t5-g" class="clip" data-start="0.15" data-duration="{slot - 0.15}" src="assets/img/bombera.png" alt="Firefighter Gotita">
<div id="t5-n" class="clip" data-start="{alert}" data-duration="{slot - alert}"><img src="assets/img/logo.svg" alt=""><div><b>Firely · Gotita</b><span class="x">[EXERCISE / TEST]</span> Sierra de Arteaga: 84.8× the March median.</div></div>
"""
    js = f"""
words('#t5-h');wordsIn(tl,'#t5-h',0.0);
tl.fromTo('#t5-web',{{x:-200,opacity:0}},{{x:0,opacity:1,duration:0.35,ease:'expo.out'}},0);
tl.fromTo('#t5-base',{{x:-200,opacity:0}},{{x:0,opacity:1,duration:0.35,ease:'expo.out'}},0.02);
tl.fromTo('#t5-g',{{y:500,scaleY:0.8,rotation:10}},{{y:0,scaleY:1,rotation:-4,duration:0.6,ease:'back.out(1.6)'}},0.15);
tl.to('#t5-g',{{rotation:3,y:-12,duration:0.4,ease:'sine.inOut',yoyo:true,repeat:3}},0.8);
tl.fromTo('#t5-n',{{y:-200,opacity:0}},{{y:110,opacity:1,duration:0.45,ease:'back.out(1.4)'}},{alert});
tl.to(['#t5-web','#t5-base','#t5-ph','#t5-g','#t5-n','#t5-h'],{{opacity:0,scale:0.96,filter:'blur(8px)',duration:0.25,ease:'power3.in'}},D-0.27);
"""
    return scene(s, css, body, js)


# ------------------------------------------------------------------ t6 end card
def t6():
    s, slot = "t6", TIMING["t6"]["slot"]
    name, one = W(s, "Firely"), W(s, "One series")
    css = """
#t6-logo{position:absolute;left:810px;top:150px;width:300px;height:300px}
#t6-name{position:absolute;left:0;width:1920px;top:470px;text-align:center;font-size:170px;font-weight:700;margin:0;line-height:1}
#t6-tag{position:absolute;left:0;width:1920px;top:690px;text-align:center;font-size:58px;margin:0}
#t6-tag b{color:#f26a1b;font-weight:700}
#t6-foot{position:absolute;left:0;width:1920px;top:900px;text-align:center;font-size:30px;color:#9aa69f}
"""
    body = f"""
<svg id="t6-logo" class="clip" data-start="0" data-duration="{slot}" viewBox="0 0 512 512">
  <path id="t6-hex" d="M256 70 L417 163 Q429 170 429 184 L429 328 Q429 342 417 349 L270 434 Q256 442 242 434 L95 349 Q83 342 83 328 L83 184 Q83 170 95 163 L242 78 Q249 74 256 70 Z" fill="#f26a1b"/>
  <path id="t6-flame" d="M256 140 C300 200 344 236 334 310 C326 368 292 398 256 398 C220 398 186 368 178 310 C172 262 204 236 220 196 C228 232 242 250 258 254 C248 214 240 178 256 140 Z" fill="#1a1f1c"/>
  <path id="t6-drop" d="M256 300 C276 322 288 338 284 358 C280 376 268 386 256 386 C244 386 232 376 228 358 C225 342 238 326 256 300 Z" fill="#7cc7ff"/>
  <circle id="t6-sat" cx="414" cy="92" r="26" fill="#e9ece6"/>
  <path id="t6-orb" d="M352 64 A72 72 0 0 1 444 154" fill="none" stroke="#e9ece6" stroke-width="10" stroke-linecap="round" opacity=".55"/>
</svg>
<h1 id="t6-name" class="serif clip" data-start="0" data-duration="{slot}">Firely</h1>
<p id="t6-tag" class="clip" data-start="0" data-duration="{slot}">25 years of fire. <b>One series.</b></p>
<div id="t6-foot" class="clip" data-start="0" data-duration="{slot}">Web + Android · NASA Space Apps Challenge 2026 · Data: NASA FIRMS</div>
"""
    js = f"""
tl.fromTo('#t6-hex',{{scale:0.3,opacity:0,transformOrigin:'50% 50%'}},{{scale:1,opacity:1,duration:0.6,ease:'back.out(1.8)'}},0.0);
tl.fromTo('#t6-flame',{{scaleY:0,transformOrigin:'50% 100%'}},{{scaleY:1,duration:0.45,ease:'expo.out'}},0.25);
tl.fromTo('#t6-drop',{{y:-260,opacity:0}},{{y:0,opacity:1,duration:0.5,ease:'bounce.out'}},0.5);
tl.fromTo('#t6-sat',{{rotation:-90,svgOrigin:'256 256',opacity:0}},{{rotation:0,svgOrigin:'256 256',opacity:1,duration:0.8,ease:'power3.out'}},0.35);
tl.fromTo('#t6-orb',{{opacity:0}},{{opacity:0.55,duration:0.4}},0.8);
tl.fromTo('#t6-name',{{opacity:0,filter:'blur(12px)',scale:1.06}},{{opacity:1,filter:'blur(0px)',scale:1,duration:0.3,ease:'expo.out'}},{name});
tl.fromTo('#t6-tag',{{opacity:0,filter:'blur(10px)',y:12}},{{opacity:1,filter:'blur(0px)',y:0,duration:0.3,ease:'power3.out'}},{name + 0.6});
tl.fromTo('#t6-foot',{{opacity:0}},{{opacity:1,duration:0.4}},{name + 0.9});
"""
    return scene(s, css, body, js)


# ------------------------------------------------------------------ sound
def audio():
    T = lambda s, t=0.0: round(TIMING[s]["start"] + t, 2)
    plan = [  # (id, file, start, volume, extra attrs)
        ("drone", "drone", 0.0, 0.55, f' data-duration="{round(min(12.0, TIMING["t3"]["start"] + 0.3), 2)}" data-fade-out="0.8"'),
        ("boom1", "boom", 0.03, 0.9, ""),
        ("riser", "riser", T("t3") - 2.9, 0.6, ""),
        ("glitch", "glitch", T("t2", W("t2", "broke")) + 0.03, 0.9, ""),
        ("boom2", "boom2", T("t2", W("t2", "broke")) + 0.03, 0.8, ""),
        ("boom3", "boom", T("t3") + 0.03, 0.9, ""),
        ("pulse", "pulse", T("t3"), 0.42, f' data-duration="{round(min(16.0, T("t6") - T("t3") + 0.6), 2)}" data-fade-in="0.2" data-fade-out="0.6"'),
        ("wh1", "whoosh", T("t2") - 0.2, 0.6, ""), ("wh2", "whoosh2", T("t4") - 0.2, 0.6, ""),
        ("wh3", "whoosh", T("t4", W("t4", "carry it")) - 0.3, 0.6, ""), ("wh4", "whoosh2", T("t5") - 0.2, 0.6, ""),
        ("pop1", "pop", T("t4", W("t4", "See what's normal")) + 0.03, 0.7, ""),
        ("pop2", "pop", T("t4", W("t4", "what's coming")) - 0.07, 0.7, ""),
        ("boing", "boing", T("t5", 0.45), 0.6, ""),
        ("notify", "notify", T("t5", W("t5", "Get an alert")) + 0.03, 0.9, ""),
        ("boom4", "boom2", T("t6") + 0.03, 0.9, ""),
    ]
    out = []
    for i, (aid, f, st, vol, extra) in enumerate(plan):
        d = duration(A / "audio" / f"{f}.mp3")
        if "data-duration" not in extra:
            extra = f' data-duration="{round(d, 2)}"' + extra
        out.append(f'<audio id="{aid}" class="clip" src="assets/audio/{f}.mp3" data-start="{max(0.0, round(st, 2))}" data-track-index="{5 + i % 3}" data-volume="{vol}"{extra}></audio>')
    for s in SCENES:
        out.append(f'<audio id="vo-{s}" class="clip" src="assets/vo/{s}.mp3" data-start="{T(s, TIMING[s]["lead"])}" data-duration="{round(TIMING[s]["vo"], 2)}" data-track-index="3" data-volume="1"></audio>')
    return "\n      ".join(out)


def index():
    hosts = "\n      ".join(
        f'<div id="{s}" data-composition-id="{s}" data-composition-src="compositions/{s}.html" data-start="{TIMING[s]["start"]}" '
        f'data-duration="{TIMING[s]["slot"]}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>'
        for s in SCENES)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #1a1f1c; }}
      #ground {{ position: absolute; inset: 0; background: #1a1f1c; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
      <div id="ground"></div>
      {hosts}
      {audio()}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""


if __name__ == "__main__":
    (ROOT / "compositions").mkdir(exist_ok=True)
    for name, fn in [("t1", t1), ("t2", t2), ("t3", t3), ("t4", t4), ("t5", t5), ("t6", t6)]:
        (ROOT / "compositions" / f"{name}.html").write_text(fn(), encoding="utf-8")
    (ROOT / "index.html").write_text(index(), encoding="utf-8")
    print("total", TOTAL, {s: (TIMING[s]["start"], TIMING[s]["slot"]) for s in SCENES})
