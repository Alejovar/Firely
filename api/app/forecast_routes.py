"""Next-week fire-weather danger from the NASA GFWED GEOS-5 8-day forecast (§8.11 of docs/firely-descripcion.md).

Each forecast run lives in a daily folder (``YYYYMMDD00``) with one global NetCDF per lead day. The files are ~16 MB,
so only what the area needs is downloaded: the classic-NetCDF header, the lat/lon axes and the FWI rows that cross
the area, through HTTP Range requests (no NetCDF library needed in the API image).

The forecast mean FWI is compared with a climatology, in this order:
1. GFWED long-term monthly mean 1981–2010 (``context/fwi_longterm_month.parquet``, built by
   ``pipeline.fwi_climatology`` from the raw GFWED long-term-mean file; Coahuila only);
2. the area's own monthly FWI history (``context/fwi_coahuila_month.parquet``), as a percentile;
3. otherwise only the absolute EFFIS danger class is given.

NASA hosts hang over IPv6 on the team's network, so IPv4 is forced (see CLAUDE.md). Results are cached on disk under
``FIRELY_STATE_DIR/cache/gfwed_forecast``; when NASA is unreachable a cached forecast of the last 7 days is served as
``stale``, and if there is none the route answers 503 ``gfwed_forecast_unavailable``.
"""
from __future__ import annotations

import json
import math
import socket
import struct
from datetime import date, timedelta

import h3 as h3lib
import requests
import urllib3.util.connection as urllib3_connection
from fastapi import APIRouter, HTTPException

from . import db
from .extra_routes import MONTHS, _area, _centroid, _percentile
from .real import _cutoff, _envelope

urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

router = APIRouter()
BASE_URL = "https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/fwiCalcs.GEOS-5/Default/GEOS-5"
VARIABLE = "GEOS-5_FWI"
LEAD_DAYS = 8
MAX_LOOKBACK = 6
HEADER_BYTES = 32768
STALE_DAYS = 7
SOURCE = "NASA GFWED v2.0, pronóstico GEOS-5 (fwiCalcs.GEOS-5)"
# EFFIS fire danger classes for FWI (absolute scale, used when there is no local climatology).
EFFIS = ((5.2, "muy bajo"), (11.2, "bajo"), (21.3, "moderado"), (38.0, "alto"), (50.0, "muy alto"), (math.inf, "extremo"))

_get = requests.get  # monkeypatched in tests


class ForecastUnavailable(Exception):
    pass


# ---------------------------------------------------------------- classic NetCDF (CDF-1/CDF-2) header parser
_TYPES = {1: (1, "b"), 2: (1, "c"), 3: (2, "h"), 4: (4, "i"), 5: (4, "f"), 6: (8, "d")}


class _Reader:
    def __init__(self, buf: bytes, offset64: bool):
        self.buf, self.pos, self.offset64 = buf, 0, offset64

    def take(self, n):
        if self.pos + n > len(self.buf):
            raise EOFError
        out = self.buf[self.pos:self.pos + n]
        self.pos += n
        return out

    def int(self):
        return struct.unpack(">i", self.take(4))[0]

    def offset(self):
        return struct.unpack(">q", self.take(8))[0] if self.offset64 else struct.unpack(">I", self.take(4))[0]

    def name(self):
        n = self.int()
        raw = self.take(n)
        self.take((4 - n % 4) % 4)
        return raw.decode("utf-8", "replace")

    def skip_attrs(self):
        tag, n = self.int(), self.int()
        if tag not in (0, 12):
            raise ValueError("Bad NetCDF attribute list")
        for _ in range(n):
            self.name()
            size = _TYPES[self.int()][0] * self.int()
            self.take(size + (4 - size % 4) % 4)


def parse_header(buf: bytes) -> dict:
    """{"dims": {name: len}, "vars": {name: {"dims": [...], "type": code, "begin": offset}}}. EOFError = need more bytes."""
    if buf[:3] != b"CDF" or buf[3] not in (1, 2):
        raise ValueError("Not a classic NetCDF file")
    r = _Reader(buf, buf[3] == 2)
    r.take(4)
    r.int()  # numrecs
    tag, n = r.int(), r.int()
    dims = []
    for _ in range(n if tag == 10 else 0):
        dims.append((r.name(), r.int()))
    r.skip_attrs()
    tag, n = r.int(), r.int()
    variables = {}
    for _ in range(n if tag == 11 else 0):
        name = r.name()
        ids = [r.int() for _ in range(r.int())]
        r.skip_attrs()
        nc_type = r.int()
        r.int()  # vsize
        variables[name] = {"dims": [dims[i][0] for i in ids], "shape": [dims[i][1] for i in ids],
                           "type": nc_type, "begin": r.offset()}
    return {"dims": dict(dims), "vars": variables}


# ---------------------------------------------------------------- remote access
def _range(url: str, start: int, length: int) -> bytes:
    try:
        r = _get(url, headers={"Range": f"bytes={start}-{start + length - 1}", "User-Agent": "firely-hackathon"}, timeout=30)
    except requests.RequestException as exc:
        raise ForecastUnavailable(str(type(exc).__name__)) from exc
    if r.status_code == 404:
        raise FileNotFoundError(url)
    if r.status_code not in (200, 206):
        raise ForecastUnavailable(f"HTTP {r.status_code}")
    body = r.content
    return body[start:start + length] if r.status_code == 200 else body


def _url(run: date, lead: date) -> str:
    stamp = run.strftime("%Y%m%d") + "00"
    return f"{BASE_URL}/{run.year}/{stamp}/FWI.GEOS-5.Daily.Default.{stamp}.{lead:%Y%m%d}.nc"


def _header(url: str) -> dict:
    size = HEADER_BYTES
    while True:
        try:
            return parse_header(_range(url, 0, size))
        except EOFError:
            if size >= 1 << 22:
                raise ValueError("NetCDF header too large")
            size *= 4


def _axis(url, header, name):
    var = header["vars"][name]
    size, code = _TYPES[var["type"]]
    n = var["shape"][0]
    return list(struct.unpack(f">{n}{code}", _range(url, var["begin"], n * size)))


def latest_run(today: date) -> date:
    for back in range(MAX_LOOKBACK + 1):
        run = today - timedelta(days=back)
        try:
            _range(_url(run, run + timedelta(days=1)), 0, 4)
            return run
        except FileNotFoundError:
            continue
    raise ForecastUnavailable("No GEOS-5 forecast run in the last days")


def _indices(axis, lo, hi, center):
    idx = [i for i, v in enumerate(axis) if lo <= v <= hi]
    return idx or [min(range(len(axis)), key=lambda i: abs(axis[i] - center))]


def area_forecast(run: date, bounds) -> list[dict]:
    """[{date, fwi_mean, fwi_max, n_grid}] for the lead days available in `run`, area-averaged."""
    west, south, east, north = bounds
    clat, clon = (south + north) / 2, (west + east) / 2
    days, lats, lons, rows, cols = [], None, None, None, None
    for lead in range(1, LEAD_DAYS + 1):
        day = run + timedelta(days=lead)
        url = _url(run, day)
        try:
            header = _header(url)
        except FileNotFoundError:
            continue
        var = header["vars"].get(VARIABLE)
        if var is None:
            raise ForecastUnavailable(f"{VARIABLE} missing")
        if lats is None:
            lats, lons = _axis(url, header, "lat"), _axis(url, header, "lon")
            rows, cols = _indices(lats, south, north, clat), _indices(lons, west, east, clon)
        nlon = var["shape"][-1]
        first, last = min(rows), max(rows)
        raw = _range(url, var["begin"] + first * nlon * 4, (last - first + 1) * nlon * 4)
        grid = struct.unpack(f">{(last - first + 1) * nlon}f", raw)
        values = [grid[(i - first) * nlon + j] for i in rows for j in cols]
        values = [v for v in values if math.isfinite(v) and v >= 0]
        if values:
            days.append({"date": day.isoformat(), "fwi_mean": round(sum(values) / len(values), 2),
                         "fwi_max": round(max(values), 2), "n_grid": len(values)})
    if not days:
        raise ForecastUnavailable("Forecast files without FWI data for this area")
    return days


# ---------------------------------------------------------------- climatology
def effis_class(fwi: float) -> str:
    return next(label for limit, label in EFFIS if fwi < limit)


def _ltm(bounds, month):
    path = db.file_path("context/fwi_longterm_month.parquet")
    if not path:
        return None
    west, south, east, north = bounds
    with db.connection() as con:
        # GFWED MERRA-2 grid is 0.5° x 0.625°: half a step of margin picks the nodes that represent the area.
        row = con.execute("SELECT avg(fwi_ltm), count(*) FROM read_parquet(?) WHERE month=? AND lat BETWEEN ? AND ? "
                          "AND lon BETWEEN ? AND ? AND fwi_ltm IS NOT NULL",
                          [path, month, south - .25, north + .25, west - .3125, east + .3125]).fetchone()
    return row[0] if row and row[1] else None


def _history(cells, month):
    path = db.file_path("context/fwi_coahuila_month.parquet")
    if not path or not cells:
        return []
    with db.connection() as con:
        rows = con.execute("SELECT year, avg(fwi_mean) FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?)) AND month=? "
                           "GROUP BY 1", [path, cells, month]).fetchall()
    return [v for _, v in rows if v is not None]


def _ratio_level(ratio):
    return "bajo" if ratio < .75 else "normal" if ratio < 1.25 else "alto" if ratio < 1.75 else "muy alto"


def _pct_level(pct):
    return "bajo" if pct < 1 / 3 else "normal" if pct < 2 / 3 else "alto" if pct < .9 else "muy alto"


def assess(days, cells, bounds) -> dict:
    """Compare each day and the week mean with the climatology; build the sentence."""
    week = sum(d["fwi_mean"] for d in days) / len(days)
    months = [int(d["date"][5:7]) for d in days]
    month = max(set(months), key=months.count)
    ltm = {m: _ltm(bounds, m) for m in set(months)}
    for d in days:
        ref = ltm.get(int(d["date"][5:7]))
        d["fwi_ltm"] = None if ref is None else round(ref, 2)
        d["ratio_ltm"] = round(d["fwi_mean"] / ref, 2) if ref else None
        d["effis_class"] = effis_class(d["fwi_mean"])
    name = MONTHS[month - 1].lower()
    absolute = effis_class(week)
    if ltm.get(month):
        ratio = week / ltm[month]
        level, basis = _ratio_level(ratio), "longterm_mean"
        times = f"{ratio:.1f}×" if ratio >= .1 else "menos de 0.1×"
        detail = f"FWI medio {week:.1f}, {times} el promedio de largo plazo 1981–2010 de {name} ({ltm[month]:.1f})"
        clim = {"basis": basis, "reference": "GFWED MERRA-2 long-term monthly mean 1981–2010",
                "fwi_ltm": round(ltm[month], 2), "ratio": round(ratio, 2)}
    elif len(hist := _history(cells, month)) >= 4:
        pct = _percentile(week, hist)
        level, basis = _pct_level(pct), "history_percentile"
        detail = f"FWI medio {week:.1f}; percentil {pct:.2f} frente a {len(hist)} {name}s con dato (GFWED MERRA-2)"
        clim = {"basis": basis, "reference": "FWI mensual histórico del área (context/fwi_coahuila_month)",
                "percentile": round(pct, 3), "n_years": len(hist)}
    else:
        level, basis = absolute, "effis_absolute"
        detail = f"FWI medio {week:.1f}, clase EFFIS absoluta (sin climatología local para esta área)"
        clim = {"basis": basis, "reference": "Clases EFFIS de FWI (absolutas)"}
    phrase = "para la época" if basis != "effis_absolute" else ""
    text = f"Esta semana el peligro meteorológico es {level}{' ' + phrase if phrase else ''}: {detail}."
    return {"level": level, "fwi_week_mean": round(week, 2), "effis_class": absolute, "month": month,
            "climatology": clim, "summary_es": text}


# ---------------------------------------------------------------- cache
def _cache_dir():
    return db.state_root() / "cache" / "gfwed_forecast"


def _key(bounds):
    return "_".join(f"{v:.2f}" for v in bounds)


def _read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write(path, payload):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        tmp.replace(path)
    except OSError:
        pass  # read-only deployments simply skip the cache


def forecast_days(bounds, today: date):
    """(run, days, stale). Cached per run and area; falls back to a recent cached run when NASA is unreachable."""
    folder, key = _cache_dir(), _key(bounds)
    marker = folder / f"latest_{today:%Y%m%d}.txt"
    run = None
    if marker.is_file():
        try:
            run = date.fromisoformat(marker.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            run = None
    try:
        if run is None:
            run = latest_run(today)
            try:
                folder.mkdir(parents=True, exist_ok=True)
                marker.write_text(run.isoformat(), encoding="utf-8")
            except OSError:
                pass
        path = folder / f"{run:%Y%m%d}_{key}.json"
        cached = _read(path) if path.is_file() else None
        if cached:
            return run, cached, False
        days = area_forecast(run, bounds)
        _write(path, days)
        return run, days, False
    except (ForecastUnavailable, ValueError) as exc:
        for back in range(STALE_DAYS + 1):
            old = today - timedelta(days=back)
            cached = _read(folder / f"{old:%Y%m%d}_{key}.json")
            if cached:
                return old, cached, True
        raise HTTPException(503, detail={"code": "gfwed_forecast_unavailable",
                                         "message": "NASA GFWED GEOS-5 forecast is unavailable; retry later"}) from exc


def _bounds(cells):
    vertices = [v for c in cells for v in h3lib.cell_to_boundary(c)]
    return (min(v[1] for v in vertices), min(v[0] for v in vertices),
            max(v[1] for v in vertices), max(v[0] for v in vertices))


@router.get("/risk/forecast")
def risk_forecast(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
                  lon: float | None = None, radius_km: float | None = None,
                  admin: str | None = None, geometry: str | None = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if cells is None:
        raise HTTPException(422, "risk/forecast requires an area selector")
    if not cells:
        raise HTTPException(404, "Empty area")
    bounds = _bounds(cells)
    run, days, stale = forecast_days(bounds, date.today())
    days = [dict(d) for d in days]
    result = assess(days, cells, bounds)
    clat, clon = _centroid(cells)
    return _envelope(_cutoff(), area=area, centroid={"lat": round(clat, 4), "lon": round(clon, 4)},
                     source=SOURCE, forecast_run=f"{run:%Y-%m-%d}", stale=stale, days=days, **result,
                     method=("FWI diario del pronóstico GEOS-5 promediado sobre los nodos de la malla (0.25° × 0.3125°) "
                             "dentro del área; la semana se compara con la climatología del mes indicada en "
                             "`climatology.basis`. Niveles por razón: <0.75 bajo, <1.25 normal, <1.75 alto, ≥1.75 muy alto; "
                             "por percentil: <1/3 bajo, <2/3 normal, <0.9 alto, ≥0.9 muy alto. El pronóstico (GEOS-5) y la climatología "
                             "(MERRA-2) usan forzantes distintos: la razón es orientativa."),
                     note="Peligro meteorológico (condiciones para que un fuego se propague), no probabilidad de incendio.")
