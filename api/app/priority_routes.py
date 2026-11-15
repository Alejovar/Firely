"""Priority index per H3 r6 cell (§8.16 of docs/firely-descripcion.md).

Same components, weights and formula as the area index of /risk (api/app/extra_routes.py), evaluated cell by cell:

- anomaly: percentile of the cell's latest-month harmonized count among the same calendar month of other years;
- recurrence: years with at least one equivalent detection in the 15 complete years before, divided by 3 (capped
  at 1: three years or more = 1, the same threshold the area index uses);
- exposure: population of the localities in the cell and its first ring (~10 km), same log scale as /risk;
- season: 1 if the month is among the cell's three highest historical medians, .5 if adjacent;
- fwi: GFWED monthly FWI percentile of the cell where available (Coahuila).

It is a prioritization aid, not a probability of fire.
"""
from __future__ import annotations

import statistics

import h3 as h3lib
from fastapi import APIRouter, HTTPException

from . import db
from .extra_routes import (MONTHS, _area, _combine, _exposure_value, _files_for_cells, _level,
                           _locality_points, _percentile, _season_value, _weights)
from .real import _cutoff, _envelope

router = APIRouter()
MAX_CELLS = 3000
LABELS = {"anomaly": "Anomalía", "recurrence": "Recurrencia", "exposure": "Exposición", "season": "Temporada",
          "fwi": "Peligro meteorológico (FWI)"}


def _cell_months(cells):
    files = _files_for_cells("cell_month_harmonized", cells)
    if not files or not cells:
        return []
    with db.connection() as con:
        return con.execute(f"SELECT h3_r6, year, month, sum(count_harm) FROM {db.table_sql(files)} "
                           "WHERE h3_r6 IN (SELECT unnest(?)) GROUP BY 1,2,3", [files, cells]).fetchall()


def _cell_fwi(cells, year, month):
    path = db.file_path("context/fwi_coahuila_month.parquet")
    if not path or not cells:
        return {}
    with db.connection() as con:
        rows = con.execute("SELECT h3_r6, year, avg(fwi_mean) FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?)) "
                           "AND month=? GROUP BY 1,2", [path, cells, month]).fetchall()
    series = {}
    for cell, y, v in rows:
        if v is not None:
            series.setdefault(cell, {})[y] = v
    out = {}
    for cell, values in series.items():
        if year in values and len(values) >= 4:
            out[cell] = _percentile(values[year], [v for y, v in values.items() if y != year])
    return out


def score_cells(cells, weights):
    """{cell: {"index", "level", "components": {key: value}}} plus the evaluated (year, month)."""
    rows = _cell_months(cells)
    if not rows:
        return {}, None
    year, month = max((y, m) for _, y, m, _ in rows)
    by_cell = {}
    for cell, y, m, v in rows:
        by_cell.setdefault(cell, {})[(y, m)] = v or 0.0
    fwi = _cell_fwi(cells, year, month) if weights.get("fwi", 0) > 0 else {}
    population, has_pop = {}, False
    if weights.get("exposure", 0) > 0:
        ring = sorted({n for c in cells for n in h3lib.grid_disk(c, 1)})
        points, total = _locality_points(ring)
        has_pop = total is not None
        if has_pop:
            for _name, pop, _lat, _lon, cell in points:
                population[cell] = population.get(cell, 0) + (pop or 0)
    out = {}
    for cell in cells:
        series = by_cell.get(cell, {})
        if not series:
            # No harmonized fire history (e.g. outside the processed countries): exposure alone is not a fire priority.
            out[cell] = {"index": None, "level": "sin datos", "components": {}, "current_count": None, "population_10km": None}
            continue
        comps = []
        current = series.get((year, month))
        refs = [v for (y, m), v in series.items() if m == month and y != year]
        if current is not None and refs:
            comps.append({"key": "anomaly", "value": _percentile(current, refs)})
        annual = {}
        for (y, m), v in series.items():
            if year - 15 <= y < year:
                annual[y] = annual.get(y, 0.0) + v
        if annual:
            comps.append({"key": "recurrence", "value": min(1.0, sum(v >= 1.0 for v in annual.values()) / 3)})
        if has_pop:
            pop = sum(population.get(n, 0) for n in h3lib.grid_disk(cell, 1))
            comps.append({"key": "exposure", "value": _exposure_value(pop), "population": pop})
        months = {}
        for (y, m), v in series.items():
            if y < year:
                months.setdefault(m, []).append(v)
        if months:
            comps.append({"key": "season", "value": _season_value(month, {m: statistics.median(vs) for m, vs in months.items()})[0]})
        if cell in fwi:
            comps.append({"key": "fwi", "value": fwi[cell]})
        index, _ = _combine(comps, weights)
        out[cell] = {"index": index, "level": _level(index),
                     "components": {c["key"]: round(c["value"], 3) for c in comps if weights.get(c["key"], 0) > 0},
                     "current_count": None if current is None else round(current, 2),
                     "population_10km": next((c["population"] for c in comps if c["key"] == "exposure"), None)}
    return out, (year, month)


@router.get("/priority/cells")
def priority_cells(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
                   lon: float | None = None, radius_km: float | None = None,
                   admin: str | None = None, geometry: str | None = None,
                   w_anomaly: float | None = None, w_recurrence: float | None = None, w_exposure: float | None = None,
                   w_season: float | None = None, w_fwi: float | None = None):
    weights = _weights(anomaly=w_anomaly, recurrence=w_recurrence, exposure=w_exposure, season=w_season, fwi=w_fwi)
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if cells is None:
        raise HTTPException(422, "priority/cells requires an area selector")
    if not cells:
        raise HTTPException(404, "Empty area")
    if len(cells) > MAX_CELLS:
        raise HTTPException(422, detail={"code": "area_too_large",
                                         "message": f"At most {MAX_CELLS} r6 cells; this area has {len(cells)}"})
    scores, period = score_cells(cells, weights)
    if period is None:
        raise HTTPException(404, "No harmonized activity for this area")
    year, month = period
    features = []
    for cell, s in scores.items():
        ring = [[lon_, lat_] for lat_, lon_ in h3lib.cell_to_boundary(cell)]
        ring.append(ring[0])
        features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                         "properties": {"h3": cell, **s}})
    features.sort(key=lambda f: (f["properties"]["index"] is None, -(f["properties"]["index"] or 0), f["properties"]["h3"]))
    top10 = [{"h3": f["properties"]["h3"], "index": f["properties"]["index"], "level": f["properties"]["level"],
              "components": f["properties"]["components"]} for f in features if f["properties"]["index"] is not None][:10]
    shown = ", ".join(f"{LABELS[k].lower()} ({w:g})" for k, w in weights.items() if w > 0)
    return _envelope(_cutoff(), area=area, type="FeatureCollection", features=features, top10=top10,
                     period=f"{year:04d}-{month:02d}", weights=weights, labels=LABELS,
                     summary_es=(f"{sum(f['properties']['level'] in ('alta', 'extrema') for f in features)} de {len(features)} "
                                 f"celdas con prioridad alta o extrema en {MONTHS[month-1].lower()} {year}."),
                     method=(f"Índice de prioridad por celda v1 (mismos componentes y pesos que /risk): media ponderada de {shown}; "
                             "en cada celda se renormaliza sobre los componentes con datos. Recurrencia = años con al menos "
                             "una detección equivalente en los 15 años previos / 3 (máx. 1). Exposición = población de "
                             "localidades en la celda y su primer anillo (~10 km). No es una probabilidad de incendio."),
                     disclaimer="Herramienta de apoyo; no reemplaza el conocimiento local.")

