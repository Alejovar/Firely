"""Build Argentina geography for the historical-fire H3 r6 cell universe.

GeoNames places with population >= 100 are used for nearest-place distance.
Population within 10 km sums all places with reported population > 0.
All populated places are retained in localities.parquet.
Distances use great-circle chord search followed by haversine distance.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import zipfile
from pathlib import Path

import duckdb
import h3
import numpy as np
import pandas as pd
import pyogrio
from scipy.spatial import cKDTree
from shapely import Point, STRtree, from_wkb, to_wkb
from shapely.geometry import shape

OUTPUTS = ("admin_units", "admin_cells", "localities", "protected_areas", "cell_geo")
GEONAMES_FIELDS = ("geonameid", "name", "asciiname", "alternatenames", "latitude",
                   "longitude", "feature_class", "feature_code", "country_code", "cc2",
                   "admin1", "admin2", "admin3", "admin4", "population", "elevation",
                   "dem", "timezone", "modification_date")
EARTH_KM = 6371.0088
MIN_LOCALITY_POP = 100


def read_admin(path: Path, level: str) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        member = f"geoBoundaries-ARG-{level.upper()}.geojson"
        data = json.load(archive.open(member))
    rows = []
    for feature in data["features"]:
        props = feature["properties"]
        geom = shape(feature["geometry"])
        # The ADM1 archive misspells La Rioja as "La Roja".
        name = "La Rioja" if level == "adm1" and props["shapeName"] == "La Roja" else props["shapeName"]
        rows.append({"level": level, "code": str(props["shapeID"]),
                     "name": name, "geometry": geom})
    return rows


def point_codes(points: np.ndarray, units: list[dict]) -> list[str | None]:
    """Assign by point containment; choose the smaller polygon at shared edges."""
    if not len(points):
        return []
    geoms = [u["geometry"] for u in units]
    pairs = STRtree(geoms).query(points, predicate="intersects")
    codes = [None] * len(points)
    area = [float("inf")] * len(points)
    for p, g in zip(*pairs):
        size = geoms[g].area
        if size < area[p]:
            codes[p], area[p] = units[g]["code"], size
    return codes


def parent_codes(adm1: list[dict], adm2: list[dict]) -> None:
    for unit in adm2:
        centroid = unit["geometry"].centroid
        code = point_codes(np.array([centroid], dtype=object), adm1)[0]
        if code is None:  # Some multipolygon centroids lie outside their own province.
            code = point_codes(np.array([unit["geometry"].representative_point()], dtype=object), adm1)[0]
        unit["parent_code"] = code


def read_localities(path: Path, adm1: list[dict]) -> pd.DataFrame:
    records = []
    with zipfile.ZipFile(path) as archive, archive.open("AR.txt") as source:
        for raw in source:
            fields = raw.decode("utf-8").rstrip("\r\n").split("\t")
            if len(fields) != len(GEONAMES_FIELDS):
                raise ValueError(f"GeoNames row has {len(fields)} fields, expected 19")
            if fields[6] != "P":
                continue
            records.append((int(fields[0]), fields[1], int(fields[14] or 0),
                            float(fields[4]), float(fields[5])))
    result = pd.DataFrame(records, columns=["geonameid", "name", "pop", "lat", "lon"])
    points = np.array([Point(lon, lat) for lat, lon in zip(result.lat, result.lon)], dtype=object)
    names = {u["code"]: u["name"] for u in adm1}
    result.insert(2, "adm1", [names.get(code) for code in point_codes(points, adm1)])
    return result


def read_protected(path: Path, scratch: Path) -> pd.DataFrame:
    records = []
    with zipfile.ZipFile(path) as outer:
        parts = sorted(n for n in outer.namelist() if n.endswith(".zip"))
        for i, name in enumerate(parts):
            part_dir = scratch / str(i)
            part_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
                for member in inner.namelist():
                    if "-polygons." in member:
                        (part_dir / Path(member).name).write_bytes(inner.read(member))
            shp = next(part_dir.glob("*.shp"))
            info = pyogrio.read_info(shp)
            if info["crs"] != "EPSG:4326":
                frame = pyogrio.read_dataframe(shp).to_crs(4326)
            else:
                frame = pyogrio.read_dataframe(shp)
            for row in frame.itertuples(index=False):
                geom = row.geometry
                if geom is None or geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
                    continue
                records.append({"SITE_PID": str(getattr(row, "SITE_PID")),
                                "NAME": getattr(row, "NAME", None),
                                "DESIG_ENG": getattr(row, "DESIG_ENG", None),
                                "IUCN_CAT": getattr(row, "IUCN_CAT", None),
                                "STATUS": getattr(row, "STATUS", None),
                                "geometry_wkb": to_wkb(geom)})
    return pd.DataFrame(records).drop_duplicates(subset=["SITE_PID", "geometry_wkb"])


def unit_frame(adm1: list[dict], adm2: list[dict]) -> pd.DataFrame:
    records = []
    for unit in adm1 + adm2:
        minx, miny, maxx, maxy = unit["geometry"].bounds
        records.append({"level": unit["level"], "code": unit["code"],
                        "name": unit["name"], "parent_code": unit.get("parent_code"),
                        "bbox_min_lon": minx, "bbox_min_lat": miny,
                        "bbox_max_lon": maxx, "bbox_max_lat": maxy,
                        "geometry_wkb": to_wkb(unit["geometry"].simplify(0.005, preserve_topology=True))})
    return pd.DataFrame(records)


def xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat, lon = np.radians(lat.astype(float)), np.radians(lon.astype(float))
    return np.column_stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)))


def locality_metrics(lat: np.ndarray, lon: np.ndarray, places: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, list[str | None]]:
    """Nearest locality with >=100 people and reported population within 10 km."""
    eligible = places.loc[places["pop"] >= MIN_LOCALITY_POP].reset_index(drop=True)
    populated = places.loc[places["pop"] > 0].reset_index(drop=True)
    if eligible.empty:
        n = len(lat)
        names = [None] * n
        nearest_km = np.full(n, np.nan)
    else:
        vectors = xyz(eligible.lat.to_numpy(), eligible.lon.to_numpy())
        tree = cKDTree(vectors)
        cells = xyz(lat, lon)
        chord, idx = tree.query(cells)
        nearest_km = 2 * EARTH_KM * np.arcsin(np.clip(chord / 2, 0, 1))
        names = eligible.name.iloc[idx].tolist()
    if populated.empty:
        return nearest_km, np.zeros(len(lat), dtype=np.int64), names
    pop_tree = cKDTree(xyz(populated.lat.to_numpy(), populated.lon.to_numpy()))
    cells = xyz(lat, lon)
    radius = 2 * np.sin(10 / (2 * EARTH_KM))
    pop = populated["pop"].to_numpy(dtype=np.int64)
    sums = np.fromiter((int(pop[neighbors].sum()) for neighbors in pop_tree.query_ball_point(cells, radius)),
                       dtype=np.int64, count=len(cells))
    return nearest_km, sums, names


def cell_frames(cells: list[str], adm1: list[dict], adm2: list[dict],
                places: pd.DataFrame, protected: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    coords = np.array([h3.cell_to_latlng(c) for c in cells])
    lat, lon = coords[:, 0], coords[:, 1]
    points = np.array([Point(x, y) for x, y in zip(lon, lat)], dtype=object)
    adm1_codes = point_codes(points, adm1)
    adm2_codes = point_codes(points, adm2)
    adm_cells = pd.DataFrame([{"level": level, "code": code, "h3_r6": cell}
                             for level, codes in (("adm1", adm1_codes), ("adm2", adm2_codes))
                             for cell, code in zip(cells, codes) if code is not None])
    protected_geoms = [from_wkb(wkb) for wkb in protected.geometry_wkb]
    hits = STRtree(protected_geoms).query(points, predicate="intersects") if protected_geoms else np.empty((2, 0), dtype=int)
    in_protected = np.zeros(len(cells), dtype=bool)
    in_protected[hits[0]] = True
    distances, populations, names = locality_metrics(lat, lon, places)
    cell_geo = pd.DataFrame({"h3_r6": cells, "adm1_code": adm1_codes,
                             "adm2_code": adm2_codes, "dist_locality_km": distances,
                             "pop_10km": populations, "in_protected_area": in_protected,
                             "nearest_locality_name": names})
    return adm_cells, cell_geo


def build(raw: Path, processed: Path, interim: Path, force: bool = False) -> dict[str, int]:
    out = processed / "geo" / "Argentina"
    out.mkdir(parents=True, exist_ok=True)
    pending = [name for name in OUTPUTS if force or not (out / f"{name}.parquet").exists()]
    if not pending:
        return {}
    scratch = interim / "geo_argentina_tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(config={"memory_limit": "1GB", "temp_directory": str(scratch / "duckdb")})
    try:
        adm1 = read_admin(raw / "geoBoundaries-ARG-ADM1-all.zip", "adm1")
        adm2 = read_admin(raw / "geoBoundaries-ARG-ADM2-all.zip", "adm2")
        parent_codes(adm1, adm2)
        places = read_localities(raw / "AR.zip", adm1)
        protected = read_protected(raw / "WDPA_WDOECM_Nov2026_Public_ARG_shp.zip", scratch)
        cell_path = processed / "cell_class" / "Argentina.parquet"
        cells = con.execute("SELECT DISTINCT h3_r6 FROM read_parquet(?) ORDER BY h3_r6", [str(cell_path)]).df().h3_r6.tolist()
        adm_cells, cell_geo = cell_frames(cells, adm1, adm2, places, protected)
        frames = {"admin_units": unit_frame(adm1, adm2), "admin_cells": adm_cells,
                  "localities": places, "protected_areas": protected, "cell_geo": cell_geo}
        for name in pending:
            frame = frames[name]
            con.register("output_frame", frame)
            destination = out / f"{name}.parquet"
            temp = out / f".{name}.parquet.tmp"
            con.execute("COPY output_frame TO ? (FORMAT PARQUET)", [str(temp)])
            temp.replace(destination)
            con.unregister("output_frame")
        return {name: len(frame) for name, frame in frames.items()}
    finally:
        con.close()
        shutil.rmtree(scratch)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    parser.add_argument("--interim", type=Path, default=Path("data/interim"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    print(build(args.raw, args.processed, args.interim, args.force))


if __name__ == "__main__":
    main()
