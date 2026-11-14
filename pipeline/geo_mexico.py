"""Build Mexico administrative and human geography for the fire-cell universe.

ITER 2020 localities supply population and coordinates. The nearest-locality
metric considers localities with at least 100 residents; the 10 km population
sum includes every locality with a reported population. Distances are great-
circle chord distances, with an Earth radius of 6371.0088 km.
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import shutil
import zipfile
from pathlib import Path

import duckdb
import h3
import numpy as np
import pandas as pd
import pyogrio
import shapely
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import Point
from shapely.strtree import STRtree


OUTPUT_NAMES = ("admin_units", "admin_cells", "localities", "protected_areas", "cell_geo")
EARTH_KM = 6371.0088
DMS = re.compile(r'^\s*(\d+)°\s*(\d+)[\'′]\s*(\d+(?:\.\d+)?)["″]?\s*([NSEW])\s*$', re.I)


def parse_coordinate(value: str) -> float | None:
    """Parse ITER's DMS coordinates, also accepting decimal degrees."""
    value = (value or "").strip()
    if not value:
        return None
    match = DMS.match(value)
    if match:
        deg, minute, second, direction = match.groups()
        if int(minute) >= 60 or float(second) >= 60:
            return None
        result = int(deg) + int(minute) / 60 + float(second) / 3600
        return -result if direction.upper() in ("S", "W") else result
    try:
        return float(value)
    except ValueError:
        return None


def read_localities(archive: Path) -> pd.DataFrame:
    rows = []
    with zipfile.ZipFile(archive) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        with io.TextIOWrapper(zf.open(name), encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                ent, mun, loc = row["ENTIDAD"], row["MUN"], row["LOC"]
                if loc in ("0000", "9998", "9999") or ent == "00":
                    continue
                lat, lon = parse_coordinate(row["LATITUD"]), parse_coordinate(row["LONGITUD"])
                if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                try:
                    pop = int(row["POBTOT"])
                except (ValueError, TypeError):
                    pop = None  # ITER uses '*' for suppressed values.
                rows.append((ent + mun + loc, row["NOM_LOC"], ent, mun, pop, lat, lon))
    return pd.DataFrame(rows, columns=["cvegeo", "name", "cve_ent", "cve_mun", "pop", "lat", "lon"])


def unit_vectors(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat_rad, lon_rad = np.radians(lat), np.radians(lon)
    return np.column_stack((np.cos(lat_rad) * np.cos(lon_rad),
                            np.cos(lat_rad) * np.sin(lon_rad), np.sin(lat_rad)))


def locality_metrics(cell_lat: np.ndarray, cell_lon: np.ndarray, localities: pd.DataFrame,
                     threshold: int = 100) -> tuple[np.ndarray, np.ndarray, list[str | None]]:
    """Use 3-D unit-sphere KD trees for nearest and radius searches."""
    points = unit_vectors(cell_lat, cell_lon)
    known = localities.loc[localities["pop"].notna()].reset_index(drop=True)
    residents = known.loc[known["pop"] >= threshold].reset_index(drop=True)
    distances = np.full(len(points), np.nan)
    names: list[str | None] = [None] * len(points)
    if len(residents):
        chord, idx = cKDTree(unit_vectors(residents.lat.to_numpy(), residents.lon.to_numpy())).query(points)
        distances = 2 * EARTH_KM * np.arcsin(np.clip(chord / 2, 0, 1))
        names = residents.name.iloc[idx].tolist()
    population = np.zeros(len(points), dtype=np.int64)
    if len(known):
        tree = cKDTree(unit_vectors(known.lat.to_numpy(), known.lon.to_numpy()))
        chord_10km = 2 * np.sin(10 / (2 * EARTH_KM))
        groups = tree.query_ball_point(points, r=chord_10km)
        pops = known["pop"].to_numpy(dtype=np.int64)
        population = np.fromiter((pops[group].sum() for group in groups), dtype=np.int64, count=len(groups))
    return distances, population, names


def extract_shapes(outer_archive: Path, anp_archive: Path, scratch: Path) -> tuple[dict[str, Path], Path]:
    scratch.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(outer_archive) as outer:
        with zipfile.ZipFile(io.BytesIO(outer.read("MG_2020_Integrado.zip"))) as inner:
            for item in inner.infolist():
                name = Path(item.filename).name
                if name.startswith(("00ent.", "00mun.")):
                    (scratch / name).write_bytes(inner.read(item))
    with zipfile.ZipFile(anp_archive) as zf:
        for item in zf.infolist():
            (scratch / Path(item.filename).name).write_bytes(zf.read(item))
    return {level: scratch / f"00{level}.shp" for level in ("ent", "mun")}, next(scratch.glob("_225*.shp"))


def assign_units(points: list[Point], geometries: list, codes: list[str]) -> list[str | None]:
    """Assign each centre to one containing polygon, breaking boundary ties by code."""
    matches: list[str | None] = [None] * len(points)
    if geometries:
        pairs = STRtree(geometries).query(points, predicate="intersects")
        for point_idx, geom_idx in zip(*pairs):
            code = codes[geom_idx]
            old = matches[point_idx]
            if old is None or code < old:
                matches[point_idx] = code
    return matches


def repair_text(value: str | None) -> str | None:
    if value and "Ã" in value:
        try:
            return value.encode("latin-1").decode("utf-8")
        except (UnicodeError, ValueError):
            pass
    return value


def build_tables(raw: Path, universe: pd.DataFrame, scratch: Path) -> dict[str, pd.DataFrame]:
    shapes, anp_path = extract_shapes(raw / "889463807469_s.zip", raw / "_225_anp_wgs84_08012024.zip", scratch)
    cells = universe["h3_r6"].drop_duplicates().sort_values().reset_index(drop=True)
    centre_latlon = np.array([h3.cell_to_latlng(cell) for cell in cells])
    lat, lon = centre_latlon[:, 0], centre_latlon[:, 1]
    admin_rows, admin_cell_rows = [], []
    assigned = {}
    for level in ("ent", "mun"):
        frame = pyogrio.read_dataframe(shapes[level])
        if frame.crs is None:
            raise ValueError(f"{shapes[level]} has no CRS")
        to_source = Transformer.from_crs("EPSG:4326", frame.crs, always_xy=True)
        east, north = to_source.transform(lon, lat)
        points = [Point(x, y) for x, y in zip(east, north)]
        codes = frame["CVE_ENT" if level == "ent" else "CVEGEO"].tolist()
        assigned[level] = assign_units(points, frame.geometry.tolist(), codes)
        simplified = frame.set_geometry(frame.geometry.simplify(100, preserve_topology=True)).to_crs("EPSG:4326")
        for idx, row in simplified.iterrows():
            geom = row.geometry
            west, south, east, north = geom.bounds
            admin_rows.append((level, codes[idx], row["NOMGEO"], None if level == "ent" else row["CVE_ENT"],
                               west, south, east, north, geom.wkb))
        admin_cell_rows.extend((level, code, cell) for cell, code in zip(cells, assigned[level]) if code is not None)
    admin_units = pd.DataFrame(admin_rows, columns=["level", "code", "name", "parent_code", "bbox_west",
                                                   "bbox_south", "bbox_east", "bbox_north", "geometry_wkb"])
    admin_cells = pd.DataFrame(admin_cell_rows, columns=["level", "code", "h3_r6"])

    localities = read_localities(raw / "iter_nalcsv20.zip")
    distance, population, names = locality_metrics(lat, lon, localities)

    anp = pyogrio.read_dataframe(anp_path).to_crs("EPSG:4326")
    anp = anp.loc[anp.geometry.notna() & ~anp.geometry.is_empty].copy()
    anp.geometry = anp.geometry.map(lambda geom: shapely.make_valid(geom) if not geom.is_valid else geom)
    protected_areas = pd.DataFrame({"name": anp.NOMBRE.map(repair_text).to_list(),
                                    "category": anp.CAT_MANEJO.map(repair_text).to_list(),
                                    "geometry_wkb": [geom.wkb for geom in anp.geometry]})
    geo_points = [Point(x, y) for x, y in zip(lon, lat)]
    protected_pairs = STRtree(anp.geometry.tolist()).query(geo_points, predicate="intersects")
    in_protected = np.zeros(len(cells), dtype=bool)
    in_protected[protected_pairs[0]] = True
    cell_geo = pd.DataFrame({"h3_r6": cells, "cve_ent": assigned["ent"], "cve_mun": assigned["mun"],
                             "dist_locality_km": distance, "pop_10km": population,
                             "in_protected_area": in_protected, "nearest_locality_name": names})
    return dict(admin_units=admin_units, admin_cells=admin_cells, localities=localities,
                protected_areas=protected_areas, cell_geo=cell_geo)


def write_parquet(con: duckdb.DuckDBPyConnection, frame: pd.DataFrame, path: Path) -> None:
    con.register("out_frame", frame)
    quoted = str(path).replace("'", "''")
    con.execute(f"COPY out_frame TO '{quoted}' (FORMAT PARQUET)")
    con.unregister("out_frame")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=Path(os.environ.get("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--processed", type=Path, default=Path(os.environ.get("FIRELY_DATA_PROCESSED", "data/processed")))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    output = args.processed / "geo" / "Mexico"
    output.mkdir(parents=True, exist_ok=True)
    pending = [name for name in OUTPUT_NAMES if args.force or not (output / f"{name}.parquet").exists()]
    if not pending:
        print("All Mexico geography outputs exist; use --force to rebuild.")
        return
    interim = Path("data/interim")
    interim.mkdir(parents=True, exist_ok=True)
    scratch = interim / "geo_mexico_tmp"
    con = duckdb.connect(config={"memory_limit": "1GB", "temp_directory": str(interim / "geo_mexico_duckdb_tmp")})
    try:
        universe_path = args.processed / "cell_class" / "Mexico.parquet"
        quoted = str(universe_path).replace("'", "''")
        universe = con.execute(f"SELECT h3_r6 FROM read_parquet('{quoted}')").fetchdf()
        tables = build_tables(args.raw, universe, scratch)
        for name in pending:
            path = output / f"{name}.parquet"
            write_parquet(con, tables[name], path)
            print(f"{name}: {len(tables[name]):,} rows -> {path}")
        admin = tables["admin_units"]
        print("Municipalities per state:", admin.loc[admin.level == "mun"].groupby("parent_code").size().to_dict())
        geo = tables["cell_geo"]
        print(f"Cell coverage: state {geo.cve_ent.notna().sum():,}/{len(geo):,}; "
              f"municipality {geo.cve_mun.notna().sum():,}/{len(geo):,}; protected {geo.in_protected_area.sum():,}")
    finally:
        con.close()
        shutil.rmtree(scratch, ignore_errors=True)
        shutil.rmtree(interim / "geo_mexico_duckdb_tmp", ignore_errors=True)


if __name__ == "__main__":
    main()
