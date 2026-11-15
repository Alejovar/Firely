"""Additional real-data map and bulletin routes."""
from __future__ import annotations

import json
import math
import statistics
from calendar import monthrange
from datetime import date
from pathlib import Path

import h3
from h3 import cell_to_boundary
from fastapi import APIRouter, HTTPException, Query
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union
from shapely import wkb

from . import db
from .real import _cells, _envelope, _cutoff

router = APIRouter()
COUNTRIES = ("Mexico", "Argentina", "Uruguay", "Chile", "Paraguay", "Bolivia")
COUNTRY_BOUNDS = {"Mexico": (-119, 14, -86, 33), "Argentina": (-74, -56, -53, -21),
                  "Uruguay": (-59, -36, -53, -30), "Chile": (-76, -56, -66, -17),
                  "Paraguay": (-63, -28, -54, -19), "Bolivia": (-70, -23, -57, -9)}
BIOMES = {1: "bosque", 2: "matorral", 3: "pastizal/sabana", 4: "cultivo", 5: "otros"}
MONTHS = ("Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre")


def _area(h3=None, bbox=None, lat=None, lon=None, radius_km=None, admin=None, geometry=None):
    return _cells(h3_list=h3, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km, admin=admin, geometry=geometry)


def _files(table, years=None, country=None):
    root = db.processed_root() / table
    countries = [country] if country else COUNTRIES
    return [str(p) for c in countries for y in (years or [None])
            for p in (root / c).glob(f"year={y if y is not None else '*'}/*.parquet")]


def _files_for_cells(table, cells, years=None):
    if cells is None:
        return _files(table, years)
    if not cells:
        return []
    points = [h3.cell_to_latlng(c) for c in cells]
    west, east = min(p[1] for p in points), max(p[1] for p in points)
    south, north = min(p[0] for p in points), max(p[0] for p in points)
    return [f for country, (w, s, e, n) in COUNTRY_BOUNDS.items()
            if west <= e and east >= w and south <= n and north >= s
            for f in _files(table, years, country)]


def _months(cells, years=None):
    files = _files_for_cells("cell_month_harmonized", cells, years)
    if not files or cells == []:
        return []
    where = "WHERE h3_r6 IN (SELECT unnest(?))" if cells is not None else ""
    with db.connection() as con:
        return con.execute(f"SELECT year, month, sum(count_harm) FROM {db.table_sql(files)} {where} GROUP BY 1,2 ORDER BY 1,2",
                           [files] + ([cells] if cells is not None else [])).fetchall()


def _period(rows):
    return max(((y, m) for y, m, _ in rows), default=None)


def _centroid(cells):
    coords = [h3.cell_to_latlng(c) for c in cells]
    return (sum(x[0] for x in coords) / len(coords), sum(x[1] for x in coords) / len(coords)) if coords else (0, 0)


def _country_cells(cells, country):
    # Admin membership is available for two countries. For the others, use
    # the country cell-month table to identify cells, without guessing borders.
    root = db.processed_root() / "cell_month_harmonized" / country
    years = sorted(root.glob("year=*"))
    files = sorted(str(p) for p in years[-1].glob("*.parquet")) if years else []
    if not files or not cells:
        return []
    with db.connection() as con:
        return [r[0] for r in con.execute(
            f"SELECT DISTINCT h3_r6 FROM {db.table_sql(files)} WHERE h3_r6 IN (SELECT unnest(?))",
            [files, cells]).fetchall()]


@router.get("/hotspots.geojson")
def hotspots_geojson(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
                     lon: float | None = None, radius_km: float | None = None,
                     admin: str | None = None, geometry: str | None = None,
                     from_: date | None = Query(None, alias="from"), to: date | None = None,
                     limit: int = Query(20000, ge=1, le=20000)):
    if from_ and to and from_ > to:
        raise HTTPException(422, "from must precede to")
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    years = list(range(from_.year, to.year + 1)) if from_ and to else None
    files = _files_for_cells("hotspots", cells, years)
    rows, total = [], 0
    if files and cells != []:
        where = ["confidence_h IN ('nominal','alta')"]
        params = [files]
        if cells is not None:
            where.append("h3_r6 IN (SELECT unnest(?))")
            params.append(cells)
        if from_:
            where.append("date_local >= ?")
            params.append(from_)
        if to:
            where.append("date_local <= ?")
            params.append(to)
        # Window count preserves the total before the FRP limit in one scan.
        sql = f"SELECT date_local, sensor, platform, frp_mw, confidence_h, daynight, lon, lat, count(*) OVER () AS n_total FROM {db.table_sql(files)} WHERE {' AND '.join(where)} ORDER BY frp_mw DESC NULLS LAST LIMIT ?"
        with db.connection() as con:
            rows = con.execute(sql, params + [limit]).fetchall()
        total = rows[0][-1] if rows else 0
    features = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [r[6], r[7]]},
                 "properties": {"date": r[0].isoformat(), "sensor": r[1], "platform": r[2],
                                "frp_mw": r[3], "confidence_h": r[4], "daynight": r[5]}} for r in rows]
    return _envelope(_cutoff(), area=area, type="FeatureCollection", features=features,
                     truncated=total > limit, n_total=total)


@router.get("/recurrence")
def recurrence(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
               lon: float | None = None, radius_km: float | None = None,
               admin: str | None = None, geometry: str | None = None,
               from_: date = Query(..., alias="from"), to: date = Query(...)):
    if from_ > to:
        raise HTTPException(422, "from must precede to")
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    files = _files_for_cells("cell_month_harmonized", cells, range(from_.year, to.year + 1))
    data = []
    if files and cells != []:
        where = ["make_date(year, month, 1) <= ?", "last_day(make_date(year, month, 1)) >= ?"]
        params = [files, to, from_]
        if cells is not None:
            where.append("h3_r6 IN (SELECT unnest(?))")
            params.append(cells)
        sql = f"""WITH annual AS (SELECT h3_r6, year, sum(count_harm) AS n FROM {db.table_sql(files)} WHERE {' AND '.join(where)} GROUP BY 1,2),
        ranked AS (SELECT h3_r6, count(*) FILTER (WHERE n >= 1.0) AS years_burned,
        max(year) FILTER (WHERE n >= 1.0) AS last_fire_year FROM annual GROUP BY 1)
        SELECT * FROM ranked ORDER BY years_burned DESC, h3_r6 LIMIT 5001"""
        with db.connection() as con:
            data = con.execute(sql, params).fetchall()
    capped = len(data) > 5000
    data = data[:5000]
    features = []
    for cell, count, last in data:
        ring = [[lon, lat] for lat, lon in cell_to_boundary(cell)]
        ring.append(ring[0])
        features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                         "properties": {"h3": cell, "years_burned": count, "last_fire_year": last}})
    result = _envelope(_cutoff(), area=area, type="FeatureCollection", features=features,
                       n_years=to.year - from_.year + 1, max_years_burned=max((r[1] for r in data), default=0))
    result["note"] = ("Se muestran las 5000 celdas con más años quemados. " if capped else "") + "Un año cuenta si la suma anual de count_harm es al menos 1.0."
    return result


def _locality_points(cells, country_groups=None):
    """Localities whose r6 cell is in `cells`: ([(name, pop, lat, lon, h3_r6)], population total or None when no
    country with locality data covers the area)."""
    cellset = set(cells)
    if country_groups is None:
        country_groups = {c: _country_cells(cells, c) for c in COUNTRIES}
    out, pop_total = [], None
    for c in COUNTRIES:
        path = db.file_path("geo/localities.parquet", c)
        if not path or not country_groups.get(c):
            continue
        if pop_total is None:
            pop_total = 0
        # Bounding box reduces the locality scan before exact H3 membership.
        points = [h3.cell_to_latlng(x) for x in country_groups[c]]
        south, north = min(x[0] for x in points) - .05, max(x[0] for x in points) + .05
        west, east = min(x[1] for x in points) - .05, max(x[1] for x in points) + .05
        with db.connection() as con:
            rows = con.execute("SELECT name, pop, lat, lon FROM read_parquet(?) WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", [path, south, north, west, east]).fetchall()
        for name, pop, lat, lon in rows:
            if lat is None or lon is None:
                continue
            cell = h3.latlng_to_cell(lat, lon, 6)
            if cell in cellset:
                pop_total += pop or 0
                out.append((name, pop, lat, lon, cell))
    return out, pop_total


def _territory(cells, area):
    if cells is None:
        raise HTTPException(422, "territory requires an area selector")
    cellset = set(cells)
    center = _centroid(cells)
    country_groups = {c: _country_cells(cells, c) for c in COUNTRIES}
    country = max(COUNTRIES, key=lambda c: len(country_groups[c])) if cells else None
    admin_result = None
    if country and country_groups[country] and db.file_path("geo/admin_cells.parquet", country):
        ap = db.file_path("geo/admin_cells.parquet", country)
        up = db.file_path("geo/admin_units.parquet", country)
        with db.connection() as con:
            matched = con.execute("SELECT a.level, a.code, u.name, count(*) n FROM read_parquet(?) a JOIN read_parquet(?) u ON a.level=u.level AND a.code=u.code WHERE a.h3_r6 IN (SELECT unnest(?)) GROUP BY 1,2,3 ORDER BY n DESC", [ap, up, cells]).fetchall()
        state_level, mun_level = (("ent", "mun") if country == "Mexico" else ("adm1", "adm2"))
        state = next((r[2] for r in matched if r[0] == state_level), None)
        mun = next((r[2] for r in matched if r[0] == mun_level), None)
        admin_result = {"country": country, "state": state, "municipality": mun,
                        "source": "INEGI Marco Geoestadístico 2020" if country == "Mexico" else "geoBoundaries"}
    points, pop_total = _locality_points(cells, country_groups)
    localities = [{"name": name, "pop": pop, "lat": lat, "lon": lon,
                   "dist_km": h3.great_circle_distance(center, (lat, lon), unit="km")}
                  for name, pop, lat, lon, _cell in points]
    localities.sort(key=lambda x: x["pop"] or 0, reverse=True)
    protected = []
    if cells:
        area_shape = unary_union([Polygon([(lon, lat) for lat, lon in h3.cell_to_boundary(x)]) for x in cells])
        for c in COUNTRIES:
            path = db.file_path("geo/protected_areas.parquet", c)
            if not path or not country_groups[c]:
                continue
            namecol, catcol = ("name", "category") if c == "Mexico" else ("NAME", "IUCN_CAT")
            with db.connection() as con:
                rows = con.execute(f"SELECT {namecol}, {catcol}, geometry_wkb FROM read_parquet(?)", [path]).fetchall()
            for name, category, blob in rows:
                if blob:
                    geom = wkb.loads(blob)
                    if geom.intersects(area_shape):
                        protected.append({"type": "Feature", "geometry": mapping(geom.simplify(.001, preserve_topology=True)),
                                          "properties": {"name": name, "category": category}})
    biome_counts = {name: 0 for name in (*BIOMES.values(), "desconocido")}
    known = set()
    for c in COUNTRIES:
        path = db.file_path(f"cell_biome/{c}.parquet")
        if not path or not country_groups[c]:
            continue
        with db.connection() as con:
            rows = con.execute("SELECT h3_r6, biome FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?))", [path, country_groups[c]]).fetchall()
        for cell, biome in rows:
            if cell in cellset and cell not in known:
                biome_counts[BIOMES.get(biome, "desconocido")] += 1
                known.add(cell)
    biome_counts["desconocido"] += len(cellset - known)
    return _envelope(_cutoff(), area=area, area_km2=len(cells) * h3.average_hexagon_area(6, unit="km^2"),
                     cells=len(cells), admin=admin_result, population_total=pop_total,
                     localities=localities[:30], protected_areas={"type": "FeatureCollection", "features": protected},
                     landcover=[{"biome": k, "share": v / len(cells) if cells else 0} for k, v in biome_counts.items()])


@router.get("/territory")
def territory(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
              lon: float | None = None, radius_km: float | None = None,
              admin: str | None = None, geometry: str | None = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    return _territory(cells, area)


def _percentile(current, refs):
    """Mid-rank percentile of `current` among `refs` (0..1)."""
    return (sum(v < current for v in refs) + .5 * sum(v == current for v in refs)) / len(refs)


def _season_value(month, medians):
    """1 if `month` is one of the three months with the highest historical median, .5 if adjacent, else 0."""
    top = sorted(medians, key=lambda m: (-medians[m], m))[:3]
    return (1 if month in top else .5 if any((month - m) % 12 in (1, 11) for m in top) else 0), top


def _exposure_value(population):
    """Logarithmic exposure scale: 0 people -> 0, one million or more -> 1."""
    return min(1.0, math.log1p(max(population, 0)) / math.log1p(1_000_000))


def _combine(components, weights):
    """Weighted mean (0..100) over the components with data; missing ones are renormalized away."""
    used = [c for c in components if weights.get(c["key"], 0) > 0]
    total = sum(weights[c["key"]] for c in used)
    return (round(100 * sum(c["value"] * weights[c["key"]] for c in used) / total, 1) if total else 0), total


def _level(index):
    return "baja" if index < 30 else "media" if index < 55 else "alta" if index < 75 else "extrema"


DEFAULT_WEIGHTS = {"anomaly": .35, "recurrence": .25, "exposure": .25, "season": .15, "fwi": .15}


def _weights(**given):
    """User weights (§8.16: "los pesos son transparentes y ajustables"). None keeps the default."""
    out = {}
    for key, default in DEFAULT_WEIGHTS.items():
        value = given.get(key)
        if value is None:
            out[key] = default
            continue
        if not (isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 10):
            raise HTTPException(422, f"w_{key} must be between 0 and 10")
        out[key] = float(value)
    if sum(out.values()) <= 0:
        raise HTTPException(422, "At least one weight must be positive")
    return out


@router.get("/risk")
def risk(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
         lon: float | None = None, radius_km: float | None = None,
         admin: str | None = None, geometry: str | None = None,
         w_anomaly: float | None = None, w_recurrence: float | None = None, w_exposure: float | None = None,
         w_season: float | None = None, w_fwi: float | None = None):
    weights = _weights(anomaly=w_anomaly, recurrence=w_recurrence, exposure=w_exposure, season=w_season, fwi=w_fwi)
    custom = any(v is not None for v in (w_anomaly, w_recurrence, w_exposure, w_season, w_fwi))
    cells, area = _area(h3, bbox, lat, lon, radius_km, admin, geometry)
    if cells is None:
        raise HTTPException(422, "risk requires an area selector")
    monthly = _months(cells)
    latest = _period(monthly)
    if latest is None:
        raise HTTPException(404, "No harmonized activity for this area")
    year, month = latest
    current = next(v for y, m, v in monthly if (y, m) == latest)
    refs = [v for y, m, v in monthly if m == month and y != year]
    components = []
    if refs:
        percentile = _percentile(current, refs)
        components.append({"key": "anomaly", "label": "Anomalía", "value": percentile, "weight": weights["anomaly"],
                           "note": f"{current:.1f} detecciones equivalentes en {MONTHS[month-1].lower()} {year}; percentil {percentile:.2f} frente a {len(refs)} años comparables."})
    # Only the 15 complete calendar years before the current year are considered.
    years = range(year - 15, year)
    files = _files_for_cells("cell_month_harmonized", cells, years)
    if files and cells:
        with db.connection() as con:
            n = con.execute(f"WITH annual AS (SELECT h3_r6, year, sum(count_harm) n FROM {db.table_sql(files)} WHERE h3_r6 IN (SELECT unnest(?)) GROUP BY 1,2) SELECT count(DISTINCT h3_r6) FILTER (WHERE burned >= 3) FROM (SELECT h3_r6, count(*) FILTER (WHERE n >= 1.0) burned FROM annual GROUP BY 1)", [files, cells]).fetchone()[0]
        share = n / len(cells)
        components.append({"key": "recurrence", "label": "Recurrencia", "value": share, "weight": weights["recurrence"],
                           "note": f"{n} de {len(cells)} celdas tuvieron al menos tres años con una detección equivalente entre {year-15} y {year-1}."})
    territory_data = _territory(cells, area)
    population = territory_data["population_total"]
    if population is not None:
        # Exposure also counts localities within 10 km of the area centroid.
        near = sum((l["pop"] or 0) for l in territory_data["localities"] if l["dist_km"] <= 10)
        exposure = _exposure_value(population + near)
        components.append({"key": "exposure", "label": "Exposición", "value": exposure, "weight": weights["exposure"],
                           "note": f"{population} habitantes dentro del área y {near} en localidades a 10 km del centro; escala logarítmica hasta un millón."})
    medians = {m: statistics.median([v for y, mm, v in monthly if mm == m and y < year]) for m in range(1,13)
               if any(mm == m and y < year for y, mm, v in monthly)}
    if medians:
        season, top = _season_value(month, medians)
        components.append({"key": "season", "label": "Temporada", "value": season, "weight": weights["season"],
                           "note": f"Mes actual {MONTHS[month-1].lower()}; tres meses con mayor mediana histórica: {', '.join(MONTHS[m-1].lower() for m in top)}."})
    fwi_component = _fwi_component(cells, year, month)
    if fwi_component:
        components.append({**fwi_component, "weight": weights["fwi"]})
    components = [c for c in components if c["weight"] > 0]
    index, weight_sum = _combine(components, weights)
    level = _level(index)
    dropped = {k for k, w in weights.items() if w > 0} - {c["key"] for c in components}
    shown = ", ".join(f"{label} ({weights[key]:g})" for key, label in (("anomaly", "anomalía"), ("recurrence", "recurrencia"),
                      ("exposure", "exposición"), ("season", "temporada"), ("fwi", "peligro meteorológico FWI")) if weights[key] > 0)
    method = (f"Índice de prioridad v1: media ponderada de {shown}; componentes entre 0 y 1. "
              f"{'Pesos definidos por el usuario. ' if custom else ''}No es una probabilidad de incendio.")
    if dropped:
        method += f" Sin datos para {', '.join(sorted(dropped))}; pesos disponibles renormalizados de {weight_sum:.2f} a 1."
    return _envelope(_cutoff(), area=area, index=index, level=level, components=components, weights=weights,
                     weights_custom=custom, period=f"{year:04d}-{month:02d}",
                     summary_es=f"Prioridad {level}: índice {index:.1f} de 100 para {MONTHS[month-1].lower()} {year}.", method=method,
                     disclaimer="Herramienta de apoyo; no reemplaza el conocimiento local.")


def _fwi_component(cells, year, month):
    """FWI (GFWED) percentile of the period within the same calendar month of the area's history. None if unavailable."""
    path = db.file_path("context/fwi_coahuila_month.parquet")
    if not path or not cells:
        return None
    with db.connection() as con:
        rows = con.execute("SELECT year, avg(fwi_mean) FROM read_parquet(?) WHERE h3_r6 IN (SELECT unnest(?)) AND month=? GROUP BY 1",
                           [path, cells, month]).fetchall()
    series = {y: v for y, v in rows if v is not None}
    if year not in series or len(series) < 4:
        return None
    current, refs = series[year], [v for y, v in series.items() if y != year]
    pct = _percentile(current, refs)
    return {"key": "fwi", "label": "Peligro meteorológico (FWI)", "value": pct,
            "note": f"FWI medio de {MONTHS[month-1].lower()} {year}: {current:.1f}; percentil {pct:.2f} frente a {len(refs)} años con dato (NASA GFWED)."}


MIN_BASELINE = 5.0  # detections-equivalent: floor of the reference used by /watch


@router.get("/watch")
def watch(level: str = Query("mun", pattern="^(mun|ent|adm1|adm2)$"), country: str = "Mexico",
          top: int = Query(10, ge=1, le=100)):
    if country not in COUNTRIES:
        raise HTTPException(422, "Unsupported country")
    ap = db.file_path("geo/admin_cells.parquet", country)
    up = db.file_path("geo/admin_units.parquet", country)
    files = _files("cell_month_harmonized", country=country)
    if not ap or not up or not files:
        return _envelope(_cutoff(), area={"type": "admin", "country": country, "level": level}, period="", level=level, n_reviewed=0, rows=[])
    cutoff = _cutoff()
    metadata = db.processed_root() / "metadata" / "harmonization_summary.json"
    last = json.loads(metadata.read_text())["countries"][country]["last_ym"] if metadata.is_file() else None
    with db.connection() as con:
        if last is None:
            last = con.execute(f"SELECT max(year*100+month) FROM {db.table_sql(files)}", [files]).fetchone()[0]
        if last is None:
            return _envelope(cutoff, area={"type": "admin", "country": country, "level": level}, period="", level=level, n_reviewed=0, rows=[])
        yr, mo = divmod(last, 100)
        # One grouped scan for all units and reference years. Partitioned files
        # let DuckDB discard months outside the same calendar month.
        sql = f"""WITH grouped AS (SELECT a.code, h.year, sum(h.count_harm) n
        FROM {db.table_sql(files)} h JOIN read_parquet(?) a ON h.h3_r6=a.h3_r6
        WHERE a.level=? AND h.month=? GROUP BY 1,2),
        cur AS (SELECT code, n current_count FROM grouped WHERE year=?),
        agg AS (SELECT c.code, c.current_count, median(g.n) baseline,
               count(g.year) n_ref, count(*) FILTER (WHERE g.n<c.current_count) n_lower,
               count(*) FILTER (WHERE g.n=c.current_count) n_equal
               FROM cur c LEFT JOIN grouped g ON g.code=c.code AND g.year<>? GROUP BY c.code,c.current_count)
        SELECT u.code, u.name, u.parent_code, a.current_count, a.baseline, a.n_ref, a.n_lower, a.n_equal
        FROM agg a JOIN read_parquet(?) u ON u.code=a.code AND u.level=?"""
        rows = con.execute(sql, [files, ap, level, mo, yr, yr, up, level]).fetchall()
    reviewed = len(rows)
    out = []
    for code, name, parent, count, baseline, nref, lower, equal in rows:
        if count < 20:
            continue
        # A median of ~0.4 detections turns 45 detections into "115x": unstable, not alarming. The reference is floored at
        # MIN_BASELINE detections so the ranking reflects real, absolute activity as well.
        ratio = count / max(baseline or 0.0, MIN_BASELINE) if baseline is not None else None
        greater = nref - lower - equal
        pct = 1 - (greater + (equal + 1) / 2 if equal else greater + 1) / (nref + 1) if nref else None
        frequency = round(1 / (1-pct)) if pct is not None and pct < 1 else None
        ratio_text = f"{ratio:.1f}× la referencia (mediana, mínimo {MIN_BASELINE:g})" if ratio is not None else "sin referencia"
        text = f"{MONTHS[mo-1]} {yr}: {ratio_text}; {count:.1f} detecciones equivalentes"
        if frequency:
            text += f"; 1 vez cada {frequency} años"
        out.append({"code": code, "name": name, "parent": parent, "country": country,
                    "ratio": ratio, "count": count, "percentile": pct, "text": text + "."})
    out.sort(key=lambda r: (r["ratio"] is None, -(r["ratio"] or 0), -r["count"]))
    return _envelope(cutoff, area={"type": "admin", "country": country, "level": level},
                     period=f"{yr:04d}-{mo:02d}", level=level, n_reviewed=reviewed, rows=out[:top],
                     estimated_month=bool(last and last // 100 == yr and yr == int(cutoff[:4]) and mo > 7) if cutoff else False,
                     note=f"Razón = conteo del mes / max(mediana de los otros años, {MIN_BASELINE:g}); solo unidades con al menos 20 detecciones equivalentes. "
                          "Los meses posteriores al último de VIIRS están estimados desde MODIS.")
