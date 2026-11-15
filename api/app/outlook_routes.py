"""Seasonal fire-activity outlook, 1-3 months ahead per H3 r6 cell (docs/plan-modelo-predictivo.md §14).

GET /forecast  (same area selectors as /calendar: h3, bbox, lat+lon[+radius_km], geometry, admin; none = country
totals). Reads data/processed/forecast/forecast_cell.parquet, forecast_area.parquet and forecast_summary.json
(pipeline.forecast_export / forecast_evaluate). The numbers come only from those tables: the assistant, bot and MCP
narrate this response, never compute it.

Regla de oro: for a country and horizon where the back-test (2023-2025) did not beat climatology, the response
says so and `show` is "climatology".
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from . import db
from .real import ATTRIBUTION, _cells, _cutoff

router = APIRouter()
NOTE = ("Perspectiva de actividad de fuego (detecciones armonizadas esperadas), no pronóstico de dónde empieza un "
        "incendio. Comparar siempre contra lo normal del mes.")


@lru_cache(maxsize=1)
def _summary(mtime: float) -> dict:
    path = db.processed_root() / "forecast" / "forecast_summary.json"
    return json.loads(path.read_text(encoding="utf-8"))


def summary() -> dict:
    path = db.processed_root() / "forecast" / "forecast_summary.json"
    if not path.is_file():
        raise HTTPException(503, detail={"code": "forecast_unavailable", "message": "Forecast tables not built"})
    return _summary(path.stat().st_mtime)


def _skill(s: dict, country: str, h: int, totals: bool = False) -> dict:
    """Back-test verdict. Country totals are judged on their own (median monthly error of the national total in
    2023-2025): summing cells can lose to climatology even where the cells beat it."""
    row = next((r for r in s.get("by_country", []) if r["country"] == country and r["horizon"] == h), None)
    key = "totals_beat_climatology" if totals else "beats_climatology"
    beats = s.get(key, {}).get(country, {}).get(str(h))
    out = {"beats_climatology": beats, "judged_on": "national_total" if totals else "cells"}
    if row:
        out.update(skill_vs_climatology=round(row["skill_vs_b0"], 3), rpss=round(row["rpss_vs_clim"], 3),
                   capture10=round(row["capture10_model"], 3), capture10_climatology=round(row["capture10_b0"], 3))
    return out


def _category(p_below, p_near, p_above):
    probs = {"below": p_below, "near": p_near, "above": p_above}
    return max(probs, key=probs.get)


@router.get("/forecast")
def forecast(h3: Optional[str] = None, bbox: Optional[str] = None,
             lat: Optional[float] = None, lon: Optional[float] = None,
             radius_km: Optional[float] = None, geometry: Optional[str] = None,
             admin: Optional[str] = None,
             horizon: Optional[int] = Query(None, ge=1, le=3),
             kind: Literal["forecast", "backtest"] = "forecast",
             issue: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$",
                                          description="issue month YYYY-MM (backtest); default = latest")):
    s = summary()
    cells, area = _cells(h3, bbox, lat, lon, radius_km, geometry, admin)
    fc = db.processed_root() / "forecast"
    cell_file, area_file = fc / "forecast_cell.parquet", fc / "forecast_area.parquet"
    hz = [horizon] if horizon else [1, 2, 3]
    params: list = []
    where = ["kind = ?"]
    params.append(kind)
    where.append("horizon IN (SELECT unnest(?))")
    params.append(hz)
    if issue:
        y, m = map(int, issue.split("-"))
        where.append("issue_year = ? AND issue_month = ?")
        params += [y, m]
    with db.connection() as con:
        if cells is None:
            sql = f"""SELECT country, issue_year, issue_month, target_year, target_month, horizon, pred, clim, obs
                      FROM read_parquet(?) WHERE level = 'country' AND {' AND '.join(where)}"""
            rows = con.execute(sql, [str(area_file)] + params).fetchall()
            n_cells = None
        else:
            sql = f"""SELECT country, issue_year, issue_month, target_year, target_month, horizon,
                             sum(pred), sum(clim), sum(obs), count(*),
                             sum(pred_lo), sum(pred_hi), avg(p_below), avg(p_near), avg(p_above),
                             count(*) FILTER (WHERE p_above >= 0.5)
                      FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?)) AND {' AND '.join(where)}
                      GROUP BY ALL ORDER BY ALL"""
            rows = con.execute(sql, [str(cell_file), cells] + params).fetchall()
            n_cells = len(cells)
    if not issue and rows:  # latest issue per country only
        latest = {}
        for r in rows:
            latest[r[0]] = max(latest.get(r[0], (0, 0)), (r[1], r[2]))
        rows = [r for r in rows if (r[1], r[2]) == latest[r[0]]]
    results = []
    for r in rows:
        country, iy, im, ty, tm, h, pred, clim, obs = r[:9]
        skill = _skill(s, country, h, totals=cells is None)
        item = {"country": country, "issue": f"{iy}-{im:02d}", "target": f"{ty}-{tm:02d}", "horizon": h,
                "expected_detections": round(pred, 1), "normal_detections": round(clim, 1),
                "ratio_to_normal": round(pred / clim, 2) if clim and clim > 0 else None,
                "observed_detections": round(obs, 1) if obs is not None else None,
                "show": "forecast" if skill["beats_climatology"] else "climatology", "skill": skill}
        if cells is not None:
            n, lo, hi, pb, pn, pa, n_above = r[9:16]
            item["modelled_cells"] = n
            item["cells_without_fire_history"] = n_cells - n if n_cells is not None else None
            if n == 1:
                item["interval_10_90"] = [round(lo, 1), round(hi, 1)]
                item["probabilities"] = {"below": round(pb, 2), "near": round(pn, 2), "above": round(pa, 2)}
                item["most_likely"] = _category(pb, pn, pa)
            else:
                item["cells_likely_above_normal"] = n_above
        results.append(item)
    results.sort(key=lambda x: (x["country"], x["horizon"]))
    if cells is not None and not results:
        detail = "Las celdas del área no tuvieron fuego en 2012-2025: la perspectiva es lo normal (0 detecciones)."
    else:
        detail = None
    return {"methodology_version": s.get("methodology_version"), "data_cutoff": _cutoff(),
            "attribution": f"{ATTRIBUTION}; NASA POWER; NOAA CPC ONI", "kind": kind, "area": area,
            "note": NOTE, "empty_reason": detail, "validation": s.get("split"),
            "forecasts": results}
