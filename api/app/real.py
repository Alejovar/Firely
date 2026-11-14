"""Queries backed by harmonized cell-month and observed hotspot Parquet data.

The empirical percentile is 1 - m/(n+1), where m is the descending
midrank among available reference years. Return period is 1/(1-percentile),
limited to 50 years; it is descriptive, not an extrapolated extreme-value fit.
"""

import csv
import io
import json
import math
from calendar import monthrange
from datetime import date

import h3
from fastapi import HTTPException, Response

from . import db, geo

VERSION = "1.2.0-hybrid-biome"
ATTRIBUTION = "NASA FIRMS"


def _cells(h3_list=None, bbox=None, lat=None, lon=None, radius_km=None, geometry=None, admin=None):
    choices = sum(x is not None for x in (h3_list, bbox, geometry, admin)) + (lat is not None or lon is not None)
    if choices > 1:
        raise HTTPException(422, "Specify one area selector")
    if admin is not None:
        unit = geo.resolve(admin)
        selected = sorted(geo.cells(unit))
        return selected, {"type": "admin", "code": unit["code"], "name": unit["name"],
                          "parent": unit["parent"], "country": unit["country"],
                          "bbox": unit["bbox"], "cells": len(selected)}
    try:
        if h3_list is not None:
            cells = {x.strip() for x in h3_list.split(",") if x.strip()}
            if not cells or any(not h3.is_valid_cell(x) or h3.get_resolution(x) != 6 for x in cells):
                raise ValueError("h3 must contain valid resolution-6 cells")
            return sorted(cells), {"type": "h3", "cells": len(cells)}
        if bbox is not None:
            west, south, east, north = map(float, bbox.split(","))
            if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
                raise ValueError("Invalid bbox")
            shape = {"type": "Polygon", "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]]}
            cells = sorted(h3.geo_to_cells(shape, 6))
            return cells, {"type": "bbox", "bbox": bbox, "cells": len(cells)}
        if geometry is not None:
            shape = json.loads(geometry) if isinstance(geometry, str) else geometry
            if shape.get("type") == "Feature":
                shape = shape["geometry"]
            cells = sorted(h3.geo_to_cells(shape, 6))
            return cells, {"type": "geometry", "cells": len(cells)}
        if lat is not None or lon is not None:
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Both valid lat and lon are required")
            radius = 25.0 if radius_km is None else radius_km
            if not math.isfinite(radius) or radius < 0:
                raise ValueError("radius_km must be nonnegative")
            center = h3.latlng_to_cell(lat, lon, 6)
            # A disk step spans roughly two edge lengths; add one ring to cover
            # boundary cells, then retain cell centers inside the radius.
            k = math.ceil(radius / (2 * h3.average_hexagon_edge_length(6, unit="km"))) + 1
            cells = sorted(c for c in h3.grid_disk(center, k)
                           if h3.great_circle_distance((lat, lon), h3.cell_to_latlng(c), unit="km") <= radius
                           or c == center)
            return cells, {"type": "radius", "lat": lat, "lon": lon, "radius_km": radius, "cells": len(cells)}
        if radius_km is not None:
            raise ValueError("radius_km requires lat and lon")
    except (ValueError, TypeError, KeyError, h3.H3BaseException) as exc:
        raise HTTPException(422, str(exc)) from exc
    return None, {"type": "all"}


def _uncertainty():
    """Contract shape: {years_estimated, median_rel_error}. Built from the leave-one-year-out
    validation (median annual relative error of the harmonized series, averaged over countries)."""
    path = db.processed_root() / "metadata" / "harmonization_summary.json"
    if not path.is_file():
        return None
    try:
        countries = json.loads(path.read_text(encoding="utf-8")).get("countries", {})
        from pipeline.harmonize import assess_quality  # countries rated 'baja' do not set the headline error

        extra_path = db.processed_root() / "metadata" / "validation_extra.json"
        breaks = json.loads(extra_path.read_text()).get("breaks", {}) if extra_path.is_file() else {}

        def level(c, name=None):
            try:
                return assess_quality(c, breaks.get(name))["level"]
            except KeyError:  # summary written before the reliability rating existed
                return "media"

        errs = [c["validation"]["ta"]["region_year_median_ape_pct"] / 100 for name, c in countries.items() if level(c, name) != "baja"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        return None
    if not errs:
        return None
    return {"years_estimated": [2001, 2011], "median_rel_error": round(sum(errs) / len(errs), 4)}


def _envelope(cutoff, **extra):
    return {"methodology_version": VERSION, "data_cutoff": cutoff,
            "attribution": ATTRIBUTION, "harmonization_uncertainty": _uncertainty(), **extra}


def _monthly(files, cells):
    if not files or cells == []:
        return []
    where = "WHERE h3_r6 IN (SELECT unnest(?))" if cells is not None else ""
    params = [files] + ([cells] if cells is not None else [])
    sql = f"""SELECT year, month, sum(count_harm), sum(count_harm_lo),
        sum(count_harm_hi), sum(frp_harm), avg(clear_frac), bool_or(is_estimated)
        FROM {db.table_sql(files)} {where} GROUP BY year, month ORDER BY year, month"""
    with db.connection() as con:
        return con.execute(sql, params).fetchall()


def _context_months(table, cells, fields):
    path = db.file_path(table)
    if not path or cells == []:
        return {}
    where = "WHERE h3_r6 IN (SELECT unnest(?))" if cells is not None else ""
    params = [path] + ([cells] if cells is not None else [])
    sql = f"SELECT year, month, {', '.join('avg(' + field + ')' for field in fields)} FROM read_parquet(?) {where} GROUP BY year, month"
    with db.connection() as con:
        return {(y, m): values for y, m, *values in con.execute(sql, params).fetchall()}


def _oni():
    path = db.file_path("context/oni.parquet")
    if not path:
        return {}
    with db.connection() as con:
        return {(y, m): (oni, phase) for y, m, oni, phase in con.execute(
            "SELECT year, month, oni, phase FROM read_parquet(?)", [path]).fetchall()}


def _cutoff():
    path = db.processed_root() / "metadata" / "harmonization_summary.json"
    if not path.is_file():
        return None
    try:
        months = [v["last_ym"] for v in json.loads(path.read_text())["countries"].values()]
        ym = max(months)
        return date(ym // 100, ym % 100, monthrange(ym // 100, ym % 100)[1]).isoformat()
    except (KeyError, ValueError, TypeError, OSError):
        return None


def calendar(*, h3_list=None, bbox=None, lat=None, lon=None, radius_km=None,
             geometry=None, admin=None, from_=date(2001, 1, 1), to=None,
             metric="count", reference="median", burn_type=None):
    if burn_type is not None:
        raise HTTPException(422, "Harmonized burn type is unavailable in this dataset")
    if to is not None and from_ > to:
        raise HTTPException(422, "from must precede to")
    cells, area = _cells(h3_list, bbox, lat, lon, radius_km, geometry, admin)
    all_rows = _monthly(db.parquet_files("cell_month_harmonized"), cells)
    cutoff = max((date(y, m, monthrange(y, m)[1]) for y, m, *_ in all_rows), default=None)
    last_full_year = cutoff.year if cutoff and cutoff.month == 12 else (cutoff.year - 1 if cutoff else 0)
    metric_index = 2 if metric == "count" else 5
    refs = {}
    for row in all_rows:
        if 2001 <= row[0] <= last_full_year and row[metric_index] is not None:
            refs.setdefault(row[1], []).append(row[metric_index])
    rows = []
    clear_months = _context_months("context/clear_frac_coahuila.parquet", cells, ["clear_frac"])
    oni_months = _oni()
    for y, m, count, lo, hi, frp, clear, estimated in all_rows:
        start = date(y, m, 1)
        end = date(y, m, monthrange(y, m)[1])
        if end < from_ or (to is not None and start > to):
            continue
        value = count if metric == "count" else frp
        sample = refs.get(m, [])
        if sample and value is not None:
            ordered = sorted(sample)
            baseline = (ordered[(len(ordered)-1)//2] + ordered[len(ordered)//2]) / 2 if reference == "median" else sum(sample) / len(sample)
            ratio = value / baseline if baseline else None
            greater = sum(v > value for v in sample)
            equal = sum(v == value for v in sample)
            rank = greater + (equal + 1) / 2 if equal else greater + 1
            percentile = 1 - rank / (len(sample) + 1)
            period = min(50.0, 1 / (1 - percentile))
        else:
            ratio = percentile = period = None
        context_clear = clear_months.get((y, m), (None,))[0]
        rows.append({"year": y, "month": m, "count_harm": count,
                     "count_harm_lo": lo, "count_harm_hi": hi, "frp_harm": frp,
                     "anomaly_ratio": ratio, "percentile": percentile,
                     "return_period_years": period, "clear_frac": context_clear,
                     "is_estimated": estimated, "enso_phase": oni_months.get((y, m), (None, None))[1]})
    return _envelope(cutoff.isoformat() if cutoff else None, area=area,
                     reference=reference, metric=metric,
                     return_period_formula="percentile = 1 - descending_midrank/(n+1); years = min(50, 1/(1-percentile))",
                     rows=rows)


def _hotspot_rows(files, cells, from_, to, min_confidence=None):
    if not files or cells == []:
        return [], []
    with db.connection() as con:
        cols = {row[0] for row in con.execute(f"DESCRIBE SELECT * FROM {db.table_sql(files)}", [files]).fetchall()}
        select = [c for c in ("h3_r6", "h3_r7", "ts_utc", "date_local", "lat", "lon", "sensor", "platform", "confidence_h", "frp_mw", "daynight", "burn_type") if c in cols]
        where = ["1=1"]
        params = [files]
        if cells is not None:
            where.append("h3_r6 IN (SELECT unnest(?))")
            params.append(cells)
        if from_ is not None:
            where.append("date_local >= ?")
            params.append(from_)
        if to is not None:
            where.append("date_local <= ?")
            params.append(to)
        if min_confidence is not None:
            if "confidence_h" not in cols:
                raise HTTPException(422, "Confidence is unavailable")
            levels = {"baja": ("baja", "nominal", "alta"), "nominal": ("nominal", "alta"), "alta": ("alta",)}
            where.append("confidence_h IN (SELECT unnest(?))")
            params.append(list(levels[min_confidence]))
        sql = f"SELECT {', '.join(select)} FROM {db.table_sql(files)} WHERE {' AND '.join(where)} ORDER BY date_local, ts_utc"
        return select, con.execute(sql, params).fetchall()


def daily(*, year, month, h3_list=None, bbox=None, lat=None, lon=None,
          radius_km=None, geometry=None, admin=None):
    cells, area = _cells(h3_list, bbox, lat, lon, radius_km, geometry, admin)
    files = db.parquet_files("hotspots")
    first, last = date(year, month, 1), date(year, month, monthrange(year, month)[1])
    cols, records = _hotspot_rows(files, cells, first, last)
    index = cols.index("date_local") if cols else None
    counts = {}
    for record in records:
        day = record[index]
        key = day.isoformat() if hasattr(day, "isoformat") else str(day)
        counts[key] = counts.get(key, 0) + 1
    return _envelope(max(counts, default=None), area=area, year=year, month=month,
                     rows=[{"date": d, "count_raw": n, "count_harm": None}
                           for d, n in sorted(counts.items())])


def hotspots_csv(*, h3_list=None, bbox=None, lat=None, lon=None, radius_km=None,
                 geometry=None, admin=None, from_=None, to=None, burn_type=None,
                 min_confidence=None):
    if from_ and to and from_ > to:
        raise HTTPException(422, "from must precede to")
    if burn_type is not None:
        raise HTTPException(422, "Burn type is unavailable in this dataset")
    cells, _ = _cells(h3_list, bbox, lat, lon, radius_km, geometry, admin)
    cols, records = _hotspot_rows(db.parquet_files("hotspots"), cells, from_, to, min_confidence)
    cutoff = max((r[cols.index("date_local")] for r in records), default=None) if cols else None
    cutoff = cutoff.isoformat() if hasattr(cutoff, "isoformat") else cutoff
    output = io.StringIO()
    output.write(f"# attribution={ATTRIBUTION}\n# methodology_version={VERSION}\n# data_cutoff={cutoff or ''}\n")
    writer = csv.writer(output)
    writer.writerow(cols or ["h3_r6", "h3_r7", "ts_utc", "date_local", "lat", "lon", "sensor", "platform", "confidence_h", "frp_mw", "daynight"])
    writer.writerows(records)
    return Response(output.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=hotspots.csv"})


def admin_search(q):
    return _envelope(_cutoff(), candidates=geo.search(q))


def context(*, h3_list=None, bbox=None, lat=None, lon=None, radius_km=None,
            geometry=None, admin=None, from_=None, to=None):
    if from_ and to and from_ > to:
        raise HTTPException(422, "from must precede to")
    cells, area = _cells(h3_list, bbox, lat, lon, radius_km, geometry, admin)
    oni = _oni()
    fwi = _context_months("context/fwi_coahuila_month.parquet", cells,
                          ["fwi_mean", "fwi_anom", "dc_anom", "dmc_anom"])
    keys = sorted(set(oni) | set(fwi))
    rows = []
    for y, m in keys:
        if from_ and date(y, m, monthrange(y, m)[1]) < from_:
            continue
        if to and date(y, m, 1) > to:
            continue
        values = fwi.get((y, m), (None,) * 4)
        oni_value, phase = oni.get((y, m), (None, None))
        rows.append({"year": y, "month": m, "oni": oni_value, "enso_phase": phase,
                     "fwi_mean": values[0], "fwi_anom": values[1],
                     "dc_anom": values[2], "dmc_anom": values[3]})
    return _envelope(_cutoff(), area=area, rows=rows,
                     coverage="ONI is global; FWI covers only selected cells in the Coahuila context table and available reliable months. Null means unavailable. Precipitation and temperature anomalies are unavailable locally.")


def events(*, h3_list=None, bbox=None, lat=None, lon=None, radius_km=None,
           geometry=None, admin=None, from_=None, to=None, active_only=False,
           min_hotspots=3):
    if from_ and to and from_ > to:
        raise HTTPException(422, "from must precede to")
    if min_hotspots < 0:
        raise HTTPException(422, "min_hotspots must be nonnegative")
    cells, area = _cells(h3_list, bbox, lat, lon, radius_km, geometry, admin)
    files = db.parquet_files("events")
    if not files or cells == []:
        return _envelope(_cutoff(), area=area, rows=[])
    where = ["n_hotspots_harm >= ?"]
    params = [files, min_hotspots]
    if cells is not None:
        where.append("len(list_intersect(cells, ?)) > 0")
        params.append(cells)
    sql = f"""SELECT event_id, start_date, end_date, duration_days, n_hotspots_harm,
        frp_total, area_approx_km2, night_ratio, burn_type, centroid_lat,
        centroid_lon, hex(geometry), cells, rank, estimated,
        rank() OVER (ORDER BY n_hotspots_harm DESC) AS area_rank,
        rank() OVER (ORDER BY duration_days DESC) AS duration_rank,
        rank() OVER (ORDER BY frp_total DESC) AS frp_rank,
        rank() OVER (ORDER BY area_approx_km2 DESC) AS extent_rank
        FROM {db.table_sql(files)} WHERE {' AND '.join(where)}"""
    with db.connection() as con:
        records = con.execute(sql, params).fetchall()
    names = ("event_id", "start_date", "end_date", "duration_days", "n_hotspots_harm",
             "frp_total", "area_approx_km2", "night_ratio", "burn_type", "centroid_lat",
             "centroid_lon", "geometry_wkb_hex", "cells", "rank", "estimated",
             "area_rank", "duration_rank", "frp_rank", "extent_rank")
    rows = []
    for record in records:
        event = dict(zip(names, record))
        if from_ and event["end_date"] < from_ or to and event["start_date"] > to:
            continue
        if active_only and event["end_date"] < date.today():
            continue
        event["start_date"] = event["start_date"].isoformat()
        event["end_date"] = event["end_date"].isoformat()
        rows.append(event)
    rows.sort(key=lambda e: (e["rank"] if e["rank"] is not None else float("inf"), e["event_id"]))
    return _envelope(_cutoff(), area=area, rows=rows,
                     area_rank_basis="n_hotspots_harm; ranks include all events in the selected area above min_hotspots",
                     area_approx_note="Approximate event extent, not burned area")


def reported(*, h3_list=None, bbox=None, lat=None, lon=None, radius_km=None,
             geometry=None, admin=None, from_=None, to=None):
    if from_ and to and from_ > to:
        raise HTTPException(422, "from must precede to")
    cells, area = _cells(h3_list, bbox, lat, lon, radius_km, geometry, admin)
    if area["type"] == "admin" and area["country"] != "Mexico":
        raise HTTPException(422, "CONAFOR reported fires are available only for Mexico")
    states = geo.intersecting_states(cells) if cells is not None else []
    if area["type"] == "admin" and area["country"] == "Mexico":
        state_code = area["code"][:2]
        states = [u for u in geo.units() if u["country"] == "Mexico" and u["level"] == "ent" and u["code"] == state_code]
    if len(states) != 1:
        raise HTTPException(422, "Select an area within one Mexican state for CONAFOR comparison")
    state = states[0]
    state_cells = geo.cells(state)
    monthly = _monthly(db.parquet_files("cell_month_harmonized"), state_cells)
    detected = {(y, m): count for y, m, count, *_ in monthly}
    years = sorted({y for y, _ in detected if (not from_ or y >= from_.year) and (not to or y <= to.year)})
    path = db.file_path("reported/reported_fires.parquet")
    reports = {}
    state_years = set()
    if path:
        with db.connection() as con:
            raw = con.execute("SELECT year, month, cve_mun, sum(n_fires), sum(area_ha) FROM read_parquet(?) WHERE cve_ent=? GROUP BY year, month, cve_mun",
                              [path, state["code"]]).fetchall()
        state_years = {y for y, *_ in raw}
        for y, m, mun, n, area_ha in raw:
            if area["type"] == "admin" and len(area["code"]) == 5 and mun != area["code"][2:]:
                continue
            old_n, old_area = reports.get((y, m), (0, 0))
            reports[(y, m)] = old_n + n, old_area + area_ha
    rows = []
    for y in years:
        for m in range(1, 13):
            if from_ and date(y, m, monthrange(y, m)[1]) < from_ or to and date(y, m, 1) > to:
                continue
            n, area_ha = reports.get((y, m), (None, None))
            rows.append({"year": y, "month": m, "reported_fires": n, "reported_area_ha": area_ha,
                         "detected_hotspots_state_year": sum(v for (yr, _), v in detected.items() if yr == y),
                         "state_year_reported_data": y in state_years})
    return _envelope(_cutoff(), area=area, state={"code": state["code"], "name": state["name"]},
                     rows=rows, coverage="CONAFOR monthly fires and harmonized hotspot detections use different definitions. Null reported values mean no matching monthly record; state_year_reported_data=false means no CONAFOR data for that state/year.")
