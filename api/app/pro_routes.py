"""Professional-user endpoints: read-only SQL, weekly bulletin, CAP drafts, spread cone, wind localities, fire regimes.

Mount with ``app.include_router(pro_routes.router)``. Every number comes from the processed tables or from
Open-Meteo wind (spread); nothing here is an official forecast. CAP drafts are always ``Exercise`` and are never published.
"""
from __future__ import annotations

import json
import math
import os
import re
import socket
import threading
import uuid
from datetime import datetime, timezone
from xml.sax.saxutils import escape

import duckdb
import h3
import h3 as h3lib  # routes below take a query parameter named h3, which shadows the module
import requests
import urllib3.util.connection as urllib3_connection
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from shapely.geometry import Polygon
from shapely.ops import unary_union

from . import db, geo
from .extra_routes import COUNTRIES, COUNTRY_BOUNDS, _area, _files, _months, _period, risk as _risk, watch as _watch, MONTHS
from .real import ATTRIBUTION, _cutoff, _envelope, _cells

# NASA/Open-Meteo hosts hang over IPv6 on this network (see CLAUDE.md).
urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

router = APIRouter()

# ----------------------------------------------------------------------------------------------- 1. read-only SQL

SQL_MAX_ROWS = 1000
SQL_TIMEOUT_S = 15.0
SQL_MAX_CHARS = 4000
# Whole-word tokens that can never appear, even inside string literals (conservative).
_FORBIDDEN = re.compile(
    r"\b(copy|attach|detach|install|load|pragma|export|import|set|reset|call|create|drop|alter|insert|update|delete|"
    r"truncate|vacuum|checkpoint|use|describe|summarize|show|explain|prepare|execute|force|glob|"
    r"read_\w*|write_\w*|parquet_\w*|csv_\w*|json_\w*|sniff_csv|query|query_table|duckdb_\w*|pragma_\w*|"
    r"sqlite_\w*|iceberg_\w*|delta_scan|http\w*|getenv|current_setting|information_schema|pg_\w*|"
    r"read|from_\w*file\w*|list_files)\b", re.I)


def validate_sql(query: str) -> str:
    """Return the cleaned single SELECT or raise ValueError. Rejects anything but one plain read query."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("Empty query")
    q = query.strip()
    if len(q) > SQL_MAX_CHARS:
        raise ValueError("Query too long")
    if ";" in q:
        raise ValueError("Semicolons are not allowed: send a single statement without ';'")
    if "--" in q or "/*" in q or "*/" in q:
        raise ValueError("Comments are not allowed")
    if '"' in q or "`" in q or "\\" in q or "$" in q:
        raise ValueError("Quoted identifiers, backslashes and $ are not allowed")
    if re.search(r"\bfrom\s+'|\bjoin\s+'", q, re.I):
        raise ValueError("Files cannot be queried; use the provided views")
    if not re.match(r"(?is)^\s*(select|with)\b", q):
        raise ValueError("Only SELECT queries are allowed")
    bad = _FORBIDDEN.search(q)
    if bad:
        raise ValueError(f"Forbidden keyword or function: {bad.group(0).lower()}")
    return q


def _views():
    root = db.processed_root()
    views = {"cell_month_harmonized": "cell_month_harmonized/*/year=*/*.parquet",
             "events": "events/*/year=*/*.parquet",
             "climatology": "climatology/*.parquet"}
    return {name: str(root / pattern) for name, pattern in views.items()
            if any(root.glob(pattern))}


def run_sql(query: str):
    q = validate_sql(query)
    root = db.processed_root().resolve()
    con = db.connection()
    try:
        available = _views()
        for name, pattern in available.items():
            quoted = pattern.replace("'", "''")  # server-built path, never user input
            con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{quoted}', hive_partitioning=true, union_by_name=true)")
        # Defense in depth: after the views exist, the engine itself can no longer open arbitrary files.
        con.execute(f"SET allowed_directories=['{str(root).replace(chr(39), '')}']")
        con.execute("SET enable_external_access=false")
        con.execute("SET lock_configuration=true")
        timer = threading.Timer(SQL_TIMEOUT_S, con.interrupt)
        timer.start()
        try:
            cur = con.execute(f"SELECT * FROM ({q}) AS firely_q LIMIT {SQL_MAX_ROWS + 1}")
            rows = cur.fetchall()
            columns = [d[0] for d in cur.description]
        finally:
            timer.cancel()
    except HTTPException:
        raise
    except duckdb.InterruptException as exc:
        raise HTTPException(408, detail={"code": "sql_timeout", "message": f"Query exceeded {SQL_TIMEOUT_S:g} s"}) from exc
    except duckdb.Error as exc:
        raise HTTPException(400, detail={"code": "sql_error", "message": str(exc).splitlines()[0][:300]}) from exc
    finally:
        con.close()
    truncated = len(rows) > SQL_MAX_ROWS
    return columns, [list(r) for r in rows[:SQL_MAX_ROWS]], truncated, sorted(available)


class SqlRequest(BaseModel):
    query: str = Field(min_length=1, max_length=SQL_MAX_CHARS)


@router.post("/sql")
def sql(req: SqlRequest):
    try:
        validate_sql(req.query)
    except ValueError as exc:
        raise HTTPException(400, detail={"code": "sql_rejected", "message": str(exc)}) from exc
    columns, rows, truncated, views = run_sql(req.query)
    return _envelope(_cutoff(), query=req.query.strip(), views=views, columns=columns, rows=rows, n_rows=len(rows),
                     truncated=truncated, max_rows=SQL_MAX_ROWS,
                     note="Solo lectura sobre vistas Parquet armonizadas; cifras = serie armonizada (count_harm incluye estimaciones 2001-2011).")


# ----------------------------------------------------------------------------------------------- 2. bulletin

def _fmt(x, nd=1):
    return f"{x:.{nd}f}"


def build_bulletin(cells, area, country_hint="Mexico"):
    """Deterministic Spanish template from /risk, /watch and the monthly series. Returns (title, sections, sources, facts)."""
    sources = ["/risk", "/watch", "cell_month_harmonized"]
    sections = []
    try:
        r = _risk(h3=",".join(cells), bbox=None, lat=None, lon=None, radius_km=None, admin=None, geometry=None)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        r = None
    if r:
        lines = [r["summary_es"]]
        lines += [c["note"] for c in r["components"]]
        sections.append({"heading": "Semáforo de prioridad", "level": r["level"], "index": r["index"], "period": r["period"],
                         "text": " ".join(lines), "method": r["method"]})
    else:
        sections.append({"heading": "Semáforo de prioridad", "text": "Sin actividad armonizada para esta área."})
    months = _months(cells)
    latest = _period(months)
    if latest:
        y, m = latest
        cur = next(v for yy, mm, v in months if (yy, mm) == latest)
        refs = sorted(v for yy, mm, v in months if mm == m and yy != y)
        median = refs[len(refs) // 2] if refs else None
        text = f"{MONTHS[m-1]} {y}: {_fmt(cur)} detecciones equivalentes"
        text += f"; mediana de los otros {MONTHS[m-1].lower()} ({len(refs)} años): {_fmt(median)}." if median is not None else "."
        sections.append({"heading": "Último mes de la serie", "text": text})
    country = country_hint
    if r and r["area"].get("country"):
        country = r["area"]["country"]
    w = _watch(level="mun" if country == "Mexico" else "adm2", country=country, top=5)
    if w["rows"]:
        sections.append({"heading": f"Unidades administrativas bajo vigilancia ({country})", "period": w["period"],
                         "items": [{"name": x["name"], "text": x["text"]} for x in w["rows"]],
                         "text": " ".join(f"{x['name']}: {x['text']}" for x in w["rows"])})
    sections.append({"heading": "Aviso", "text": "Boletín generado por plantilla a partir de la serie armonizada; "
                     "las estimaciones 2001-2011 tienen incertidumbre. No es una alerta oficial."})
    title = f"Boletín semanal de actividad de fuego{' - ' + w['period'] if w.get('period') else ''}"
    return title, sections, sources, r


def _polish(sections):
    """Optionally rewrite prose with the LLM; keep the template when any number would change."""
    from ai.intent import setting
    from ai.narrate import numbers_preserved
    if not setting("ANTHROPIC_API_KEY"):
        return sections, False
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=setting("ANTHROPIC_API_KEY"), timeout=8.0)
        out, changed = [], False
        for s in sections:
            text = s.get("text", "")
            if len(text) < 20 or s["heading"] == "Aviso":
                out.append(s)
                continue
            resp = client.messages.create(model=setting("FIRELY_LLM_MODEL", "claude-sonnet-5-5"), max_tokens=400,
                                          system="Reescribe en español, claro y breve. No agregues ni cambies cifras, nombres ni afirmaciones. Solo texto plano.",
                                          messages=[{"role": "user", "content": text}])
            new = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
            if new and numbers_preserved(new, {"t": text}) and numbers_preserved(text, {"t": new}):
                out.append({**s, "text": new})
                changed = True
            else:
                out.append(s)
        return out, changed
    except Exception:
        return sections, False


@router.get("/bulletin")
def bulletin(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
             radius_km: float | None = None, admin: str | None = None, geometry: str | None = None,
             polish: bool = False):
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if not cells:
        raise HTTPException(422, "bulletin requires an area selector")
    title, sections, sources, _ = build_bulletin(cells, area, area.get("country") or "Mexico")
    polished = False
    if polish:
        sections, polished = _polish(sections)
    return _envelope(_cutoff(), area=area, title=title, sections=sections, sources=sources,
                     generated_by="llm+template" if polished else "template",
                     generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))


# ----------------------------------------------------------------------------------------------- 3. CAP drafts

CAP_SEVERITIES = ("Minor", "Moderate", "Severe", "Extreme")
_URGENCY = {"Minor": "Future", "Moderate": "Expected", "Severe": "Expected", "Extreme": "Immediate"}
_ID = re.compile(r"^[0-9a-f]{32}$")
APPROVED = "aprobado_para_ejercicio"


def _cap_dir():
    path = db.processed_root() / "cap_drafts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _area_polygon(cells):
    if not cells:
        return None
    shape = unary_union([Polygon([(lon, lat) for lat, lon in h3.cell_to_boundary(c)]) for c in cells])
    if shape.geom_type != "Polygon":
        shape = shape.convex_hull
    return " ".join(f"{lat:.5f},{lon:.5f}" for lon, lat in shape.exterior.coords)


def build_cap_xml(*, identifier, sent, text, severity, area_desc, polygon):
    poly = f"<polygon>{polygon}</polygon>" if polygon else ""
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">'
            f"<identifier>{identifier}</identifier><sender>firely-demo@invalid.example</sender><sent>{sent}</sent>"
            "<status>Exercise</status><msgType>Alert</msgType><scope>Restricted</scope>"
            "<restriction>Borrador de ejercicio; no publicar a la población</restriction>"
            "<note>Simulacro. Fuente: NASA FIRMS. Requiere aprobación humana.</note>"
            "<info><language>es</language><category>Fire</category><event>Actividad de fuego (ejercicio)</event>"
            f"<urgency>{_URGENCY[severity]}</urgency><severity>{severity}</severity><certainty>Possible</certainty>"
            f"<headline>{escape(text[:120])}</headline><description>{escape(text)}</description>"
            "<instruction>Ejercicio: sin acciones para la población.</instruction>"
            f"<area><areaDesc>{escape(area_desc)}</areaDesc>{poly}</area></info></alert>")


class CapDraftRequest(BaseModel):
    area: str | dict
    text: str = Field(min_length=1, max_length=1000)
    severity: str = "Moderate"


def _draft_cells(area):
    """str -> administrative unit name; dict -> area selectors (h3, bbox, lat/lon/radius_km, admin, geometry)."""
    if isinstance(area, str):
        try:
            unit = geo.resolve(area)
        except HTTPException:
            return None, area
        return sorted(geo.cells(unit)), f"{unit['name']} ({unit['parent'] or unit['country']})"
    keys = {k: area.get(k) for k in ("h3", "bbox", "lat", "lon", "radius_km", "admin", "geometry")}
    cells, desc = _cells(h3_list=keys["h3"], bbox=keys["bbox"], lat=keys["lat"], lon=keys["lon"],
                         radius_km=keys["radius_km"], geometry=keys["geometry"], admin=keys["admin"])
    return cells, area.get("areaDesc") or desc.get("name") or f"area {desc['type']}"


@router.post("/cap/draft")
def cap_draft(req: CapDraftRequest):
    if req.severity not in CAP_SEVERITIES:
        raise HTTPException(422, f"severity must be one of {', '.join(CAP_SEVERITIES)}")
    cells, desc = _draft_cells(req.area)
    ident = uuid.uuid4().hex
    sent = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    xml = build_cap_xml(identifier=f"firely-{ident}", sent=sent, text=req.text.strip(), severity=req.severity,
                        area_desc=str(desc), polygon=_area_polygon(cells))
    draft = {"id": ident, "status": "Exercise", "approval": "borrador", "severity": req.severity, "text": req.text.strip(),
             "area_desc": str(desc), "created_at": sent, "approved_at": None, "xml": xml}
    (_cap_dir() / f"{ident}.json").write_text(json.dumps(draft, ensure_ascii=False), encoding="utf-8")
    return _envelope(_cutoff(), draft=draft, published=False)


def _load(ident):
    if not _ID.match(ident):
        raise HTTPException(404, "Draft not found")
    path = _cap_dir() / f"{ident}.json"
    if not path.is_file():
        raise HTTPException(404, "Draft not found")
    return path, json.loads(path.read_text(encoding="utf-8"))


@router.post("/cap/approve/{draft_id}")
def cap_approve(draft_id: str):
    path, draft = _load(draft_id)
    draft["approval"] = APPROVED  # CAP status stays Exercise: approval never means publication to the public
    draft["status"] = "Exercise"
    draft["approved_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    path.write_text(json.dumps(draft, ensure_ascii=False), encoding="utf-8")
    return _envelope(_cutoff(), draft=draft, published=False,
                     note="Aprobado solo para ejercicio; Firely no publica alertas a la población.")


@router.get("/cap/drafts")
def cap_drafts():
    drafts = []
    for p in sorted(_cap_dir().glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        drafts.append({k: d.get(k) for k in ("id", "status", "approval", "severity", "area_desc", "text", "created_at", "approved_at")})
    drafts.sort(key=lambda d: d["created_at"] or "", reverse=True)
    return _envelope(_cutoff(), drafts=drafts)


# ----------------------------------------------------------------------------------------------- 4. spread + wind localities

CONE_HALF_ANGLE = 22.5
# Rule of thumb for orientation only: the fire front advances ~5% of the wind speed (km/h of spread per km/h of wind),
# capped at 50 km. Smoke is carried ~50% of the wind speed, capped at 100 km. Neither replaces fire-behaviour models.
SPREAD_FACTOR = 0.05
SMOKE_FACTOR = 0.5
SPREAD_MAX_KM, SMOKE_MAX_KM = 50.0, 100.0
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
WARNING = "Estimación orientativa basada solo en el viento; no es un pronóstico oficial ni sustituye modelos de comportamiento del fuego ni la evaluación en campo."


def _fetch_wind(lat, lon, hours):
    """Mean wind over the next `hours` (vector average). Returns {speed_kmh, from_deg}. Mocked in tests."""
    try:
        r = requests.get(OPEN_METEO, timeout=8, params={
            "latitude": lat, "longitude": lon, "hourly": "wind_speed_10m,wind_direction_10m", "wind_speed_unit": "kmh",
            "forecast_hours": hours, "timezone": "UTC"})
        r.raise_for_status()
        h = r.json()["hourly"]
        pairs = [(s, d) for s, d in zip(h["wind_speed_10m"], h["wind_direction_10m"]) if s is not None and d is not None]
        if not pairs:
            raise ValueError("empty wind series")
    except (requests.RequestException, KeyError, ValueError, TypeError) as exc:
        raise HTTPException(503, detail={"code": "wind_unavailable", "message": "Open-Meteo wind data is unavailable"}) from exc
    # Wind direction is where the wind comes FROM.
    u = sum(-s * math.sin(math.radians(d)) for s, d in pairs) / len(pairs)
    v = sum(-s * math.cos(math.radians(d)) for s, d in pairs) / len(pairs)
    return {"speed_kmh": sum(s for s, _ in pairs) / len(pairs), "from_deg": (math.degrees(math.atan2(-u, -v)) % 360),
            "mean_vector_kmh": math.hypot(u, v), "hours": len(pairs)}


def _destination(lat, lon, bearing, km):
    r, d, b = 6371.0088, km / 6371.0088, math.radians(bearing)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180


def _bearing(lat1, lon1, lat2, lon2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    return math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) % 360


def _compass(deg):
    return ("N", "NE", "E", "SE", "S", "SW", "W", "NW")[int((deg + 22.5) // 45) % 8]


def _cone(lat, lon, bearing, reach_km, n=12):
    ring = [[lon, lat]]
    for i in range(n + 1):
        plat, plon = _destination(lat, lon, bearing - CONE_HALF_ANGLE + 2 * CONE_HALF_ANGLE * i / n, reach_km)
        ring.append([round(plon, 5), round(plat, 5)])
    ring.append([lon, lat])
    return {"type": "Polygon", "coordinates": [ring]}


def _origin(h3_, bbox, lat, lon, radius_km, admin, geometry, event_id):
    if event_id:
        files = [str(p) for p in (db.processed_root() / "events").glob("*/year=*/*.parquet")]
        if not files:
            raise HTTPException(404, "Event not found")
        with db.connection() as con:
            row = con.execute(f"SELECT centroid_lat, centroid_lon FROM {db.table_sql(files)} WHERE event_id=? LIMIT 1", [files, event_id]).fetchone()
        if not row:
            raise HTTPException(404, "Event not found")
        return row[0], row[1], {"type": "event", "event_id": event_id}
    if lat is not None and lon is not None and not (h3_ or bbox or admin or geometry):
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise HTTPException(422, "Invalid lat/lon")
        return lat, lon, {"type": "point", "lat": lat, "lon": lon}
    cells, area = _area(h3_, bbox, lat, lon, radius_km, admin, geometry)
    if not cells:
        raise HTTPException(422, "Specify an area, lat/lon or event_id")
    pts = [h3.cell_to_latlng(c) for c in cells]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), area


def _wind_context(origin_lat, origin_lon, hours):
    wind = _fetch_wind(origin_lat, origin_lon, hours)
    toward = (wind["from_deg"] + 180) % 360
    return wind, toward


@router.get("/spread")
def spread(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
           radius_km: float | None = None, admin: str | None = None, geometry: str | None = None,
           event_id: str | None = None, hours: int = Query(24, ge=1, le=72)):
    olat, olon, area = _origin(h3, bbox, lat, lon, radius_km, admin, geometry, event_id)
    wind, toward = _wind_context(olat, olon, hours)
    reach = min(max(wind["speed_kmh"] * SPREAD_FACTOR * hours, 0.5), SPREAD_MAX_KM)
    return _envelope(_cutoff(), area=area, indicative=True, official_forecast=False, warning=WARNING, hours=hours,
                     origin={"lat": olat, "lon": olon},
                     wind={"speed_kmh": round(wind["speed_kmh"], 1), "from_deg": round(wind["from_deg"], 1),
                           "source": "Open-Meteo", "hours": wind["hours"]},
                     direction={"toward_deg": round(toward, 1), "toward_compass": _compass(toward)},
                     reach_km=round(reach, 1), half_angle_deg=CONE_HALF_ANGLE,
                     method=f"Alcance = velocidad media del viento x {SPREAD_FACTOR} x horas (mín 0.5 km, máx {SPREAD_MAX_KM:g} km); cono de ±{CONE_HALF_ANGLE}° hacia donde sopla el viento.",
                     cone={"type": "Feature", "geometry": _cone(olat, olon, toward, reach),
                           "properties": {"kind": "spread_cone", "indicative": True}})


@router.get("/wind-localities")
def wind_localities(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
                    radius_km: float | None = None, admin: str | None = None, geometry: str | None = None,
                    event_id: str | None = None, hours: int = Query(24, ge=1, le=72),
                    limit: int = Query(30, ge=1, le=200)):
    olat, olon, area = _origin(h3, bbox, lat, lon, radius_km, admin, geometry, event_id)
    wind, toward = _wind_context(olat, olon, hours)
    reach = min(max(wind["speed_kmh"] * SMOKE_FACTOR * hours, 1.0), SMOKE_MAX_KM)
    dlat = reach / 111.0
    dlon = reach / (111.0 * max(math.cos(math.radians(olat)), 0.05))
    found = []
    for country in COUNTRY_BOUNDS:
        path = db.file_path("geo/localities.parquet", country)
        if not path:
            continue
        with db.connection() as con:
            rows = con.execute("SELECT name, pop, lat, lon FROM read_parquet(?) WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                               [path, olat - dlat, olat + dlat, olon - dlon, olon + dlon]).fetchall()
        for name, pop, la, lo in rows:
            dist = h3lib.great_circle_distance((olat, olon), (la, lo), unit="km")
            if dist > reach:
                continue
            brg = _bearing(olat, olon, la, lo)
            if dist > 0.01 and abs((brg - toward + 180) % 360 - 180) > CONE_HALF_ANGLE:
                continue
            found.append({"name": name, "country": country, "pop": pop, "lat": la, "lon": lo,
                          "distance_km": round(dist, 1), "bearing_deg": round(brg, 1), "compass": _compass(brg)})
    found.sort(key=lambda x: -(x["pop"] or 0))
    return _envelope(_cutoff(), area=area, indicative=True, official_forecast=False, warning=WARNING, hours=hours,
                     origin={"lat": olat, "lon": olon},
                     wind={"speed_kmh": round(wind["speed_kmh"], 1), "from_deg": round(wind["from_deg"], 1), "source": "Open-Meteo"},
                     direction={"toward_deg": round(toward, 1), "toward_compass": _compass(toward)},
                     reach_km=round(reach, 1), half_angle_deg=CONE_HALF_ANGLE, n_localities=len(found),
                     localities=found[:limit],
                     method=f"Localidades dentro de ±{CONE_HALF_ANGLE}° del rumbo del viento y a menos de velocidad x {SMOKE_FACTOR} x horas (máx {SMOKE_MAX_KM:g} km); ordenadas por población.",
                     sector={"type": "Feature", "geometry": _cone(olat, olon, toward, reach), "properties": {"kind": "smoke_sector", "indicative": True}})


# ----------------------------------------------------------------------------------------------- 5. regimes

EARLY = (2001, 2012)
LATE = (2013, 2026)
RATIO_CHANGE = 3.0      # mean annual count tripled or cut to a third
SEASON_SHIFT_MONTHS = 3  # circular distance between peak months
MIN_ANNUAL = 1.0        # cells below this mean annual count in both periods are not flagged (noise)
MAX_REGIME_CELLS = 5000


def _cell_polygon(cell):
    ring = [[lon_, lat_] for lat_, lon_ in h3.cell_to_boundary(cell)]
    return {"type": "Polygon", "coordinates": [ring + [ring[0]]]}


def _circ(a, b):
    d = abs(a - b) % 12
    return min(d, 12 - d)


@router.get("/regimes")
def regimes(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None, geometry: str | None = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if not cells:
        raise HTTPException(422, "regimes requires an area selector")
    if len(cells) > MAX_REGIME_CELLS:
        raise HTTPException(422, f"Area too large ({len(cells)} cells, max {MAX_REGIME_CELLS})")
    cellset = set(cells)
    klass, biome = {}, {}
    for c in COUNTRIES:
        cp, bp = db.file_path(f"cell_class/{c}.parquet"), db.file_path(f"cell_biome/{c}.parquet")
        with db.connection() as con:
            if cp:
                klass.update(dict(con.execute("SELECT h3_r6, fire_regime_class FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?))", [cp, cells]).fetchall()))
            if bp:
                biome.update(dict(con.execute("SELECT h3_r6, igbp FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?))", [bp, cells]).fetchall()))
    # per cell, per period: mean annual count (over the years of the period with any data) and peak month
    files = [f for c in COUNTRIES for f in _files("cell_month_harmonized", country=c)]
    stats = {}
    if files:
        with db.connection() as con:
            rows = con.execute(f"""SELECT h3_r6, year, month, sum(count_harm) n FROM {db.table_sql(files)}
                                   WHERE h3_r6 IN (SELECT unnest(?)) AND year BETWEEN ? AND ? GROUP BY 1,2,3""",
                               [files, cells, EARLY[0], LATE[1]]).fetchall()
        acc = {}
        for cell, y, m, n in rows:
            per = "early" if y <= EARLY[1] else "late"
            a = acc.setdefault(cell, {"early": {"years": set(), "total": 0.0, "month": [0.0] * 12},
                                      "late": {"years": set(), "total": 0.0, "month": [0.0] * 12}})[per]
            a["years"].add(y)
            a["total"] += n or 0.0
            a["month"][m - 1] += n or 0.0
        for cell, d in acc.items():
            out = {}
            for per, a in d.items():
                if a["years"]:
                    out[per] = {"annual": a["total"] / len(a["years"]), "peak": 1 + max(range(12), key=lambda i: a["month"][i]) if a["total"] > 0 else None}
            stats[cell] = out
    features, class_counts, changed = [], {}, 0
    for cell in sorted(cellset):
        k = klass.get(cell)
        key = "sin_clase" if k is None else str(k)
        class_counts[key] = class_counts.get(key, 0) + 1
        s = stats.get(cell, {})
        e, l = s.get("early"), s.get("late")
        change = None
        if e and l:
            ratio = (l["annual"] / e["annual"]) if e["annual"] > 0 else None
            shift = _circ(l["peak"], e["peak"]) if e["peak"] and l["peak"] else None
            active = max(e["annual"], l["annual"]) >= MIN_ANNUAL
            flag = bool(active and ((ratio is None and l["annual"] >= MIN_ANNUAL)
                                    or (ratio is not None and (ratio >= RATIO_CHANGE or ratio <= 1 / RATIO_CHANGE))
                                    or (shift is not None and shift >= SEASON_SHIFT_MONTHS)))
            changed += flag
            change = {"annual_early": round(e["annual"], 2), "annual_late": round(l["annual"], 2),
                      "ratio": None if ratio is None else round(ratio, 2), "peak_month_early": e["peak"],
                      "peak_month_late": l["peak"], "peak_shift_months": shift, "changed": flag}
        features.append({"type": "Feature",
                         "geometry": _cell_polygon(cell),
                         "properties": {"h3": cell, "regime_class": k, "igbp": biome.get(cell), "changed": bool(change and change["changed"]),
                                        "change": change}})
    n_change = sum(1 for f in features if f["properties"]["change"])
    return _envelope(_cutoff(), area=area, n_cells=len(cells),
                     regime_counts=class_counts,
                     regime_note="regime_class son 5 grupos de comportamiento del fuego derivados de MODIS (proxies, sin nombre asignado); sin_clase = celda fuera de la tabla cell_class.",
                     change={"periods": {"early": list(EARLY), "late": list(LATE)}, "n_cells_compared": n_change, "n_cells_changed": changed,
                             "share_changed": round(changed / n_change, 3) if n_change else None,
                             "criteria": f"Cambio = media anual por celda x{RATIO_CHANGE:g} o /{RATIO_CHANGE:g}, o mes pico desplazado >= {SEASON_SHIFT_MONTHS} meses; celdas con < {MIN_ANNUAL} detecciones anuales en ambos periodos no se marcan.",
                             "uncertainty": "El primer periodo (2001-2011) es armonizado desde MODIS (estimado); parte del cambio puede ser incertidumbre de la armonización."},
                     type="FeatureCollection", features=features)
