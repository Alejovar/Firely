"""Build the `events` table (descripcion §6.3 / §8.1): cluster hotspots into fire events.

Reads  data/processed/hotspots/<Country>/year=YYYY/part-0.parquet
Writes data/processed/events/<Country>/year=YYYY/part-0.parquet

Method
------
* Sensor regime: year >= 2012 -> VIIRS only (SNPP, NOAA20, NOAA21); year < 2012 -> MODIS only,
  flagged ``estimated = true``.
* Multi-satellite dedupe: detections of the same ~375 m (VIIRS) / ~1 km (MODIS) grid cell on the same
  local date and day/night flag are collapsed to one point, keeping the preferred platform
  (SNPP > NOAA20 > NOAA21; Aqua > Terra). Grid-edge misses are possible (approximation).
* Clustering: nodes = unique (H3 r8 cell, local date). Two nodes are linked when their cells are within
  ``ceil(dist_km / r8 spacing)`` H3 rings (~0.82 km per ring, so the effective distance is d rounded up
  to a ring: ~1.6 km VIIRS for d=1.5, ~3.3 km MODIS for d=3) and their dates differ by <= ``days``.
  Connected components via vectorised union-find (hook + pointer jumping) in numpy.
* Year boundary: points from the last/first ``boundary_days`` (default 15) of the adjacent years (same
  sensor regime only) are included so fires crossing Dec/Jan are joined. An event belongs to the year of
  its start_date; events that start before Jan 1 of the processed year are dropped (they belong to the
  previous year's partition). Events running more than ``boundary_days`` past Dec 31 are truncated there
  in the earlier year's partition (documented limitation).
* Geometry: WKB convex hull computed in pure Python (shapely is not installed); Point / LineString /
  Polygon in lon/lat (EPSG:4326).
* ``n_hotspots_harm`` is the raw (deduped) point count until harmonized weights exist. ``burn_type`` is
  the mode of the hotspot burn_type column when present, otherwise NULL.
* ``area_approx_km2`` = unique pixel grid cells x nominal pixel area (0.14 VIIRS / 1.0 MODIS). Not burned area.
* Extra columns beyond tables.json: ``rank`` (1 = largest frp_total within the country, over all years
  present on disk) and ``estimated`` (MODIS-only years).
"""
from __future__ import annotations

import argparse
import math
import struct
import time
from pathlib import Path

import duckdb
import h3
import numpy as np
import pandas as pd

from .ingest import COUNTRIES, parse_years

ROOT = Path(__file__).resolve().parents[1]
HOT_DIR = ROOT / "data" / "processed" / "hotspots"
OUT_DIR = ROOT / "data" / "processed" / "events"
VIIRS_FIRST_YEAR = 2012
RES = 8
RING_KM = 0.82  # approx. centre spacing of H3 r8 cells
ISO = {"Mexico": "MX", "Argentina": "AR"}
PRIO = {"SNPP": 1, "NOAA20": 2, "NOAA21": 3, "Aqua": 1, "Terra": 2}
PIXEL_AREA = {"VIIRS": 0.14, "MODIS": 1.0}
PIXEL_GRID_DEG = {"VIIRS": 0.0035, "MODIS": 0.009}

COLUMNS = ["event_id", "start_date", "end_date", "duration_days", "n_hotspots_harm", "frp_total",
           "area_approx_km2", "night_ratio", "burn_type", "centroid_lat", "centroid_lon", "geometry",
           "cells", "rank", "estimated"]


def q(path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


# ----------------------------------------------------------------------------- clustering core
def connected_components(n: int, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Vectorised union-find: returns the root label (min index in component) per node."""
    parent = np.arange(n)
    if len(u) == 0:
        return parent
    while True:
        pu, pv = parent[u], parent[v]
        mask = pu != pv
        if not mask.any():
            break
        u, v, pu, pv = u[mask], v[mask], pu[mask], pv[mask]
        hi, lo = np.maximum(pu, pv), np.minimum(pu, pv)
        np.minimum.at(parent, hi, lo)  # hook larger root under smaller
        while True:  # pointer jumping
            gp = parent[parent]
            if np.array_equal(gp, parent):
                break
            parent = gp
    return parent


def cluster_points(lat, lon, day, dist_km: float, days: int, res: int = RES) -> np.ndarray:
    """Cluster points; ``day`` is an integer day ordinal. Returns an event label (0..k-1) per point."""
    lat, lon, day = np.asarray(lat, float), np.asarray(lon, float), np.asarray(day, np.int64)
    n = len(lat)
    if n == 0:
        return np.zeros(0, np.int64)
    # H3 cell per unique coordinate
    coords = np.round(np.column_stack([lat, lon]), 5)
    ucoords, cinv = np.unique(coords, axis=0, return_inverse=True)
    cells = [h3.latlng_to_cell(a, b, res) for a, b in ucoords]
    ucells, cell_of_coord = np.unique(np.array(cells), return_inverse=True)
    cell_id = cell_of_coord[cinv.ravel()]
    ncell = len(ucells)
    # nodes = unique (cell, day)
    d0 = day.min()
    D = int(day.max() - d0) + days + 2
    pkey = cell_id.astype(np.int64) * D + (day - d0)
    nkeys, node_of_pt = np.unique(pkey, return_inverse=True)
    node_cell, node_day = nkeys // D, nkeys % D
    # neighbour cells (CSR) within k rings
    k = max(1, math.ceil(dist_km / (RING_KM * 2 ** (8 - res))))
    index = {c: i for i, c in enumerate(ucells.tolist())}
    nb_src, nb_dst = [], []
    for c, i in index.items():
        for nb in h3.grid_disk(c, k):
            j = index.get(nb)
            if j is not None:
                nb_src.append(i)
                nb_dst.append(j)
    nb_src, nb_dst = np.array(nb_src), np.array(nb_dst)
    order = np.argsort(nb_src, kind="stable")
    nb_src, nb_dst = nb_src[order], nb_dst[order]
    ptr = np.searchsorted(nb_src, np.arange(ncell + 1))
    cnt = ptr[1:] - ptr[:-1]
    # expand nodes x neighbours
    rep = cnt[node_cell]
    src = np.repeat(np.arange(len(nkeys)), rep)
    pos = np.arange(len(src)) - np.repeat(np.cumsum(rep) - rep, rep)
    dst_cell = nb_dst[ptr[node_cell][src] + pos]
    us, vs = [], []
    for dd in range(days + 1):
        tgt = dst_cell * D + (node_day[src] + dd)
        idx = np.searchsorted(nkeys, tgt)
        idx[idx >= len(nkeys)] = 0
        ok = nkeys[idx] == tgt
        if dd == 0:
            ok &= idx != src
        us.append(src[ok])
        vs.append(idx[ok])
    root = connected_components(len(nkeys), np.concatenate(us), np.concatenate(vs))
    _, label_of_node = np.unique(root, return_inverse=True)
    return label_of_node[node_of_pt]


# ----------------------------------------------------------------------------- geometry
def _hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def hull_wkb(lons, lats) -> bytes:
    """WKB (little endian) convex hull of the points: Point, LineString or Polygon."""
    h = _hull(list(zip(np.round(lons, 5).tolist(), np.round(lats, 5).tolist())))
    if len(h) == 1:
        return struct.pack("<BIdd", 1, 1, *h[0])
    if len(h) == 2:
        return struct.pack("<BII", 1, 2, 2) + b"".join(struct.pack("<dd", *p) for p in h)
    ring = h + [h[0]]
    return struct.pack("<BIII", 1, 3, 1, len(ring)) + b"".join(struct.pack("<dd", *p) for p in ring)


# ----------------------------------------------------------------------------- IO / driver
def load_points(con, country: str, year: int, boundary_days: int) -> tuple[pd.DataFrame, str]:
    sensor = "VIIRS" if year >= VIIRS_FIRST_YEAR else "MODIS"
    parts = []
    for y in (year - 1, year, year + 1):
        if (y >= VIIRS_FIRST_YEAR) != (year >= VIIRS_FIRST_YEAR):
            continue
        f = HOT_DIR / country / f"year={y}" / "part-0.parquet"
        if not f.exists():
            continue
        if y == year:
            cond = "TRUE"
        elif y < year:
            cond = f"date_local > DATE '{year}-01-01' - INTERVAL {boundary_days} DAY"
        else:
            cond = f"date_local < DATE '{year}-12-31' + INTERVAL {boundary_days} DAY"
        parts.append(f"SELECT * FROM read_parquet({q(f)}) WHERE sensor = '{sensor}' AND {cond}")
    if not parts:
        return pd.DataFrame(), sensor
    g = PIXEL_GRID_DEG[sensor]
    prio = " ".join(f"WHEN '{k}' THEN {v}" for k, v in PRIO.items())
    sql = f"""SELECT lat, lon, date_local, platform, h3_r6, daynight, frp_mw,
                     {'burn_type' if _has_col(con, parts[0], 'burn_type') else 'NULL::VARCHAR AS burn_type'}
              FROM ({' UNION ALL '.join(parts)})
              QUALIFY row_number() OVER (
                  PARTITION BY floor(lat/{g}), floor(lon/{g}), date_local, daynight
                  ORDER BY CASE platform {prio} ELSE 9 END) = 1"""
    return con.execute(sql).fetchdf(), sensor


def _has_col(con, sub: str, col: str) -> bool:
    return col in [r[0] for r in con.execute(f"DESCRIBE {sub}").fetchall()]


def build_events(df: pd.DataFrame, sensor: str, year: int, country: str, dist_km: float, days: int) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=COLUMNS)
    dates = pd.to_datetime(df["date_local"])
    day = (dates - pd.Timestamp("1970-01-01")).dt.days.to_numpy()
    lab = cluster_points(df["lat"].to_numpy(), df["lon"].to_numpy(), day, dist_km, days)
    df = df.assign(lab=lab, day=day, night=(df["daynight"] == "N").astype(float),
                   frp=df["frp_mw"].fillna(0.0))
    g = PIXEL_GRID_DEG[sensor]
    df["pix"] = (np.floor(df["lat"] / g).astype(np.int64) * 1_000_003 + np.floor(df["lon"] / g).astype(np.int64))
    agg = df.groupby("lab").agg(
        d0=("day", "min"), d1=("day", "max"), n=("lat", "size"), frp_total=("frp", "sum"),
        night_ratio=("night", "mean"), clat=("lat", "mean"), clon=("lon", "mean"), npix=("pix", "nunique"))
    agg["start_date"] = pd.to_datetime(agg["d0"], unit="D").dt.date
    agg["end_date"] = pd.to_datetime(agg["d1"], unit="D").dt.date
    agg = agg[agg["d0"] >= (pd.Timestamp(f"{year}-01-01") - pd.Timestamp("1970-01-01")).days]
    keep = set(agg.index)
    sub = df[df["lab"].isin(keep)]
    cells, geoms, burn = {}, {}, {}
    for lb, grp in sub.groupby("lab"):
        cells[lb] = sorted(grp["h3_r6"].unique().tolist())
        geoms[lb] = hull_wkb(grp["lon"].to_numpy(), grp["lat"].to_numpy())
        bt = grp["burn_type"].dropna()
        burn[lb] = bt.mode().iloc[0] if len(bt) else None
    out = pd.DataFrame(index=agg.index)
    out["start_date"], out["end_date"] = agg["start_date"], agg["end_date"]
    out["duration_days"] = (agg["d1"] - agg["d0"] + 1).astype("int32")
    out["n_hotspots_harm"] = agg["n"].astype(float)
    out["frp_total"] = agg["frp_total"]
    out["area_approx_km2"] = agg["npix"] * PIXEL_AREA[sensor]
    out["night_ratio"] = agg["night_ratio"]
    out["burn_type"] = pd.Series(burn)
    out["centroid_lat"], out["centroid_lon"] = agg["clat"], agg["clon"]
    out["geometry"] = pd.Series(geoms)
    out["cells"] = pd.Series(cells)
    base = [f"{ISO.get(country, country[:2].upper())}-{s:%Y%m%d}-{h3.latlng_to_cell(a, b, 7)}"
            for s, a, b in zip(out["start_date"], out["centroid_lat"], out["centroid_lon"])]
    seen: dict[str, int] = {}
    ids = []
    for b in base:
        seen[b] = seen.get(b, 0) + 1
        ids.append(b if seen[b] == 1 else f"{b}-{seen[b]}")
    out.insert(0, "event_id", ids)
    out["rank"] = np.int32(0)
    out["estimated"] = sensor == "MODIS"
    return out.reset_index(drop=True)[COLUMNS]


def write_year(con, ev: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp.parquet")
    con.register("ev_df", ev)
    con.execute(f"""COPY (SELECT event_id, start_date::DATE AS start_date, end_date::DATE AS end_date,
        duration_days::INTEGER AS duration_days, n_hotspots_harm, frp_total, area_approx_km2, night_ratio,
        burn_type::VARCHAR AS burn_type, centroid_lat, centroid_lon, geometry::BLOB AS geometry, cells::VARCHAR[] AS cells,
        "rank"::INTEGER AS "rank", estimated::BOOLEAN AS estimated FROM ev_df)
        TO {q(tmp)} (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.unregister("ev_df")
    tmp.replace(path)


def rerank(con, country: str) -> None:
    """Recompute `rank` (frp_total desc) over every year partition present for the country."""
    files = sorted((OUT_DIR / country).glob("year=*/part-0.parquet"))
    if not files:
        return
    con.execute(f"""CREATE OR REPLACE TEMP TABLE allev AS
        SELECT * EXCLUDE ("rank"), regexp_extract(filename, 'year=(\\d+)', 1)::INTEGER AS y
        FROM read_parquet({q(str(OUT_DIR / country / 'year=*' / 'part-0.parquet'))}, filename=true)""")
    con.execute("""CREATE OR REPLACE TEMP TABLE ranked AS SELECT *,
        row_number() OVER (ORDER BY frp_total DESC, event_id)::INTEGER AS "rank" FROM allev""")
    for f in files:
        y = int(f.parent.name.split("=")[1])
        tmp = f.with_suffix(".tmp.parquet")
        con.execute(f"""COPY (SELECT {', '.join(c if c != 'rank' else chr(34) + 'rank' + chr(34) for c in COLUMNS)}
            FROM ranked WHERE y = {y} ORDER BY start_date, event_id)
            TO {q(tmp)} (FORMAT PARQUET, COMPRESSION ZSTD)""")
        tmp.replace(f)


def run(country: str, years: list[int], dist_viirs: float = 1.5, dist_modis: float = 3.0,
        days: int = 3, boundary_days: int = 15) -> dict:
    con = duckdb.connect()
    summary = {}
    for y in years:
        t = time.time()
        df, sensor = load_points(con, country, y, boundary_days)
        ev = build_events(df, sensor, y, country, dist_viirs if sensor == "VIIRS" else dist_modis, days)
        if len(ev):
            write_year(con, ev, OUT_DIR / country / f"year={y}" / "part-0.parquet")
        summary[y] = (len(df), len(ev), round(time.time() - t, 1))
        print(f"{country} {y}: {len(df)} points -> {len(ev)} events ({sensor}) in {summary[y][2]}s")
    rerank(con, country)
    return summary


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Cluster hotspots into fire events.")
    p.add_argument("--country", required=True)
    p.add_argument("--years", required=True, type=parse_years)
    p.add_argument("--dist-km-viirs", type=float, default=1.5)
    p.add_argument("--dist-km-modis", type=float, default=3.0)
    p.add_argument("--days", type=int, default=3)
    p.add_argument("--boundary-days", type=int, default=15)
    a = p.parse_args(argv)
    run(a.country, a.years, a.dist_km_viirs, a.dist_km_modis, a.days, a.boundary_days)


if __name__ == "__main__":
    main()
