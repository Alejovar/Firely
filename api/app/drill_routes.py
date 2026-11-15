"""GET /drill: training scenario built from a real historical event of the area (§11.2 "Escenarios de simulacro").

The scenario is staged (detection -> exposure -> evolution -> outcome). Every number comes from the processed
tables (events, hotspots, cell_month_harmonized, ONI, FWI, localities); the text is a fixed template, and the
decision questions have no "right answer": they are prompts for the brigade's discussion. The outcome stage is
what actually happened, revealed last.
"""
from __future__ import annotations

import statistics
from datetime import date

import h3 as h3lib
from fastapi import APIRouter, HTTPException, Query

from . import db, real
from .extra_routes import COUNTRY_BOUNDS, MONTHS, _area, _months
from .real import _cutoff, _envelope

router = APIRouter()
LOCALITY_RADIUS_KM = 30.0
DISCLAIMER = ("Ejercicio de entrenamiento con un evento histórico real. Las preguntas no tienen respuesta única; "
              "no sustituye protocolos oficiales ni la evaluación en campo. La extensión aproximada no es área quemada.")


def _nearby_localities(lat, lon, radius_km=LOCALITY_RADIUS_KM, limit=5):
    lat, lon = float(lat), float(lon)
    dlat = radius_km / 111.0
    found = []
    for country, (w, s, e, n) in COUNTRY_BOUNDS.items():
        if not (w <= lon <= e and s <= lat <= n):
            continue
        path = db.file_path("geo/localities.parquet", country)
        if not path:
            continue
        with db.connection() as con:
            rows = con.execute("SELECT name, pop, lat, lon FROM read_parquet(?) WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                               [path, lat - dlat, lat + dlat, lon - 2 * dlat, lon + 2 * dlat]).fetchall()
        for name, pop, la, lo in rows:
            d = h3lib.great_circle_distance((lat, lon), (la, lo), unit="km")
            if d <= radius_km:
                found.append({"name": name, "pop": pop, "distance_km": round(d, 1)})
    found.sort(key=lambda x: x["distance_km"])
    return found[:limit]


def _daily_counts(cells, start, end):
    cols, rows = real._hotspot_rows(db.parquet_files("hotspots"), cells, start, end)
    if not cols:
        return []
    idx_d, idx_n = cols.index("date_local"), cols.index("daynight") if "daynight" in cols else None
    days = {}
    for r in rows:
        key = r[idx_d].isoformat() if hasattr(r[idx_d], "isoformat") else str(r[idx_d])
        d = days.setdefault(key, {"date": key, "detections": 0, "night": 0})
        d["detections"] += 1
        if idx_n is not None and r[idx_n] == "N":
            d["night"] += 1
    return [days[k] for k in sorted(days)]


def _ordinal(n):
    return f"{n}.º"


def build_scenario(event, all_events, monthly, oni, fwi, localities, daily):
    start = date.fromisoformat(event["start_date"])
    y, m = start.year, start.month
    name = MONTHS[m - 1].lower()
    stages = []
    # 1. detection
    medians = {}
    for yy, mm, v in monthly:
        if yy != y:
            medians.setdefault(mm, []).append(v or 0.0)
    med = {k: statistics.median(v) for k, v in medians.items() if v}
    facts = []
    if med:
        rank = sorted(med, key=lambda k: -med[k]).index(m) + 1 if m in med else None
        if rank:
            facts.append(f"Históricamente, {name} es el {_ordinal(rank)} mes más activo del año en esta zona.")
        cur = next((v for yy, mm, v in monthly if yy == y and mm == m), None)
        if cur is not None and med.get(m):
            facts.append(f"Ese {name} cerró con {cur / med[m]:.1f}× la mediana de {name} (serie armonizada).")
    o = oni.get((y, m))
    if o and o[1]:
        facts.append(f"Fase ENSO del mes: {o[1]}" + (f" (ONI {o[0]:+.1f})." if o[0] is not None else "."))
    f = fwi.get((y, m))
    if f and f[0] is not None:
        facts.append(f"Anomalía del índice de peligro FWI (GFWED) en el mes: {f[0]:+.1f}.")
    first = daily[0]["detections"] if daily else None
    stages.append({"key": "deteccion", "title": f"Día 1 · {event['start_date']}",
                   "situation": (f"El satélite registra {first} detección(es) nueva(s) cerca de ({event['centroid_lat']:.2f}, {event['centroid_lon']:.2f})."
                                 if first else f"Aparece un grupo de detecciones cerca de ({event['centroid_lat']:.2f}, {event['centroid_lon']:.2f})."),
                   "facts": facts,
                   "question": "Con esta información, ¿qué hacen primero: verificar en campo, alistar una brigada o seguir vigilando? ¿Por qué?"})
    # 2. exposure
    if localities:
        loc_txt = "; ".join(f"{l['name']} a {l['distance_km']} km" + (f" ({int(l['pop'])} hab.)" if l.get("pop") else "") for l in localities)
        situation = f"Localidades a menos de {LOCALITY_RADIUS_KM:g} km del centro del evento: {loc_txt}."
    else:
        situation = f"No hay localidades registradas a menos de {LOCALITY_RADIUS_KM:g} km del centro del evento."
    stages.append({"key": "exposicion", "title": "¿Quién está cerca?", "situation": situation, "facts": [],
                   "question": "¿A quién avisan primero y por qué canal? ¿Qué información mínima necesita esa localidad?"})
    # 3. evolution
    if daily:
        peak = max(daily, key=lambda d: d["detections"])
        nights = sum(1 for d in daily if d["night"] > 0)
        evo = [f"Día de más actividad: {peak['date']} con {peak['detections']} detecciones.",
               f"Hubo detecciones nocturnas en {nights} de {len(daily)} días con actividad."]
    else:
        evo = []
    if event.get("night_ratio") is not None:
        evo.append(f"Proporción de detecciones nocturnas del evento: {100 * event['night_ratio']:.0f}% (persistencia).")
    stages.append({"key": "evolucion", "title": "Evolución", "situation": "El evento sigue activo en los pasos siguientes del satélite.",
                   "facts": evo, "daily": daily[:60],
                   "question": "Si sigue activo de noche, ¿mantienen la operación nocturna o reposicionan? ¿Qué recursos piden?"})
    # 4. outcome
    n = len(all_events)
    outcome = [f"Duración: {event['duration_days']} día(s), del {event['start_date']} al {event['end_date']}.",
               f"Detecciones equivalentes (armonizadas): {event['n_hotspots_harm']:.0f}.",
               f"Extensión aproximada: {event['area_approx_km2']:.1f} km² (no es área quemada)."]
    if event.get("area_rank") and n:
        outcome.append(f"Fue el {_ordinal(event['area_rank'])} evento más grande de {n} registrados en el área (por detecciones).")
    if event.get("duration_rank") and n:
        outcome.append(f"Por duración, el {_ordinal(event['duration_rank'])} de {n}.")
    stages.append({"key": "desenlace", "title": "Lo que ocurrió", "situation": "Revelen el desenlace solo después de discutir las etapas anteriores.",
                   "facts": outcome,
                   "question": "Comparen sus decisiones con lo ocurrido: ¿qué harían distinto con la información de la etapa 1?"})
    return stages


@router.get("/drill")
def drill(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
          radius_km: float | None = None, admin: str | None = None, geometry: str | None = None,
          event_id: str | None = None, min_hotspots: int = Query(10, ge=3, le=10000),
          pick: str = Query("largest", pattern="^(largest|longest|recent)$")):
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if cells is None:
        raise HTTPException(422, "drill requires an area selector")
    listed = real.events(h3_list=h3, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km, admin=admin,
                         geometry=geometry, min_hotspots=min_hotspots)["rows"]
    if not listed:
        raise HTTPException(404, f"No historical events with at least {min_hotspots} detections in this area")
    if event_id:
        event = next((e for e in listed if e["event_id"] == event_id), None)
        if event is None:
            raise HTTPException(404, "Event not found in this area")
    elif pick == "longest":
        event = max(listed, key=lambda e: (e["duration_days"], e["n_hotspots_harm"]))
    elif pick == "recent":
        event = max(listed, key=lambda e: e["start_date"])
    else:
        event = max(listed, key=lambda e: e["n_hotspots_harm"])
    start, end = date.fromisoformat(event["start_date"]), date.fromisoformat(event["end_date"])
    event_cells = [c for c in (event.get("cells") or []) if c in set(cells)] or event.get("cells") or cells
    stages = build_scenario(
        event, listed, _months(cells), real._oni(),
        real._context_months("context/fwi_coahuila_month.parquet", cells, ["fwi_anom"]),
        _nearby_localities(event["centroid_lat"], event["centroid_lon"]),
        _daily_counts(list(event_cells), start, end))
    public = {k: v for k, v in event.items() if k not in ("geometry_wkb_hex", "cells")}
    return _envelope(_cutoff(), area=area, event=public, n_events_in_area=len(listed), stages=stages,
                     generated_by="template", disclaimer=DISCLAIMER,
                     method="Evento real de la tabla events (clustering §8.1); contexto de cell_month_harmonized, ONI, FWI y localidades. Texto por plantilla; ninguna cifra la genera un modelo.")
