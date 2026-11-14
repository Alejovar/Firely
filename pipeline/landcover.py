"""Assign each H3 r6 cell its dominant IGBP land cover (MCD12Q1 v061, LC_Type1) and a 5-class biome.

Biome groups (docs section 5.4): 1 forest (IGBP 1-5), 2 shrub (6-7), 3 grass/savanna (8-10),
4 crop (12, 14), 5 other (11, 13, 15, 16, 17). 0 = unknown (no valid pixel).
Sampling: 13 points per cell (centre + 2 rings toward the vertices), mode of the valid pixels.

Reads  data/external/landcover/<country>/LC_Type1_<year>.tif and the distinct cells of data/processed/hotspots/<Country>
Writes data/processed/cell_biome/<Country>.parquet (h3_r6, igbp, biome)
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import duckdb
import h3
import numpy as np
import rasterio

GROUPS = {**{k: 1 for k in (1, 2, 3, 4, 5)}, 6: 2, 7: 2, 8: 3, 9: 3, 10: 3, 12: 4, 14: 4,
          11: 5, 13: 5, 15: 5, 16: 5, 17: 5}
NAMES = {0: "desconocido", 1: "bosque", 2: "matorral", 3: "pastizal/sabana", 4: "cultivo", 5: "otros"}


def sample_points(cell: str):
    lat0, lon0 = h3.cell_to_latlng(cell)
    pts = [(lat0, lon0)]
    for lat, lon in h3.cell_to_boundary(cell):
        for f in (0.45, 0.9):
            pts.append((lat0 + f * (lat - lat0), lon0 + f * (lon - lon0)))
    return pts


def biome_by_cell(cells, raster: Path):
    with rasterio.open(raster) as src:
        arr, tr = src.read(1), src.transform
    h, w = arr.shape
    pts = np.array([sample_points(c) for c in cells])              # (n, 13, 2)
    cols = np.floor((pts[..., 1] - tr.c) / tr.a).astype(int)
    rows = np.floor((pts[..., 0] - tr.f) / tr.e).astype(int)
    ok = (rows >= 0) & (rows < h) & (cols >= 0) & (cols < w)
    vals = np.where(ok, arr[np.clip(rows, 0, h - 1), np.clip(cols, 0, w - 1)], 255)
    out = []
    for v in vals:
        v = v[(v != 255) & (v > 0)]
        out.append(int(np.bincount(v).argmax()) if len(v) else 0)
    igbp = np.array(out)
    biome = np.array([GROUPS.get(i, 0) for i in igbp])
    return igbp, biome


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--country", required=True)
    p.add_argument("--year", type=int, default=2020)
    p.add_argument("--external", type=Path, default=Path(os.getenv("FIRELY_DATA_EXTERNAL", "data/external")))
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    a = p.parse_args()
    raster = a.external / "landcover" / a.country.lower() / f"LC_Type1_{a.year}.tif"
    hot = a.processed / "hotspots" / a.country / "year=*" / "part-0.parquet"
    cells = [r[0] for r in duckdb.connect().execute(
        f"SELECT DISTINCT h3_r6 FROM read_parquet('{hot}') ORDER BY 1").fetchall()]
    igbp, biome = biome_by_cell(cells, raster)
    out = a.processed / "cell_biome"
    out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("CREATE TABLE t(h3_r6 VARCHAR, igbp INTEGER, biome INTEGER)")
    con.executemany("INSERT INTO t VALUES (?, ?, ?)", list(zip(cells, igbp.tolist(), biome.tolist())))
    con.execute(f"COPY t TO '{out / (a.country + '.parquet')}' (FORMAT PARQUET)")
    share = {NAMES[k]: round(float(v) * 100, 1) for k, v in zip(*np.unique(biome, return_counts=True), strict=True)
             for v in [v / len(biome)]}
    print(a.country, len(cells), "cells", share)


if __name__ == "__main__":
    main()
