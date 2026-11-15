"""Meteorological context from NASA POWER (§8.10 of docs/firely-descripcion.md).

Monthly precipitation (PRECTOTCORR), 2 m temperature (T2M), relative humidity (RH2M) and 2 m wind (WS2M)
at the area centroid, expressed as anomalies against their own 2001..last-year climatology, side by side with
the harmonized fire anomaly. Correlation is context, not causation: the response says so.

NASA hosts hang over IPv6 on the team's network, so IPv4 is forced (see CLAUDE.md). Responses are cached on disk
(rounded to 0.5°) so the demo keeps working when POWER is slow or offline.
"""
from __future__ import annotations

import json
import socket
import statistics
from datetime import date

import requests
import urllib3.util.connection as urllib3_connection
from fastapi import APIRouter, HTTPException, Query

from . import db
from .extra_routes import MONTHS, _area, _centroid, _months
from .real import _cutoff, _envelope

urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

router = APIRouter()
POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
PARAMETERS = {"PRECTOTCORR": "precip_mm_day", "T2M": "temp_c", "RH2M": "rh_pct", "WS2M": "wind_ms"}
FILL = -999.0
FIRST_YEAR = 2001
CONTEXT_NOTE = "Contexto, no explicación: que un mes seco coincida con más fuego no prueba la causa."


def _cache_path(lat, lon, start, end):
    return db.state_root() / "cache" / "power" / f"{lat:.1f}_{lon:.1f}_{start}_{end}.json"


def fetch_power(lat: float, lon: float, start: int, end: int) -> dict:
    """{param: {(year, month): value}} from POWER, cached. Mocked in tests."""
    lat_r, lon_r = round(lat * 2) / 2, round(lon * 2) / 2
    path = _cache_path(lat_r, lon_r, start, end)
    raw = None
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = None
    if raw is None:
        try:
            r = requests.get(POWER_URL, timeout=30, headers={"User-Agent": "firely-hackathon"}, params={
                "parameters": ",".join(PARAMETERS), "community": "AG", "latitude": lat_r, "longitude": lon_r,
                "start": start, "end": end, "format": "JSON"})
            r.raise_for_status()
            raw = r.json()["properties"]["parameter"]
        except (requests.RequestException, KeyError, ValueError) as exc:
            raise HTTPException(503, detail={"code": "power_unavailable", "message": "NASA POWER is unavailable"}) from exc
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw), encoding="utf-8")
        except OSError:
            pass  # read-only deployments simply skip the cache
    out = {}
    for param, series in raw.items():
        values = {}
        for key, value in series.items():
            y, m = int(key[:4]), int(key[4:])
            if 1 <= m <= 12 and value is not None and value != FILL:
                values[(y, m)] = float(value)
        out[param] = values
    return out


def anomalies(series: dict) -> dict:
    """{(y, m): (value, anomaly)} against the per-month mean of the same series."""
    by_month = {}
    for (y, m), v in series.items():
        by_month.setdefault(m, []).append(v)
    clim = {m: statistics.fmean(vs) for m, vs in by_month.items()}
    return {(y, m): (v, v - clim[m]) for (y, m), v in series.items()}, clim


def driest_since(precip: dict, year: int, month: int):
    """Most recent earlier year whose same month was at least as dry. None = driest of the record."""
    value = precip.get((year, month))
    if value is None:
        return None, False
    earlier = sorted((y for (y, m), v in precip.items() if m == month and y < year and v <= value), reverse=True)
    return (earlier[0] if earlier else None), not earlier


def fire_ratios(cells):
    rows = _months(cells) if cells else []
    by_month = {}
    for y, m, v in rows:
        by_month.setdefault(m, []).append(v or 0.0)
    medians = {m: statistics.median(vs) for m, vs in by_month.items()}
    return {(y, m): ((v or 0.0) / medians[m] if medians.get(m) else None) for y, m, v in rows}


@router.get("/weather")
def weather(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None, geometry: str | None = None,
            from_: date | None = Query(None, alias="from"), to: date | None = None,
            year: int | None = Query(None, ge=FIRST_YEAR, le=2100), month: int | None = Query(None, ge=1, le=12)):
    if (year is None) != (month is None):
        raise HTTPException(422, "year and month go together")
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if cells is None:
        raise HTTPException(422, "weather requires an area selector")
    if not cells:
        raise HTTPException(404, "Empty area")
    clat, clon = _centroid(cells)
    last_year = date.today().year - 1  # POWER monthly values are published for complete years
    data = fetch_power(clat, clon, FIRST_YEAR, last_year)
    precip, clim_p = anomalies(data.get("PRECTOTCORR", {}))
    temp, clim_t = anomalies(data.get("T2M", {}))
    rh, _ = anomalies(data.get("RH2M", {}))
    wind, _ = anomalies(data.get("WS2M", {}))
    fire = fire_ratios(cells)
    keys = sorted(set(precip) | set(temp))
    rows = []
    for y, m in keys:
        if from_ and (y, m) < (from_.year, from_.month) or to and (y, m) > (to.year, to.month):
            continue
        p, t, h, w = precip.get((y, m)), temp.get((y, m)), rh.get((y, m)), wind.get((y, m))
        rows.append({"year": y, "month": m,
                     "precip_mm_day": None if p is None else round(p[0], 3), "precip_anom_mm_day": None if p is None else round(p[1], 3),
                     "temp_c": None if t is None else round(t[0], 2), "temp_anom_c": None if t is None else round(t[1], 2),
                     "rh_pct": None if h is None else round(h[0], 1), "rh_anom_pct": None if h is None else round(h[1], 1),
                     "wind_ms": None if w is None else round(w[0], 2), "wind_anom_ms": None if w is None else round(w[1], 2),
                     "fire_anomaly_ratio": None if fire.get((y, m)) is None else round(fire[(y, m)], 3)})
    summary = None
    if year is not None:
        p = precip.get((year, month))
        t = temp.get((year, month))
        if p is not None:
            since, record = driest_since({k: v[0] for k, v in precip.items()}, year, month)
            ratio = fire.get((year, month))
            name = MONTHS[month - 1].lower()
            dry = (f"el {name} más seco desde {FIRST_YEAR}" if record
                   else f"el {name} más seco desde {since}" if since and since < year - 1 else None)
            parts = [f"{MONTHS[month-1]} {year}: precipitación {p[0]:.2f} mm/día ({p[1]:+.2f} frente a su promedio de {name})"]
            if t is not None:
                parts.append(f"temperatura {t[1]:+.1f} °C sobre su promedio")
            text = "; ".join(parts) + "."
            if dry:
                text += f" Fue {dry}."
            if ratio is not None:
                text += f" La actividad de fuego armonizada fue {ratio:.1f}× la mediana de {name}."
            summary = {"year": year, "month": month, "text": text, "driest_since": since, "driest_on_record": record}
    return _envelope(_cutoff(), area=area, centroid={"lat": round(clat, 4), "lon": round(clon, 4)},
                     source="NASA POWER (monthly, community AG)", parameters=PARAMETERS,
                     climatology={"years": [FIRST_YEAR, last_year],
                                  "precip_mm_day": {m: round(v, 3) for m, v in clim_p.items()},
                                  "temp_c": {m: round(v, 2) for m, v in clim_t.items()}},
                     rows=rows, summary=summary, note=CONTEXT_NOTE,
                     method="Anomalía = valor del mes - promedio del mismo mes calendario en todos los años disponibles; fuego = count_harm / mediana del mismo mes.")
