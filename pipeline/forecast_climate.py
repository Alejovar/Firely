"""Monthly climate for the 1-3 month fire outlook (docs/plan-modelo-predictivo.md §4, §14).

Source: NASA POWER regional monthly API (MERRA-2 based meteorology, 0.5° lat x 0.625° lon), community AG.
The regional endpoint accepts one parameter and at most a 10° x 10° box per request, so the script tiles the
bounding box of every country's H3 r6 cells, skips tiles without cells, and caches each raw response.

Reads  data/processed/cell_month_harmonized/<Country>/year=2020/*.parquet   (only to list the cells)
Caches data/interim/power/<PARAM>_<lon0>_<lat0>_<start>_<end>.json          (raw responses, reused on reruns)
With --recent YYYY-MM it aggregates the POWER DAILY API (few days of latency) to the months of the current year
and writes data/processed/forecast/power_grid_month_recent.parquet (same columns), read by forecast_features.

Writes data/processed/forecast/power_grid_month.parquet
         lat, lon, year, month, precip_mm_day, t2m_c, t2m_max_c, rh_pct, wind_ms, gwetroot, gwettop, vpd_kpa
       data/processed/forecast/cell_power/<Country>.parquet
         h3_r6, lat, lon (nearest POWER grid point, join key into power_grid_month)

* NaN means "no value" (POWER fill -999), never zero.
* vpd_kpa is derived from the monthly means (Tetens): es(T2M) * (1 - RH2M/100). An approximation: monthly means
  of T and RH are not the mean daily VPD.
* NASA hosts hang over IPv6 on the team network: IPv4 is forced.

    python -m pipeline.forecast_climate [--start 2001] [--end 2025] [--country ...] [--force]
"""
from __future__ import annotations

import json
import math
import os
import socket
import time
from pathlib import Path

import h3
import pandas as pd
import requests
import urllib3.util.connection as urllib3_connection

from .tables_common import connect, copy_atomic, countries, parser, q

urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

URL = "https://power.larc.nasa.gov/api/temporal/{temporal}/regional"
PARAMS = {"PRECTOTCORR": "precip_mm_day", "T2M": "t2m_c", "T2M_MAX": "t2m_max_c", "RH2M": "rh_pct",
          "WS2M": "wind_ms", "GWETROOT": "gwetroot", "GWETTOP": "gwettop"}
LAT_STEP, LON_STEP = 0.5, 0.625
TILE = 10.0
FILL = -999.0


def interim_default() -> Path:
    return Path(os.environ.get("FIRELY_DATA_INTERIM", "data/interim"))


def write_df(con, df: pd.DataFrame, dest: Path) -> None:
    con.register("_df", df)
    try:
        copy_atomic(con, "SELECT * FROM _df", dest)
    finally:
        con.unregister("_df")


def snap(lat: float, lon: float) -> tuple[float, float]:
    return round(round(lat / LAT_STEP) * LAT_STEP, 4), round(round(lon / LON_STEP) * LON_STEP, 4)


def country_cells(con, processed: Path, country: str) -> pd.DataFrame:
    root = processed / "cell_month_harmonized" / country
    year_dir = next(p for p in sorted(root.glob("year=*"), reverse=True) if any(p.glob("*.parquet")))
    cells = con.execute(f"SELECT DISTINCT h3_r6 FROM read_parquet({q(year_dir / '*.parquet')})").df()
    ll = [h3.cell_to_latlng(c) for c in cells.h3_r6]
    cells["clat"] = [p[0] for p in ll]
    cells["clon"] = [p[1] for p in ll]
    snapped = [snap(a, b) for a, b in ll]
    cells["lat"] = [p[0] for p in snapped]
    cells["lon"] = [p[1] for p in snapped]
    return cells


def tiles_for(points: pd.DataFrame) -> list[tuple[float, float]]:
    """10° tiles (south-west corner) that contain at least one grid point."""
    keys = {(math.floor(lon / TILE) * TILE, math.floor(lat / TILE) * TILE)
            for lat, lon in points[["lat", "lon"]].drop_duplicates().itertuples(index=False)}
    return sorted(keys)


def fetch_tile(param: str, lon0: float, lat0: float, start: int, end: int, cache: Path,
               temporal: str = "monthly") -> dict:
    prefix = "" if temporal == "monthly" else f"{temporal}_"
    path = cache / f"{prefix}{param}_{lon0:g}_{lat0:g}_{start}_{end}.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    params = {"parameters": param, "community": "AG", "longitude-min": lon0, "longitude-max": lon0 + TILE,
              "latitude-min": lat0, "latitude-max": lat0 + TILE, "start": start, "end": end, "format": "JSON"}
    last = None
    for attempt in range(4):
        try:
            r = requests.get(URL.format(temporal=temporal), params=params, timeout=300, headers={"User-Agent": "firely-pipeline"})
            if r.status_code == 200:
                data = r.json()
                if data.get("features"):
                    path.parent.mkdir(parents=True, exist_ok=True)
                    tmp = path.with_suffix(".tmp")
                    tmp.write_text(json.dumps(data), encoding="utf-8")
                    tmp.replace(path)
                    return data
                last = data.get("messages") or data.get("header")
            else:
                last = f"HTTP {r.status_code}: {r.text[:200]}"
        except (requests.RequestException, ValueError) as exc:
            last = repr(exc)
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"POWER {param} tile ({lon0}, {lat0}) failed: {last}")


def tile_rows(data: dict, param: str) -> list[tuple]:
    rows = []
    for feat in data["features"]:
        lon, lat = feat["geometry"]["coordinates"][:2]
        for key, v in feat["properties"]["parameter"][param].items():
            m = int(key[4:])
            if 1 <= m <= 12:  # month 13 is the annual value
                rows.append((round(lat, 4), round(lon, 4), int(key[:4]), m,
                             None if v is None or v == FILL else float(v)))
    return rows


# Monthly aggregation of POWER daily values, checked against the monthly product for 2025 (mean absolute
# difference <= 0.003 for the means): T2M_MAX in the monthly product is the maximum of the month.
DAILY_AGG = {"T2M_MAX": "max"}


def tile_rows_daily(data: dict, param: str, last_month: tuple[int, int]) -> list[tuple]:
    """Daily values aggregated to complete months up to last_month (mean, or max for T2M_MAX)."""
    acc: dict = {}
    for feat in data["features"]:
        lon, lat = feat["geometry"]["coordinates"][:2]
        for key, v in feat["properties"]["parameter"][param].items():
            ym = (int(key[:4]), int(key[4:6]))
            if ym > last_month or v is None or v == FILL:
                continue
            acc.setdefault((round(lat, 4), round(lon, 4), *ym), []).append(float(v))
    how = DAILY_AGG.get(param, "mean")
    return [(*k, (max(v) if how == "max" else sum(v) / len(v))) for k, v in acc.items()]


def check_daily(processed: Path, interim: Path, year: int = 2025) -> dict:
    """Aggregate POWER daily values of a complete year with DAILY_AGG and compare with the monthly product, on the
    first tile of the grid. Writes data/processed/metadata/power_daily_check.json (mean absolute difference)."""
    cells = country_cells(connect("1GB"), processed, countries(processed)[0])
    lon0, lat0 = tiles_for(cells)[0]
    diffs = {}
    for param in PARAMS:
        daily = tile_rows_daily(fetch_tile(param, lon0, lat0, int(f"{year}0101"), int(f"{year}1231"), interim / "power",
                                           "daily"), param, (year, 12))
        monthly = {(a, b, y, m): v for a, b, y, m, v in
                   tile_rows(fetch_tile(param, lon0, lat0, 2001, year, interim / "power"), param) if y == year}
        d = [abs(v - monthly[(la, lo, y, m)]) for la, lo, y, m, v in daily
             if monthly.get((la, lo, y, m)) is not None]
        diffs[param] = sum(d) / len(d) if d else None
    out = {"year": year, "tile": [lon0, lat0], "mean_abs_difference": diffs,
           "max_mean_abs_difference": max(v for v in diffs.values() if v is not None)}
    dest = processed / "metadata" / "power_daily_check.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2))
    return out


def build_recent(processed: Path, interim: Path, country_list: list[str], year: int, last_month: int, force: bool,
                 memory_limit: str) -> dict:
    """Months of `year` (1..last_month) from the POWER daily API, for the live outlook. POWER monthly only has
    complete years; daily values are published with a few days of latency."""
    out = processed / "forecast"
    dest = out / "power_grid_month_recent.parquet"
    if dest.is_file() and not force:
        return {"skipped": True, "output": str(dest)}
    con = connect(memory_limit, processed)
    try:
        cells = {c: country_cells(con, processed, c) for c in country_list}
        points = pd.concat(cells.values())[["lat", "lon"]].drop_duplicates()
        tiles = tiles_for(points)
        end_day = pd.Timestamp(year, last_month, 1) + pd.offsets.MonthEnd(0)
        start, end = int(f"{year}0101"), int(end_day.strftime("%Y%m%d"))
        frames = {}
        for param, name in PARAMS.items():
            rows = []
            for i, (lon0, lat0) in enumerate(tiles, 1):
                rows += tile_rows_daily(fetch_tile(param, lon0, lat0, start, end, interim / "power", "daily"),
                                        param, (year, last_month))
                print(f"  daily {param} tile {i}/{len(tiles)}", flush=True)
            df = pd.DataFrame(rows, columns=["lat", "lon", "year", "month", name])
            frames[name] = df.groupby(["lat", "lon", "year", "month"], as_index=False)[name].mean()
        grid = None
        for df in frames.values():
            grid = df if grid is None else grid.merge(df, on=["lat", "lon", "year", "month"], how="outer")
        grid = grid.merge(points, on=["lat", "lon"])
        es = 0.6108 * (17.27 * grid.t2m_c / (grid.t2m_c + 237.3)).map(math.exp, na_action="ignore")
        grid["vpd_kpa"] = es * (1 - grid.rh_pct / 100)
        grid = grid.sort_values(["lat", "lon", "year", "month"])
        grid["year"] = grid.year.astype("int16")
        grid["month"] = grid.month.astype("int8")
        write_df(con, grid, dest)
        nulls = {c: int(grid[c].isna().sum()) for c in grid.columns if grid[c].isna().any()}
        check = check_daily(processed, interim)
    finally:
        con.close()
    return {"tiles": len(tiles), "rows": int(len(grid)), "months": [f"{year}-01", f"{year}-{last_month:02d}"],
            "null_values": nulls, "daily_vs_monthly_check": check, "output": str(dest)}


def build(processed: Path, interim: Path, country_list: list[str], start: int, end: int, force: bool,
          memory_limit: str) -> dict:
    out = processed / "forecast"
    grid_dest = out / "power_grid_month.parquet"
    con = connect(memory_limit, processed)
    try:
        cells = {c: country_cells(con, processed, c) for c in country_list}
        for c, df in cells.items():
            dest = out / "cell_power" / f"{c}.parquet"
            if force or not dest.is_file():
                write_df(con, df[["h3_r6", "lat", "lon"]], dest)
        if grid_dest.is_file() and not force:
            return {"skipped": True, "output": str(grid_dest)}
        points = pd.concat(cells.values())[["lat", "lon"]].drop_duplicates()
        tiles = tiles_for(points)
        cache = interim / "power"
        frames = {}
        for param, name in PARAMS.items():
            rows = []
            for i, (lon0, lat0) in enumerate(tiles, 1):
                rows += tile_rows(fetch_tile(param, lon0, lat0, start, end, cache), param)
                print(f"  {param} tile {i}/{len(tiles)}", flush=True)
            df = pd.DataFrame(rows, columns=["lat", "lon", "year", "month", name])
            frames[name] = df.groupby(["lat", "lon", "year", "month"], as_index=False)[name].mean()  # tile overlaps
        grid = None
        for df in frames.values():
            grid = df if grid is None else grid.merge(df, on=["lat", "lon", "year", "month"], how="outer")
        # keep only the grid points some cell uses
        grid = grid.merge(points.assign(lat=points.lat.round(4), lon=points.lon.round(4)), on=["lat", "lon"])
        es = 0.6108 * (17.27 * grid.t2m_c / (grid.t2m_c + 237.3)).map(math.exp, na_action="ignore")
        grid["vpd_kpa"] = es * (1 - grid.rh_pct / 100)
        grid = grid.sort_values(["lat", "lon", "year", "month"])
        grid["year"] = grid.year.astype("int16")
        grid["month"] = grid.month.astype("int8")
        write_df(con, grid, grid_dest)
        missing = int(points.merge(grid[["lat", "lon"]].drop_duplicates(), how="left", indicator=True)
                      ._merge.eq("left_only").sum())
    finally:
        con.close()
    return {"tiles": len(tiles), "grid_points": int(len(points)), "points_without_data": missing,
            "rows": int(len(grid)), "years": [start, end], "output": str(grid_dest)}


def main() -> None:
    p = parser(__doc__)
    p.add_argument("--interim", type=Path, default=interim_default())
    p.add_argument("--start", type=int, default=2001)
    p.add_argument("--end", type=int, default=2025, help="last complete year published by POWER")
    p.add_argument("--recent", default=None, metavar="YYYY-MM",
                   help="instead of the monthly archive, aggregate POWER daily values Jan..YYYY-MM of that year")
    a = p.parse_args()
    if a.recent:
        y, m = map(int, a.recent.split("-"))
        print(build_recent(a.processed, a.interim, a.country or countries(a.processed), y, m, a.force,
                           a.memory_limit), flush=True)
        return
    print(build(a.processed, a.interim, a.country or countries(a.processed), a.start, a.end, a.force,
                a.memory_limit), flush=True)


if __name__ == "__main__":
    main()
