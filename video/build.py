"""Builds the HyperFrames project (index.html + compositions/*.html) from real Firely data and the voiceover timing.

Run:  python3 -I build.py            (uses assets/vo/<scene>.mp3 + .json if present, else the provisional tmp_<scene>.*)
Every number on screen comes from data/ (FIRMS-derived Firely outputs); nothing is typed by hand except copy.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import sys

ROOT = Path(__file__).parent
A = ROOT / "assets"
LANG = sys.argv[1] if len(sys.argv) > 1 else "es"
OUT = ROOT if LANG == "es" else ROOT.parent / f"video-{LANG}"
VO = A / "vo" if LANG == "es" else A / "vo" / LANG
SCRIPT = json.loads((ROOT / ("script.json" if LANG == "es" else f"script_{LANG}.json")).read_text(encoding="utf-8"))
SCENES = list(SCRIPT)
LEAD, TAIL = 0.45, 0.55
TAILS = {"s6": 2.2, "s7": 3.2}


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def vtt_cues(path: Path):
    text = path.read_text(encoding="utf-8")
    cues = []
    for m in re.finditer(r"(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)\n(.+?)(?:\n\n|\Z)", text, re.S):
        g = [int(x) for x in m.groups()[:8]]
        a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        b = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        cues.append((a, b, m.group(9).strip()))
    return cues


def char_times(scene: str):
    """(text, [time of each char]) for the voiceover of a scene."""
    text = SCRIPT[scene]
    final = VO / f"{scene}.json"
    if final.exists():  # ElevenLabs alignment: characters + character_start_times_seconds
        al = json.loads(final.read_text(encoding="utf-8"))
        return "".join(al["characters"]), al["character_start_times_seconds"]
    cues = vtt_cues(A / "vo" / f"tmp_{scene}.vtt")
    times = [0.0] * len(text)
    pos = 0
    for a, b, sentence in cues:
        i = text.find(sentence, pos)
        if i < 0:
            continue
        for j in range(len(sentence)):
            times[i + j] = a + (b - a) * j / max(1, len(sentence))
        pos = i + len(sentence)
    return text, times


def vo_file(scene: str) -> Path:
    final = VO / f"{scene}.mp3"
    return final if final.exists() else A / "vo" / f"tmp_{scene}.mp3"


TIMING = {}
start = 0.0
for s in SCENES:
    d = duration(vo_file(s))
    text, times = char_times(s)
    slot = round(LEAD + d + TAILS.get(s, TAIL), 2)
    TIMING[s] = {"start": round(start, 2), "slot": slot, "vo": d, "text": text, "times": times}
    start += slot
TOTAL = round(start, 2)


def W(scene: str, phrase: str, nth: int = 0) -> float:
    """Scene-local time (s) at which the voice starts saying `phrase`."""
    t = TIMING[scene]
    i = -1
    for _ in range(nth + 1):
        i = t["text"].find(phrase, i + 1)
    if i < 0:
        raise KeyError(f"{scene}: '{phrase}' not in voiceover")
    return round(LEAD + t["times"][i], 2)


CUE = {
    "es": {"q": "¿Fue", "look": "Para saberlo", "desde": "Desde dos mil doce", "viirs": "VIIRS", "pix": "píxeles",
           "crudos": "En los datos crudos", "golpe": "de golpe", "falso": "Ese salto", "falso_w": "falso",
           "escala": "a la escala", "celda": "celda por celda", "prob": "Lo probamos", "baja": "el error baja",
           "marzo": "marzo de dos mil", "ochenta": "casi ochenta", "algo": "Algo así",
           "curiosa": "curiosa", "bombera": "bombera", "cientifica": "científica", "sin": "Sin inventar",
           "tele": "Gotita te avisa", "name": "Firely", "tag": "Veinticinco", "foot": "en una sola serie"},
    "en": {"q": "Was it", "look": "To find out", "desde": "Since 2012", "viirs": "VIIRS", "pix": "pixels",
           "crudos": "In the raw data", "golpe": "overnight", "falso": "That jump", "falso_w": "fake",
           "escala": "onto the VIIRS", "celda": "cell by cell", "prob": "We tested", "baja": "the error drops",
           "marzo": "March 2021", "ochenta": "almost eighty", "algo": "Something like",
           "curiosa": "curious", "bombera": "firefighter", "cientifica": "scientist", "sin": "No made-up",
           "tele": "Gotita alerts", "name": "Firely", "tag": "Twenty-five", "foot": "in a single series"},
}[LANG]


def C(scene: str, key: str) -> float:
    return W(scene, CUE[key])


T = {
    "es": {
        "march": "marzo de 2021", "days": "`1 – ${lastDay} de marzo de 2021`", "detections": "detecciones FIRMS",
        "q": "¿Fue el peor fuego en 20 años?", "look": "Para saberlo, hay que mirar atrás.",
        "s2t": "Puntos de calor en México, por año", "s2s": "Datos crudos de NASA FIRMS, sin armonizar",
        "arrives": "2012: llega VIIRS", "stamp": "SALTO FALSO", "k": " mil",
        "pixel": "1 píxel MODIS = 1 km", "diagram": "Esquema",
        "s3t": "La misma historia, en una sola serie", "s3s": "Armonizada a un VIIRS S-NPP, México por año",
        "est": "2001–2011: estimado desde MODIS", "harm": "Serie armonizada",
        "val": "Validación dejando un año fuera, 2012–2025, contra un factor fijo.", "mx": "México",
        "s4t": "Calendario de actividad", "s4s": "Sierra de Arteaga, Coahuila · puntos de calor armonizados por mes, 2001–2026",
        "months": "EFMAMJJASOND", "legend": "· barra gris: estimado desde MODIS", "chip": "Muy por encima de lo normal",
        "card": "Marzo 2021: {p} puntos; lo normal serían unos {n}.", "ret": "Un marzo así ocurre <b>1 vez cada {r} años</b>.",
        "s5t": "Pregunta a Gotita",
        "g_cur": ("Gotita curiosa", "En marzo de 2021 hubo muchísimo más fuego de lo normal: unas {r85} veces más."),
        "g_bom": ("Gotita bombera", "Marzo 2021: {p} puntos contra unos {n} normales. Un mes para estar preparados."),
        "g_cie": ("Gotita científica", "{ratio}× la mediana · percentil {pc} · periodo de retorno ≈ {r} años."),
        "s5foot": "El asistente solo interpreta y redacta; las cifras salen de la serie armonizada de NASA FIRMS.",
        "alert": "<span class=\"x\">[EJERCICIO / PRUEBA]</span> Mensaje de prueba de Firely; no es una alerta oficial.<br><br>Área: Sierra de Arteaga, Coahuila<br>Anomalía de marzo 2021: {ratio}× la mediana del mismo mes.<br><br>Fuente: NASA FIRMS",
        "s7tag": "25 años de fuego en una sola serie",
        "s7foot": "Datos: NASA FIRMS (MODIS C6.1 · VIIRS 375 m) · NASA Space Apps Challenge 2026",
    },
    "en": {
        "march": "March 2021", "days": "`March 1–${lastDay}, 2021`", "detections": "FIRMS detections",
        "q": "Was it the worst fire in 20 years?", "look": "To find out, we have to look back.",
        "s2t": "Hotspots in Mexico, per year", "s2s": "Raw NASA FIRMS data, not harmonized",
        "arrives": "2012: VIIRS arrives", "stamp": "FAKE JUMP", "k": "k",
        "pixel": "1 MODIS pixel = 1 km", "diagram": "Diagram",
        "s3t": "One story, one consistent series", "s3s": "Harmonized to one VIIRS S-NPP, Mexico per year",
        "est": "2001–2011: estimated from MODIS", "harm": "Harmonized series",
        "val": "Leave-one-year-out validation, 2012–2025, against a fixed factor.", "mx": "Mexico",
        "s4t": "Activity calendar", "s4s": "Sierra de Arteaga, Coahuila · harmonized hotspots per month, 2001–2026",
        "months": "JFMAMJJASOND", "legend": "· grey bar: estimated from MODIS", "chip": "Far above normal",
        "card": "March 2021: {p} hotspots; normal would be about {n}.", "ret": "A March like this happens <b>once every {r} years</b>.",
        "s5t": "Ask Gotita",
        "g_cur": ("Curious Gotita", "In March 2021 there was way more fire than normal: about {r85} times more."),
        "g_bom": ("Firefighter Gotita", "March 2021: {p} hotspots vs. about {n} normally. A month to be ready for."),
        "g_cie": ("Scientist Gotita", "{ratio}× the median · {pc}th percentile · return period ≈ {r} years."),
        "s5foot": "The assistant only interprets and writes; the figures come from the harmonized NASA FIRMS series.",
        "alert": "<span class=\"x\">[EXERCISE / TEST]</span> Firely test message; not an official alert.<br><br>Area: Sierra de Arteaga, Coahuila<br>March 2021 anomaly: {ratio}× the median for the same month.<br><br>Source: NASA FIRMS",
        "s7tag": "25 years of fire in a single series",
        "s7foot": "Data: NASA FIRMS (MODIS C6.1 · VIIRS 375 m) · NASA Space Apps Challenge 2026",
    },
}[LANG]


FONTS = (A / "fonts" / "fonts.css").read_text(encoding="utf-8")
BASE_CSS = FONTS + """
#root{position:absolute;inset:0;overflow:hidden;background:#1a1f1c;color:#e9ece6;font-family:'Atkinson Hyperlegible Next',sans-serif}
.serif{font-family:'Source Serif 4',Georgia,serif}
.mono{font-family:'Atkinson Hyperlegible Mono',monospace}
.panel{background:#232a26;border:1px solid #3a4540;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.w{display:inline-block}
"""

FLAME_JS = """
const FLAME_PATHS=['M1-25C6-14 14-12 12-3c4-1 5-5 5-8 10 12 7 25-3 29C3 23-11 19-15 10c-5-11 2-19 5-27 1 7 5 10 7 10C-5-14 1-17 1-25Z','M2-7c0 7-7 10-6 16 1 6 8 8 12 4C13 8 8 2 7-1 7 3 4 4 4 4 5 0 3-3 2-7Z','M3 5c-1 4-4 5-3 8 1 3 5 3 6 0 1-3-1-5-3-8Z'];
const FLAME_PALETTES=[['#f07836','#ffba68','#fff0ba'],['#f6c945','#ffe795','#fff9df'],['#397df5','#70cfff','#e1f7ff'],['#8e969e','#bcc4cb','#edf0f3']];
const FP=FLAME_PATHS.map(p=>new Path2D(p));
function drawFlame(ctx,x,y,size,level,t,seed){
  const sway=Math.sin((t+seed)*Math.PI*2/1.7), flick=0.925+0.075*Math.cos((t+seed)*Math.PI*2/1.1);
  const c=FLAME_PALETTES[level];
  ctx.save();ctx.translate(x,y);ctx.scale(size/48,size/48);ctx.rotate(sway*0.06);ctx.scale(1,1+sway*0.04);ctx.translate(0,-18);
  for(let i=0;i<3;i++){ctx.save();if(i===1){ctx.translate(0,17);ctx.scale(flick,flick);ctx.translate(0,-17);}
    ctx.fillStyle=c[i];ctx.fill(FP[i]);if(i===0){ctx.strokeStyle=c[1];ctx.lineWidth=0.7;ctx.stroke(FP[i]);}ctx.restore();}
  ctx.restore();
}
function flameSVG(level,size){const c=FLAME_PALETTES[level];return `<svg width="${size}" height="${size}" viewBox="-24 -28 52 52">${FLAME_PATHS.map((p,i)=>`<path d="${p}" fill="${c[i]}"/>`).join('')}</svg>`;}
"""

KF_JS = """
function kf(t,keys){ // keys: [[t,v,ease?],...] ease names from gsap
  if(t<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++){const [t1,v1,e]=keys[i],[t0,v0]=keys[i-1];
    if(t<=t1){const p=(t-t0)/Math.max(1e-6,t1-t0);const f=gsap.parseEase(e||'power2.inOut')(p);return v0+(v1-v0)*f;}}
  return keys[keys.length-1][1];
}
function words(sel){document.querySelectorAll(sel).forEach(el=>{if(el.dataset.split)return;el.dataset.split=1;el.innerHTML=el.textContent.trim().split(/\\s+/).map(w=>`<span class="w">${w}</span>`).join(' ');});}
function wordsIn(tl,sel,at,gap=0.07){tl.fromTo(sel+' .w',{opacity:0,filter:'blur(6px)'},{opacity:1,filter:'blur(0px)',duration:0.16,ease:'power2.out',stagger:gap},at);}
"""


def scene_file(sid: str, css: str, body: str, js: str) -> str:
    slot = TIMING[sid]["slot"]
    return f"""<template>
<style>{BASE_CSS}{css}</style>
<div id="root" data-composition-id="{sid}" data-width="1920" data-height="1080" data-start="0" data-duration="{slot}">
{body}
</div>
<script>
(function(){{
{FLAME_JS}{KF_JS}
const D={slot};
{js}
}})();
</script>
</template>
"""


# ------------------------------------------------------------------ data
HOT = json.loads((A / "hot2021_px.json").read_text())
CAL = json.loads((A / "calendar_arteaga.json").read_text())
SER = json.loads((A / "series_mexico.json").read_text())
HSUM = json.loads((ROOT.parent / "web/public/data/harmonization.json").read_text())["countries"]
MX, AR = HSUM["Mexico"], HSUM["Argentina"]
MAR21 = json.loads((ROOT / "data/calendar.json").read_text())
R21 = next(r for r in MAR21["rows"] if r["year"] == 2021 and r["month"] == 3)
RATIO = round(R21["anomaly_ratio"], 1)          # 84.8
POINTS21 = round(R21["count_harm"])             # 861 harmonized
RETURN = round(R21["return_period_years"])      # 26
PCTL = round(R21["percentile"] * 100)           # 96
RAW_POINTS = HOT["meta"]["n"]                   # 2137 FIRMS detections
NORMAL = round(POINTS21 / R21["anomaly_ratio"])  # ~10
y11 = next(r for r in SER if r["year"] == 2011)["modis_raw"]
y12 = next(r for r in SER if r["year"] == 2012)["viirs_raw"]


def fmt(n: float) -> str:
    return f"{n:,.0f}"


def mil(n: float) -> str:
    return f"{round(n / 1000):d}{T['k']}"


# ------------------------------------------------------------------ s1 map
def s1():
    sid = "s1"
    q = C(sid, "q")
    look = C(sid, "look")
    css = """
#s1-cv{position:absolute;inset:0}
#s1-card{position:absolute;left:96px;top:86px;width:560px;padding:34px 38px}
#s1-card h2{font-size:52px;font-weight:600;line-height:1.08;margin:0 0 14px}
#s1-card p{font-size:28px;color:#9aa69f;margin:4px 0}
#s1-count{font-size:64px;color:#e9ece6;margin-top:22px!important}
#s1-count small{font-size:28px;color:#9aa69f;margin-left:10px}
#s1-q{position:absolute;left:96px;bottom:110px;width:1500px;font-size:96px;font-weight:600;line-height:1.05;letter-spacing:-0.01em;text-shadow:0 4px 24px rgba(0,0,0,.6)}
#s1-sub{position:absolute;left:100px;bottom:62px;font-size:34px;color:#e9ece6;text-shadow:0 2px 12px rgba(0,0,0,.7)}
.s1-lbl{position:absolute;left:0;top:0;font-size:26px;font-weight:700;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.9);white-space:nowrap}
.s1-lbl i{display:inline-block;width:12px;height:12px;background:#e8803f;margin-right:8px;vertical-align:1px}
#s1-credit{position:absolute;right:28px;bottom:18px;font-size:20px;color:#c9d1cb;background:rgba(26,31,28,.75);padding:4px 10px;border-radius:6px}
"""
    body = f"""
<img id="s1-bm" src="assets/img/arteaga_bm.jpg" style="display:none" alt="">
<canvas id="s1-cv" width="1920" height="1080" class="clip" data-start="0" data-duration="{TIMING[sid]['slot']}" data-layout-ignore></canvas>
<div id="s1-l1" class="s1-lbl" data-layout-ignore><i></i>Saltillo</div>
<div id="s1-l2" class="s1-lbl" data-layout-ignore><i></i>Arteaga</div>
<div id="s1-l3" class="s1-lbl" data-layout-ignore><i></i>Monterrey</div>
<div id="s1-card" class="panel clip" data-start="0" data-duration="{TIMING[sid]['slot']}">
  <h2 class="serif">Sierra de Arteaga, Coahuila</h2>
  <p id="s1-day">{T["march"]}</p>
  <p id="s1-count" class="mono">0<small>{T["detections"]}</small></p>
</div>
<div id="s1-q" class="serif clip" data-start="{q - 0.1}" data-duration="{TIMING[sid]['slot'] - q + 0.1}">{T["q"]}</div>
<div id="s1-sub" class="clip" data-start="{look}" data-duration="{TIMING[sid]['slot'] - look}">{T["look"]}</div>
<div id="s1-credit" data-layout-ignore>NASA GIBS, Blue Marble · NASA FIRMS</div>
"""
    js = f"""
const H={json.dumps(HOT)};
const M=H.meta, P=H.pts;
const cv=document.getElementById('s1-cv'), ctx=cv.getContext('2d'), img=document.getElementById('s1-bm');
const fx=(M.bbox_px[0][0]+M.bbox_px[1][0])/2, fy=(M.bbox_px[0][1]+M.bbox_px[1][1])/2;
const CX=1180, CY=610, T0=0.7, T1=8.2;
const tDay=d=>T0+(d-1)/30*(T1-T0);
const lbl=[['s1-l1',M.saltillo],['s1-l2',M.arteaga],['s1-l3',M.monterrey]].map(([id,p])=>[document.getElementById(id),p]);
const cnt=document.getElementById('s1-count'), day=document.getElementById('s1-day');
function draw(t){{
  const S=kf(t,[[0,6.6],[D-1.1,7.6,'power1.inOut'],[D,5.9,'power3.in']]);
  const sx=p=>CX+(p[0]-fx)*S, sy=p=>CY+(p[1]-fy)*S;
  ctx.clearRect(0,0,1920,1080);
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,CX-fx*S,CY-fy*S,M.w*S,M.h*S);
  // area rectangle, dashed orange like the app
  const a=M.bbox_px;ctx.save();ctx.setLineDash([18,12]);ctx.lineWidth=4;ctx.strokeStyle='#e8803f';
  ctx.globalAlpha=kf(t,[[0.2,0],[0.6,1,'power2.out']]);
  ctx.strokeRect(sx(a[0]),sy(a[0]),(a[1][0]-a[0][0])*S,(a[1][1]-a[0][1])*S);ctx.restore();
  let n=0, lastDay=0;
  for(let i=0;i<P.length;i++){{const p=P[i];const td=tDay(p[2]);if(t<td)continue;n++;lastDay=Math.max(lastDay,p[2]);
    const k=gsap.parseEase('back.out(2)')(Math.min(1,(t-td)/0.3));drawFlame(ctx,sx(p),sy(p),26*k,p[3],t,(i*0.137)%1.7);}}
  const dark=kf(t,[[D-0.9,0],[D,0.85,'power2.in']]);
  if(dark>0){{ctx.fillStyle=`rgba(26,31,28,${{dark}})`;ctx.fillRect(0,0,1920,1080);}}
  lbl.forEach(([el,p])=>{{el.style.transform=`translate(${{sx(p)+10}}px,${{sy(p)-16}}px)`;el.style.opacity=String(1-dark);}});
  cnt.firstChild.nodeValue=n.toLocaleString('en-US');
  day.textContent=lastDay?{T['days']}:'{T['march']}';
}}
const proxy={{t:0}};
const tl=gsap.timeline({{paused:true}});
tl.to(proxy,{{t:D,duration:D,ease:'none',onUpdate:()=>draw(proxy.t)}},0);
tl.fromTo('#s1-card',{{opacity:0,y:24}},{{opacity:1,y:0,duration:0.7,ease:'expo.out'}},0.25);
words('#s1-q');wordsIn(tl,'#s1-q',{q},0.09);
tl.fromTo('#s1-sub',{{opacity:0,filter:'blur(8px)'}},{{opacity:1,filter:'blur(0px)',duration:0.2}},{look});
tl.to(['#s1-card','#s1-q','#s1-sub'],{{opacity:0,filter:'blur(8px)',duration:0.3,ease:'power3.in'}},D-0.55);
img.decode().catch(()=>{{}}).then(()=>{{draw(0);window.__timelines['{sid}']=tl;}});
"""
    return scene_file(sid, css, body, js)


# ------------------------------------------------------------------ chart helpers (s2, s3 share geometry)
X0, X1, YT, YB, YMAX = 230, 1700, 300, 900, 800_000


def cx(year):
    return X0 + (year - 2001) / (2025 - 2001) * (X1 - X0)


def cy(v):
    return YB - v / YMAX * (YB - YT)


def path(points):
    return "M" + " L".join(f"{cx(y):.1f},{cy(v):.1f}" for y, v in points)


MODIS_PTS = [(r["year"], r["modis_raw"]) for r in SER]
VIIRS_PTS = [(r["year"], r["viirs_raw"]) for r in SER if r["viirs_raw"]]
HARM_PTS = [(r["year"], r["harmonized"]) for r in SER]


def axes_svg(prefix):
    out = []
    for v in (0, 200_000, 400_000, 600_000, 800_000):
        out.append(f'<line x1="{X0}" x2="{X1}" y1="{cy(v):.0f}" y2="{cy(v):.0f}" stroke="#3a4540" stroke-width="{2 if v == 0 else 1}"/>')
        out.append(f'<text x="{X0 - 22}" y="{cy(v) + 10:.0f}" text-anchor="end" fill="#9aa69f" font-size="28" font-family="Atkinson Hyperlegible Mono">{"0" if v == 0 else mil(v)}</text>')
    for y in (2001, 2005, 2009, 2012, 2017, 2021, 2025):
        out.append(f'<text x="{cx(y):.0f}" y="{YB + 46}" text-anchor="middle" fill="#9aa69f" font-size="28" font-family="Atkinson Hyperlegible Mono">{y}</text>')
    return f'<g id="{prefix}-axes">' + "".join(out) + "</g>"


CHART_CSS = """
.chart{position:absolute;left:0;top:0;width:1920px;height:1080px}
.ttl{position:absolute;left:120px;top:84px;font-size:68px;font-weight:600;letter-spacing:-0.01em;margin:0}
.sub{position:absolute;left:122px;top:176px;font-size:32px;color:#9aa69f;margin:0}
.lab{font-family:'Atkinson Hyperlegible Next',sans-serif;font-size:32px;font-weight:700}
"""


def s2():
    sid = "s2"
    desde = C(sid, "desde")
    viirs = C(sid, "viirs")
    pix = C(sid, "pix")
    crudos = C(sid, "crudos")
    golpe = C(sid, "golpe")
    falso = C(sid, "falso")
    falso_w = C(sid, "falso_w")
    slot = TIMING[sid]["slot"]
    jx = (cx(2011) + cx(2012)) / 2
    css = CHART_CSS + """
#s2-stamp{position:absolute;left:%dpx;top:470px;padding:12px 28px;border:7px solid #f26a1b;color:#f26a1b;border-radius:10px;font-size:72px;font-weight:700;letter-spacing:.04em;background:rgba(26,31,28,.88)}
#s2-gotita{position:absolute;left:300px;top:330px;width:440px;height:auto}
#s2-jump{position:absolute;left:%dpx;top:%dpx;font-size:32px;color:#e9ece6;background:#232a26;border:1px solid #3a4540;border-radius:10px;padding:10px 18px}
#s2-px{position:absolute;right:120px;top:84px;padding:22px 28px;display:flex;gap:36px;align-items:flex-end}
#s2-px div{display:flex;flex-direction:column;align-items:center;gap:10px;font-size:28px}
#s2-px i{display:block;border:4px solid}
#s2-mk{position:absolute;left:%dpx;top:%dpx;font-size:30px;color:#67a9cf;font-weight:700}
""" % (jx + 70, jx + 36, cy(y12) + 40, cx(2012) + 12, YT - 6)
    body = f"""
<h1 id="s2-t" class="ttl serif clip" data-start="0" data-duration="{slot}">{T["s2t"]}</h1>
<p id="s2-s" class="sub clip" data-start="0" data-duration="{slot}">{T["s2s"]}</p>
<svg class="chart clip" id="s2-svg" data-start="0" data-duration="{slot}" viewBox="0 0 1920 1080" data-layout-ignore>
  {axes_svg('s2')}
  <line id="s2-yr" x1="{cx(2012):.0f}" x2="{cx(2012):.0f}" y1="{YT}" y2="{YB}" stroke="#67a9cf" stroke-width="3" stroke-dasharray="8 8"/>
  <path id="s2-modis" d="{path(MODIS_PTS)}" pathLength="100" fill="none" stroke="#9aa69f" stroke-width="6" stroke-linejoin="round" stroke-dasharray="100 120" stroke-dashoffset="110"/>
  <path id="s2-viirs" d="{path(VIIRS_PTS)}" pathLength="100" fill="none" stroke="#67a9cf" stroke-width="6" stroke-linejoin="round" stroke-dasharray="100 120" stroke-dashoffset="110"/>
  <text id="s2-ml" class="lab" x="{cx(2025) + 18:.0f}" y="{cy(MODIS_PTS[-1][1]) + 10:.0f}" fill="#9aa69f">MODIS</text>
  <text id="s2-vl" class="lab" x="{cx(2025) + 18:.0f}" y="{cy(VIIRS_PTS[-1][1]) + 10:.0f}" fill="#67a9cf">VIIRS</text>
  <g id="s2-br"><line x1="{jx:.0f}" x2="{jx:.0f}" y1="{cy(y11):.0f}" y2="{cy(y12):.0f}" stroke="#e9ece6" stroke-width="4" stroke-dasharray="10 8"/>
    <circle cx="{cx(2011):.0f}" cy="{cy(y11):.0f}" r="11" fill="#9aa69f" stroke="#1a1f1c" stroke-width="4"/>
    <circle cx="{cx(2012):.0f}" cy="{cy(y12):.0f}" r="11" fill="#67a9cf" stroke="#1a1f1c" stroke-width="4"/></g>
</svg>
<div id="s2-mk" class="clip" data-start="{desde}" data-duration="{slot - desde}">{T["arrives"]}</div>
<div id="s2-px" class="panel clip" data-start="{pix - 0.1}" data-duration="{slot - pix + 0.1}">
  <div style="color:#c9d1cb"><i style="width:120px;height:120px;border-color:#9aa69f"></i>MODIS · 1 km</div>
  <div style="color:#67a9cf"><i style="width:45px;height:45px;border-color:#67a9cf"></i>VIIRS · 375 m</div>
</div>
<div id="s2-jump" class="mono clip" data-start="{golpe - 0.6}" data-duration="{slot - golpe + 0.6}">2011: {mil(y11)} → 2012: {mil(y12)}</div>
<img id="s2-gotita" class="clip" data-start="{falso - 0.35}" data-duration="{slot - falso + 0.35}" src="assets/img/curiosa.png" alt="{T["g_cur"][0]}">
<div id="s2-stamp" class="serif clip" data-start="{falso_w - 0.05}" data-duration="{slot - falso_w + 0.05}">{T["stamp"]}</div>
"""
    js = f"""
const tl=gsap.timeline({{paused:true}});
words('#s2-t');wordsIn(tl,'#s2-t',0.1);
tl.fromTo('#s2-s',{{opacity:0}},{{opacity:1,duration:0.4}},0.6);
tl.fromTo('#s2-axes',{{opacity:0}},{{opacity:1,duration:0.5}},0.3);
tl.fromTo('#s2-modis',{{strokeDashoffset:110}},{{strokeDashoffset:0,duration:{desde - 0.8},ease:'power1.inOut'}},0.7);
tl.fromTo('#s2-ml',{{opacity:0}},{{opacity:1,duration:0.3}},{desde - 0.2});
tl.fromTo('#s2-yr',{{opacity:0,scaleY:0,transformOrigin:'50% 100%'}},{{opacity:1,scaleY:1,duration:0.6,ease:'expo.out'}},{desde});
tl.fromTo('#s2-mk',{{opacity:0,filter:'blur(6px)'}},{{opacity:1,filter:'blur(0px)',duration:0.2}},{desde + 0.2});
tl.fromTo('#s2-viirs',{{strokeDashoffset:110}},{{strokeDashoffset:0,duration:{crudos - viirs - 0.2},ease:'power1.inOut'}},{viirs});
tl.fromTo('#s2-vl',{{opacity:0}},{{opacity:1,duration:0.3}},{crudos - 0.3});
tl.fromTo('#s2-px',{{opacity:0,y:-20}},{{opacity:1,y:0,duration:0.6,ease:'expo.out'}},{pix - 0.1});
tl.fromTo('#s2-br',{{opacity:0}},{{opacity:1,duration:0.4}},{crudos});
tl.fromTo('#s2-jump',{{opacity:0,scale:0.8}},{{opacity:1,scale:1,duration:0.45,ease:'back.out(2)'}},{golpe - 0.6});
tl.fromTo('#s2-gotita',{{y:500,scaleY:0.86,rotation:-6}},{{y:0,scaleY:1,rotation:0,duration:0.8,ease:'back.out(1.5)'}},{falso - 0.35});
tl.to('#s2-gotita',{{rotation:4,duration:0.45,ease:'sine.inOut',yoyo:true,repeat:3}},{falso + 0.6});
tl.fromTo('#s2-stamp',{{opacity:0,scale:1.7,rotation:-14}},{{opacity:1,scale:1,rotation:-8,duration:0.22,ease:'power4.in'}},{falso_w - 0.05});
tl.to(['#s2-t','#s2-s','#s2-gotita','#s2-stamp','#s2-jump','#s2-px','#s2-mk'],{{opacity:0,filter:'blur(8px)',duration:0.25,ease:'power3.in'}},D-0.4);
window.__timelines['{sid}']=tl;
"""
    return scene_file(sid, css, body, js)


def s3():
    sid = "s3"
    escala = C(sid, "escala")
    celda = C(sid, "celda")
    prob = C(sid, "prob")
    baja = C(sid, "baja")
    slot = TIMING[sid]["slot"]
    side, cell = 600, 600 / (1000 / 375)
    gx, gy = 660, 250
    grid = "".join(f'<line class="s3-g" x1="{gx + i * cell:.1f}" x2="{gx + i * cell:.1f}" y1="{gy}" y2="{gy + side}"/>' for i in (1, 2)) + \
        "".join(f'<line class="s3-g" x1="{gx}" x2="{gx + side}" y1="{gy + i * cell:.1f}" y2="{gy + i * cell:.1f}"/>' for i in (1, 2))
    mx_err, mx_base = MX["annual_error_pct"], MX["baseline_error_pct"]
    ar_err, ar_base = AR["annual_error_pct"], AR["baseline_error_pct"]
    css = CHART_CSS + f"""
#s3-px{{position:absolute;inset:0}}
#s3-bg{{position:absolute;left:-200px;top:-300px;width:2400px;height:2400px;object-fit:cover}}
#s3-dim{{position:absolute;inset:0;background:#1a1f1c;opacity:.55}}
.s3-g{{stroke:#67a9cf;stroke-width:4}}
#s3-mlab{{position:absolute;left:{gx}px;top:{gy - 74}px;font-size:40px;font-weight:700;color:#e9ece6}}
#s3-vlab{{position:absolute;left:{gx + side + 36}px;top:{gy + 20}px;font-size:40px;font-weight:700;color:#67a9cf;width:520px}}
#s3-vlab span{{display:block;font-size:30px;color:#e9ece6;font-weight:400;margin-top:12px}}
#s3-note{{position:absolute;left:{gx}px;top:{gy + side + 28}px;font-size:28px;color:#c9d1cb}}
#s3-fire{{position:absolute;left:{gx + side / 2 - 80}px;top:{gy + side / 2 - 100}px}}
.s3-sf{{position:absolute}}
#s3-chart{{position:absolute;inset:0}}
#s3-stat{{position:absolute;right:110px;top:250px;width:660px;padding:30px 38px}}
#s3-stat .big{{font-size:92px;font-weight:600;line-height:1;color:#e9ece6;white-space:nowrap}}
#s3-stat .big b{{color:#f26a1b;font-weight:600}}
#s3-stat p{{font-size:30px;color:#c9d1cb;margin:16px 0 0}}
#s3-hl{{position:absolute;left:{cx(2001) + 6:.0f}px;top:{cy(HARM_PTS[0][1]) - 150:.0f}px;font-size:32px;font-weight:700;color:#fde34a}}
"""
    small = [(0, 0, 0), (1, 2, 1), (2, 1, 0), (0, 2, 0)]
    sf = "".join(
        f'<div class="s3-sf" id="s3-sf{i}" style="left:{gx + c * cell + cell / 2 - 52:.0f}px;top:{gy + r * cell + cell / 2 - 60:.0f}px"></div>'
        for i, (c, r, _) in enumerate(small))
    body = f"""
<div id="s3-px" class="clip" data-start="0" data-duration="{celda + 0.4}">
  <img id="s3-bg" src="assets/img/arteaga_bm.jpg" alt="">
  <div id="s3-dim"></div>
  <svg class="chart" viewBox="0 0 1920 1080" data-layout-ignore>
    <rect id="s3-sq" x="{gx}" y="{gy}" width="{side}" height="{side}" fill="rgba(26,31,28,.35)" stroke="#e9ece6" stroke-width="6"/>
    <g id="s3-grid">{grid}</g>
  </svg>
  <div id="s3-mlab">{T["pixel"]}</div>
  <div id="s3-fire"></div>
  {sf}
  <div id="s3-vlab">VIIRS = 375 m</div>
  <div id="s3-note">{T["diagram"]}</div>
</div>
<div id="s3-chart" class="clip" data-start="{celda - 0.1}" data-duration="{slot - celda + 0.1}">
  <h1 id="s3-t" class="ttl serif">{T["s3t"]}</h1>
  <p class="sub">{T["s3s"]}</p>
  <svg class="chart" viewBox="0 0 1920 1080" data-layout-ignore>
    <rect x="{cx(2001):.0f}" y="{YT}" width="{cx(2011.5) - cx(2001):.0f}" height="{YB - YT}" fill="#e9ece6" opacity=".05"/>
    <text x="{cx(2001) + 10:.0f}" y="{YT + 36}" fill="#9aa69f" font-size="26" font-family="Atkinson Hyperlegible Next">{T["est"]}</text>
    {axes_svg('s3')}
    <g id="s3-raw"><path d="{path(MODIS_PTS)}" fill="none" stroke="#9aa69f" stroke-width="6"/><path d="{path(VIIRS_PTS)}" fill="none" stroke="#67a9cf" stroke-width="6"/></g>
    <path id="s3-harm" d="{path(HARM_PTS)}" pathLength="100" fill="none" stroke="#fde34a" stroke-width="8" stroke-linejoin="round" stroke-dasharray="100 120" stroke-dashoffset="110"/>
  </svg>
  <div id="s3-hl">{T["harm"]}</div>
  <div id="s3-stat" class="panel" data-hold>
    <div class="big serif"><b>−{round(MX['error_reduction_pct'])} %</b> error</div>
    <p>{T["val"]}</p>
    <p class="mono">{T["mx"]} {mx_base:.1f}% → {mx_err:.1f}%<br>Argentina {ar_base:.1f}% → {ar_err:.1f}%</p>
  </div>
</div>
"""
    js = f"""
document.getElementById('s3-fire').innerHTML=flameSVG(0,170);
{json.dumps([lvl for *_, lvl in small])}.forEach((l,i)=>document.getElementById('s3-sf'+i).innerHTML=flameSVG(l,104));
const tl=gsap.timeline({{paused:true}});
tl.fromTo('#s3-bg',{{scale:1.0}},{{scale:1.08,duration:{celda + 0.4},ease:'none'}},0);
tl.fromTo('#s3-sq',{{opacity:0,scale:0.6,transformOrigin:'50% 50%'}},{{opacity:1,scale:1,duration:0.7,ease:'expo.out'}},0.15);
tl.fromTo('#s3-mlab',{{opacity:0,filter:'blur(6px)'}},{{opacity:1,filter:'blur(0px)',duration:0.2}},0.4);
tl.fromTo('#s3-fire',{{opacity:0,scale:0.4,transformOrigin:'50% 90%'}},{{opacity:1,scale:1,duration:0.5,ease:'back.out(2)'}},0.6);
tl.fromTo('.s3-g',{{opacity:0}},{{opacity:1,duration:0.2,stagger:0.12}},{escala});
tl.to('#s3-fire',{{opacity:0,scale:0.5,duration:0.25,ease:'power3.in'}},{escala + 0.5});
tl.fromTo('.s3-sf',{{opacity:0,scale:0.3,transformOrigin:'50% 90%'}},{{opacity:1,scale:1,duration:0.4,ease:'back.out(2.2)',stagger:0.14}},{escala + 0.6});
tl.fromTo('#s3-vlab',{{opacity:0,x:-20}},{{opacity:1,x:0,duration:0.5,ease:'expo.out'}},{escala + 0.4});
tl.to(['#s3-px svg','#s3-mlab','#s3-vlab','.s3-sf','#s3-note'],{{opacity:0,filter:'blur(8px)',duration:0.22,ease:'power3.in'}},{celda - 0.25});
tl.fromTo('#s3-chart',{{opacity:0,scale:1.04}},{{opacity:1,scale:1,duration:0.45,ease:'expo.out'}},{celda - 0.1});
tl.fromTo('#s3-raw',{{opacity:1}},{{opacity:0.28,duration:0.8}},{celda + 0.4});
tl.fromTo('#s3-harm',{{strokeDashoffset:110}},{{strokeDashoffset:0,duration:2.0,ease:'power1.inOut'}},{celda + 0.4});
tl.fromTo('#s3-hl',{{opacity:0}},{{opacity:1,duration:0.3}},{celda + 1.0});
tl.fromTo('#s3-stat',{{opacity:0,y:30}},{{opacity:1,y:0,duration:0.7,ease:'expo.out'}},{prob});
tl.fromTo('#s3-stat .big',{{scale:1.25,transformOrigin:'0% 50%'}},{{scale:1,duration:0.35,ease:'power4.out'}},{baja});
tl.to('#s3-chart',{{opacity:0,filter:'blur(8px)',duration:0.25,ease:'power3.in'}},D-0.35);
window.__timelines['{sid}']=tl;
"""
    return scene_file(sid, css, body, js)


# ------------------------------------------------------------------ s4 calendar
CIVIDIS = ['#00204d', '#1f3a6e', '#4a5470', '#6f6f72', '#958f78', '#c0b26d', '#fde34a']


def cividis(t):
    t = max(0.0, min(1.0, t)) * (len(CIVIDIS) - 1)
    i = min(len(CIVIDIS) - 2, int(t))
    f = t - i
    a = [int(CIVIDIS[i][k:k + 2], 16) for k in (1, 3, 5)]
    b = [int(CIVIDIS[i + 1][k:k + 2], 16) for k in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * f):02x}" for x, y in zip(a, b))


def s4():
    sid = "s4"
    marzo = C(sid, "marzo")
    ochenta = C(sid, "ochenta")
    algo = C(sid, "algo")
    slot = TIMING[sid]["slot"]
    mx = CAL["max"]
    rows, cells = [], []
    top, rh, gx0, cw = 236, 29, 236, 70
    for yi, year in enumerate(CAL["years"]):
        y = top + yi * rh
        est = year <= 2011
        rows.append(f'<div class="s4-yr" style="top:{y}px">{year}</div>' + (f'<div class="s4-est" style="top:{y + 3}px"></div>' if est else ""))
        for m in range(1, 13):
            key = f"{year}-{m}"
            if key not in CAL["v"]:
                continue
            v = CAL["v"][key]
            col = CIVIDIS[0] if v <= 0 else cividis(0.06 + 0.94 * (v / mx) ** 0.5)
            hid = ' id="s4-hit"' if (year, m) == (2021, 3) else ""
            cells.append(f'<div{hid} class="s4-c s4-r{yi}" style="left:{gx0 + (m - 1) * cw}px;top:{y}px;background:{col}"></div>')
    months = "".join(f'<div class="s4-m" style="left:{gx0 + i * cw}px">{c}</div>' for i, c in enumerate(T["months"]))
    css = f"""
#s4-ttl{{position:absolute;left:120px;top:70px;font-size:64px;font-weight:600;margin:0}}
#s4-sub{{position:absolute;left:122px;top:150px;font-size:30px;color:#9aa69f;margin:0}}
.s4-yr{{position:absolute;left:110px;width:110px;font-size:24px;line-height:{rh - 4}px;color:#9aa69f;font-family:'Atkinson Hyperlegible Mono',monospace}}
.s4-est{{position:absolute;left:{gx0 - 12}px;width:4px;height:{rh - 8}px;background:#9aa69f}}
.s4-c{{position:absolute;width:{cw - 4}px;height:{rh - 4}px;border-radius:3px}}
.s4-m{{position:absolute;top:200px;width:{cw - 4}px;text-align:center;font-size:24px;color:#9aa69f}}
#s4-ring{{position:absolute;left:{gx0 + 2 * cw - 7}px;top:{top + 20 * rh - 7}px;width:{cw + 10}px;height:{rh + 10}px;border:4px solid #e9ece6;border-radius:6px}}
#s4-card{{position:absolute;left:1180px;top:236px;width:640px;padding:38px 42px}}
#s4-card .row{{display:flex;align-items:center;gap:16px;font-size:28px;color:#9aa69f}}
#s4-chip{{background:#5b2b28;color:#ffaea7;font-weight:700;padding:6px 14px;border-radius:6px;font-size:30px;white-space:nowrap}}
#s4-big{{font-size:200px;font-weight:700;line-height:1;color:#f26a1b;margin:18px 0 6px;letter-spacing:-0.02em}}
#s4-card p{{font-size:32px;line-height:1.35;margin:10px 0 0}}
#s4-card p b{{font-weight:700}}
.s4-sem{{display:flex;flex-direction:column;gap:6px;padding:7px;border:1px solid #3a4540;border-radius:8px}}
.s4-sem i{{display:block;width:16px;height:16px;border-radius:50%;background:#3a4540}}
.s4-sem i.on{{background:#b2182b;box-shadow:0 0 10px rgba(178,24,43,.8)}}
#s4-leg{{position:absolute;left:{gx0}px;top:{top + 26 * rh + 14}px;font-size:28px;color:#9aa69f;display:flex;align-items:center;gap:12px}}
#s4-leg .g{{width:220px;height:14px;background:linear-gradient(90deg,{','.join(CIVIDIS)})}}
"""
    body = f"""
<h1 id="s4-ttl" class="serif clip" data-start="0" data-duration="{slot}">{T["s4t"]}</h1>
<p id="s4-sub" class="clip" data-start="0" data-duration="{slot}">{T["s4s"]}</p>
<div id="s4-grid" class="clip" data-start="0" data-duration="{slot}" data-layout-ignore>{months}{''.join(rows)}{''.join(cells)}<div id="s4-ring"></div></div>
<div id="s4-leg" class="clip" data-start="0" data-duration="{slot}"><span>0</span><span class="g"></span><span>{fmt(mx)}</span><span>{T["legend"]}</span></div>
<div id="s4-card" data-hold class="panel clip" data-start="{marzo - 0.3}" data-duration="{slot - marzo + 0.3}">
  <div class="row"><div class="s4-sem"><i class="on"></i><i></i><i></i></div><span id="s4-chip">{T["chip"]}</span></div>
  <div id="s4-big" class="serif"><span id="s4-num">1.0</span>×</div>
  <p>{T["card"].format(p=POINTS21, n=NORMAL)}</p>
  <p id="s4-ret">{T["ret"].format(r=RETURN)}</p>
</div>
"""
    js = f"""
const tl=gsap.timeline({{paused:true}});
words('#s4-ttl');wordsIn(tl,'#s4-ttl',0.1);
tl.fromTo('#s4-sub',{{opacity:0}},{{opacity:1,duration:0.4}},0.5);
tl.fromTo('.s4-m,.s4-yr,.s4-est',{{opacity:0}},{{opacity:1,duration:0.4}},0.4);
for(let r=0;r<26;r++) tl.fromTo('.s4-r'+r,{{opacity:0,scale:0.4}},{{opacity:1,scale:1,duration:0.35,ease:'expo.out',stagger:0.012}},0.6+r*0.085);
tl.fromTo('#s4-leg',{{opacity:0}},{{opacity:1,duration:0.4}},2.6);
tl.fromTo('.s4-c:not(#s4-hit)',{{opacity:1}},{{opacity:0.35,duration:0.5}},{marzo});
tl.fromTo('#s4-ring',{{opacity:0,scale:1.6}},{{opacity:1,scale:1,duration:0.4,ease:'power4.out'}},{marzo});
tl.fromTo('#s4-hit',{{scale:1}},{{scale:1.25,duration:0.3,ease:'back.out(3)'}},{marzo});
tl.fromTo('#s4-card',{{opacity:0,x:40}},{{opacity:1,x:0,duration:0.7,ease:'expo.out'}},{marzo - 0.3});
const num={{v:1}};const el=document.getElementById('s4-num');
tl.fromTo(num,{{v:1}},{{v:{RATIO},duration:1.4,ease:'power3.out',onUpdate:()=>el.textContent=num.v.toFixed(1)}},{ochenta});
tl.fromTo('#s4-ret',{{opacity:0,filter:'blur(6px)'}},{{opacity:1,filter:'blur(0px)',duration:0.2}},{algo});
tl.to(['#s4-grid','#s4-card','#s4-ttl','#s4-sub','#s4-leg'],{{opacity:0,filter:'blur(8px)',duration:0.25,ease:'power3.in'}},D-0.35);
window.__timelines['{sid}']=tl;
"""
    return scene_file(sid, css, body, js)


# ------------------------------------------------------------------ s5 Gotita
def s5():
    sid = "s5"
    names = {"curiosa": C(sid, "curiosa"), "bombera": C(sid, "bombera"), "cientifica": C(sid, "cientifica")}
    sin = C(sid, "sin")
    slot = TIMING[sid]["slot"]
    fill = dict(r85=round(RATIO), p=POINTS21, n=NORMAL, ratio=RATIO, pc=PCTL, r=RETURN)
    bubbles = {k: (T[g][0], T[g][1].format(**fill)) for k, g in (("curiosa", "g_cur"), ("bombera", "g_bom"), ("cientifica", "g_cie"))}
    pos = {"curiosa": (110, 200, "#2b422b", "#6ab26b"), "bombera": (700, 160, "#503424", "#df843f"), "cientifica": (1290, 200, "#28413c", "#4fb1a0")}
    css = """
#s5-ttl{position:absolute;left:120px;top:70px;font-size:72px;font-weight:600;margin:0}
.s5-g{position:absolute;width:520px}
.s5-g img{width:420px;height:auto;display:block;margin:0 auto}
.s5-b{margin-top:10px;padding:18px 24px;border-radius:14px;border:2px solid;font-size:30px;line-height:1.3}
.s5-b b{display:block;font-size:28px;margin-bottom:6px}
#s5-foot{position:absolute;left:120px;bottom:46px;font-size:30px;color:#c9d1cb}
"""
    gs = "".join(f"""
<div id="s5-{k}" class="s5-g clip" data-start="{names[k] - 0.3}" data-duration="{slot - names[k] + 0.3}" style="left:{pos[k][0]}px;top:{pos[k][1]}px">
  <img id="s5-{k}-img" src="assets/img/{k}.png" alt="{bubbles[k][0]}">
  <div id="s5-{k}-b" class="s5-b" style="background:{pos[k][2]};border-color:{pos[k][3]}"><b>{bubbles[k][0]}</b>{bubbles[k][1]}</div>
</div>""" for k in names)
    body = f"""
<h1 id="s5-ttl" class="serif clip" data-start="0" data-duration="{slot}">{T["s5t"]}</h1>
{gs}
<div id="s5-foot" class="clip" data-start="{sin}" data-duration="{slot - sin}">{T["s5foot"]}</div>
"""
    js = "const tl=gsap.timeline({paused:true});words('#s5-ttl');wordsIn(tl,'#s5-ttl',0.1);\n"
    for i, (k, t) in enumerate(names.items()):
        js += (f"tl.fromTo('#s5-{k}-img',{{y:260,scaleY:0.8,scaleX:1.1,opacity:0}},{{y:0,scaleY:1,scaleX:1,opacity:1,duration:0.75,ease:'back.out(1.6)'}},{t - 0.3});\n"
               f"tl.fromTo('#s5-{k}-b',{{opacity:0,y:20}},{{opacity:1,y:0,duration:0.5,ease:'expo.out'}},{t + 0.15});\n"
               f"tl.to('#s5-{k}-img',{{y:-10,duration:0.9,ease:'sine.inOut',yoyo:true,repeat:{max(1, int((slot - t) / 0.9) - 1)}}},{t + 0.5 + i * 0.2});\n")
    js += f"tl.fromTo('#s5-foot',{{opacity:0,filter:'blur(6px)'}},{{opacity:1,filter:'blur(0px)',duration:0.2}},{sin});\n"
    js += "tl.to(['#s5-ttl','.s5-g','#s5-foot'],{opacity:0,filter:'blur(8px)',duration:0.25,ease:'power3.in'},D-0.35);\n"
    js += f"window.__timelines['{sid}']=tl;"
    return scene_file(sid, css, body, js)


# ------------------------------------------------------------------ s6 Telegram alert
def s6():
    sid = "s6"
    tele = C(sid, "tele")
    slot = TIMING[sid]["slot"]
    css = """
#s6-phone{position:absolute;left:980px;top:60px;width:640px;height:960px;border-radius:64px;background:#0e1621;border:10px solid #2b332e;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden}
#s6-head{height:110px;background:#17212b;display:flex;align-items:flex-end;gap:16px;padding:0 26px 18px}
#s6-head img{width:56px;height:56px;border-radius:50%}
#s6-head b{display:block;font-size:30px;color:#fff}
#s6-head span{font-size:20px;color:#7f91a4}
.s6-msg{position:absolute;max-width:540px;padding:16px 20px;border-radius:16px;font-size:28px;line-height:1.35;color:#fff}
#s6-out{right:20px;top:150px;background:#2b5278}
#s6-in{left:20px;top:250px;background:#182533}
#s6-in .x{color:#ffb37e;font-weight:700}
#s6-in .t{color:#7f91a4;font-size:18px;display:block;text-align:right;margin-top:6px}
#s6-g{position:absolute;left:230px;top:200px;width:620px;height:auto}
#s6-cap{position:absolute;left:1040px;top:1040px;width:520px;text-align:center;font-size:22px;color:#9aa69f}
"""
    body = f"""
<img id="s6-g" class="clip" data-start="0" data-duration="{slot}" src="assets/img/bombera.png" alt="{T["g_bom"][0]}">
<div id="s6-phone" data-hold data-layout-ignore class="clip" data-start="0" data-duration="{slot}">
  <div id="s6-head"><img src="assets/img/logo.svg" alt=""><div><b>Firely · Gotita</b><span>bot</span></div></div>
  <div id="s6-out" class="s6-msg">/suscribir Sierra de Arteaga, Coahuila</div>
  <div id="s6-in" class="s6-msg">{T["alert"].format(ratio=RATIO)}<span class="t">7:02</span></div>
</div>
"""
    js = f"""
const tl=gsap.timeline({{paused:true}});
tl.fromTo('#s6-phone',{{y:140,opacity:0}},{{y:0,opacity:1,duration:0.8,ease:'expo.out'}},0.1);
tl.fromTo('#s6-g',{{x:-300,rotation:-8}},{{x:0,rotation:0,duration:0.8,ease:'back.out(1.4)'}},0.25);
tl.fromTo('#s6-out',{{opacity:0,y:20,scale:0.9,transformOrigin:'100% 100%'}},{{opacity:1,y:0,scale:1,duration:0.35,ease:'back.out(2)'}},0.9);
tl.fromTo('#s6-in',{{opacity:0,y:30,scale:0.9,transformOrigin:'0% 0%'}},{{opacity:1,y:0,scale:1,duration:0.45,ease:'back.out(1.8)'}},{tele});
tl.to('#s6-g',{{y:-18,duration:0.18,ease:'power2.out',yoyo:true,repeat:1}},{tele + 0.1});
tl.to(['#s6-phone','#s6-g'],{{opacity:0,filter:'blur(8px)',duration:0.25,ease:'power3.in'}},D-0.35);
window.__timelines['{sid}']=tl;
"""
    return scene_file(sid, css, body, js)


# ------------------------------------------------------------------ s7 end card
def s7():
    sid = "s7"
    slot = TIMING[sid]["slot"]
    css = """
#s7-logo{position:absolute;left:760px;top:170px;width:400px;height:400px}
#s7-name{position:absolute;left:0;width:1920px;top:600px;text-align:center;font-size:150px;font-weight:700;letter-spacing:-0.01em;margin:0}
#s7-tag{position:absolute;left:0;width:1920px;top:800px;text-align:center;font-size:52px;margin:0}
#s7-foot{position:absolute;left:0;width:1920px;top:950px;text-align:center;font-size:30px;color:#9aa69f}
#s7-cur{position:absolute;left:1360px;top:560px;width:300px}
"""
    body = f"""
<svg id="s7-logo" class="clip" data-start="0" data-duration="{slot}" viewBox="0 0 512 512">
  <path id="s7-hex" d="M256 70 L417 163 Q429 170 429 184 L429 328 Q429 342 417 349 L270 434 Q256 442 242 434 L95 349 Q83 342 83 328 L83 184 Q83 170 95 163 L242 78 Q249 74 256 70 Z" fill="#f26a1b"/>
  <path id="s7-flame" d="M256 140 C300 200 344 236 334 310 C326 368 292 398 256 398 C220 398 186 368 178 310 C172 262 204 236 220 196 C228 232 242 250 258 254 C248 214 240 178 256 140 Z" fill="#1a1f1c"/>
  <path id="s7-drop" d="M256 300 C276 322 288 338 284 358 C280 376 268 386 256 386 C244 386 232 376 228 358 C225 342 238 326 256 300 Z" fill="#7cc7ff"/>
  <circle id="s7-sat" cx="414" cy="92" r="26" fill="#e9ece6"/>
  <path id="s7-orb" d="M352 64 A72 72 0 0 1 444 154" fill="none" stroke="#e9ece6" stroke-width="10" stroke-linecap="round" opacity=".55"/>
</svg>
<h1 id="s7-name" class="serif clip" data-start="0" data-duration="{slot}">Firely</h1>
<p id="s7-tag" class="clip" data-start="0" data-duration="{slot}">{T["s7tag"]}</p>
<div id="s7-foot" class="clip" data-start="0" data-duration="{slot}">{T["s7foot"]}</div>
"""
    js = f"""
const tl=gsap.timeline({{paused:true}});
tl.fromTo('#s7-hex',{{scale:0.5,opacity:0,transformOrigin:'50% 50%'}},{{scale:1,opacity:1,duration:0.8,ease:'back.out(1.7)'}},0.1);
tl.fromTo('#s7-flame',{{scaleY:0,transformOrigin:'50% 100%'}},{{scaleY:1,duration:0.6,ease:'expo.out'}},0.4);
tl.fromTo('#s7-drop',{{y:-260,opacity:0}},{{y:0,opacity:1,duration:0.55,ease:'bounce.out'}},0.75);
tl.fromTo('#s7-sat',{{rotation:-90,svgOrigin:'256 256',opacity:0}},{{rotation:0,svgOrigin:'256 256',opacity:1,duration:0.9,ease:'power3.out'}},0.5);
tl.fromTo('#s7-orb',{{opacity:0}},{{opacity:0.55,duration:0.5}},1.0);
tl.fromTo('#s7-name',{{opacity:0,filter:'blur(10px)'}},{{opacity:1,filter:'blur(0px)',duration:0.25}},{C(sid, "name") + 0.05});
words('#s7-tag');wordsIn(tl,'#s7-tag',{C(sid, "tag")},0.09);
tl.fromTo('#s7-foot',{{opacity:0}},{{opacity:1,duration:0.5}},{C(sid, "foot")});
window.__timelines['{sid}']=tl;
"""
    return scene_file(sid, css, body, js)


def sfx_plan():
    """(file, scene, scene-local time of the picture, volume); each hit lands one frame after its picture."""
    out = [("fire", "s1", 0.2, 0.45)]
    for i, sc in enumerate(SCENES[1:]):
        out.append(("whoosh" if i % 2 == 0 else "whoosh2", sc, -0.2, 0.55))
    out += [("pop", "s2", C("s2", "golpe") - 0.6, 0.7), ("boing", "s2", C("s2", "falso") - 0.1, 0.7),
            ("stamp", "s2", C("s2", "falso_w") + 0.15, 0.9),
            ("pop", "s3", C("s3", "baja"), 0.7),
            ("pop", "s4", C("s4", "marzo"), 0.6), ("pop", "s4", C("s4", "ochenta") + 1.35, 0.8)]
    for word in ("curiosa", "bombera", "cientifica"):
        out.append(("boing", "s5", C("s5", word) - 0.1, 0.6))
    out += [("pop", "s6", 0.9, 0.5), ("notify", "s6", C("s6", "tele"), 0.9),
            ("pop", "s7", 0.45, 0.6), ("boing", "s7", 1.1, 0.7)]
    return out


# ------------------------------------------------------------------ root
def index():
    hosts, audios = [], []
    for i, s in enumerate(SCENES):
        t = TIMING[s]
        hosts.append(f'<div id="{s}" data-composition-id="{s}" data-composition-src="compositions/{s}.html" data-start="{t["start"]}" '
                     f'data-duration="{t["slot"]}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>')
        audios.append(f'<audio id="vo-{s}" class="clip" src="{vo_file(s).relative_to(ROOT)}" data-start="{round(t["start"] + LEAD, 2)}" data-duration="{round(t["vo"], 2)}" data-track-index="3" data-volume="1"></audio>')
    music = ""
    if (A / "audio" / "music.mp3").exists():
        music = f'<audio id="music" class="clip" src="assets/audio/music.mp3" data-start="0" data-duration="{TOTAL}" data-track-index="4" data-volume="0.16" data-fade-in="0.4" data-fade-out="2"></audio>'
    sfx = ""
    for j, (name, scene, at, vol) in enumerate(sfx_plan()):
        f = A / "audio" / f"{name}.mp3"
        if not f.exists():
            continue
        fade = ' data-fade-in="0.6" data-fade-out="1.5"' if name == "fire" else ""
        sfx += (f'<audio id="sfx-{j}" class="clip" src="assets/audio/{name}.mp3" data-start="{round(TIMING[scene]["start"] + at + 0.033, 2)}" '
                f'data-duration="{round(duration(f), 2)}" data-track-index="{5 + j % 2}" data-volume="{vol}"{fade}></audio>\n')
    return f"""<!doctype html>
<html lang="{LANG}">
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
      {chr(10).join(hosts)}
      {chr(10).join(audios)}
      {music}
      {sfx}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""


if __name__ == "__main__":
    if OUT != ROOT:  # sibling project that shares the assets
        OUT.mkdir(exist_ok=True)
        if not (OUT / "assets").exists():
            (OUT / "assets").symlink_to(Path("..") / ROOT.name / "assets")
        for f in ("package.json", "hyperframes.json", "CLAUDE.md", "AGENTS.md"):
            (OUT / f).write_text((ROOT / f).read_text(encoding="utf-8"), encoding="utf-8")
        (OUT / "meta.json").write_text(json.dumps({"id": f"firely-gotita-{LANG}", "name": f"Firely + Gotita ({LANG})"}), encoding="utf-8")
    (OUT / "compositions").mkdir(exist_ok=True)
    for name, fn in [("s1", s1), ("s2", s2), ("s3", s3), ("s4", s4), ("s5", s5), ("s6", s6), ("s7", s7)]:
        (OUT / "compositions" / f"{name}.html").write_text(fn(), encoding="utf-8")
    (OUT / "index.html").write_text(index(), encoding="utf-8")
    print("total", TOTAL, {s: (TIMING[s]["start"], TIMING[s]["slot"]) for s in SCENES})
