"""Assign H3 cells to cleaned hotspots and build the raw (unharmonized) cell_month table.

Reads  data/interim/hotspots/<Country>/year=YYYY/part-0.parquet
Writes data/processed/hotspots/<Country>/year=YYYY/part-0.parquet  (with h3_r6, h3_r7)
       data/processed/cell_month/<Country>/year=YYYY/part-0.parquet (raw counts only)
Harmonized columns stay NULL until the harmonization step fills them.
"""
from __future__ import annotations

import argparse
import json
import os
from multiprocessing import Pool
from pathlib import Path

import duckdb
import h3

from .ingest import COUNTRIES, parse_years


def q(path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def _h3_chunk(points):
    return [(la, lo, h3.latlng_to_cell(la, lo, 6), h3.latlng_to_cell(la, lo, 7)) for la, lo in points]


def compute_cells(pairs, workers: int = 0):
    """H3 r6/r7 for unique points, split across processes (h3-py has no vectorised lat/lng API)."""
    workers = workers or min(os.cpu_count() or 1, 8)
    if len(pairs) < 200_000 or workers == 1:
        return _h3_chunk(pairs)
    size = -(-len(pairs) // (workers * 4))
    with Pool(workers) as pool:
        return [row for part in pool.map(_h3_chunk, [pairs[i:i + size] for i in range(0, len(pairs), size)]) for row in part]


def process_year(con, src: Path, hot_out: Path, cm_out: Path) -> dict:
    con.execute(f"CREATE OR REPLACE TEMP VIEW h AS SELECT * FROM read_parquet({q(src)})")
    pairs = con.execute("SELECT DISTINCT lat, lon FROM h").fetchall()
    import pandas as pd
    cells_df = pd.DataFrame(compute_cells(pairs), columns=["lat", "lon", "c6", "c7"])
    con.register("cells_df", cells_df)
    con.execute("CREATE OR REPLACE TEMP TABLE cells AS SELECT * FROM cells_df")
    con.unregister("cells_df")
    for out in (hot_out, cm_out):
        out.parent.mkdir(parents=True, exist_ok=True)
    tmp_h, tmp_c = hot_out.with_suffix(".tmp.parquet"), cm_out.with_suffix(".tmp.parquet")
    con.execute(f"""COPY (
        SELECT h.id, h.ts_utc, h.date_local, h.lat, h.lon, c.c6 AS h3_r6, c.c7 AS h3_r7, h.sensor, h.platform,
               h.confidence_h, h.frp_mw, h.daynight, h.burn_type, h.event_id, h.harm_weight, h.source
        FROM h JOIN cells c USING (lat, lon)) TO {q(tmp_h)} (FORMAT PARQUET, COMPRESSION ZSTD)""")
    tmp_h.replace(hot_out)
    con.execute(f"""COPY (
        SELECT c.c6 AS h3_r6, year(h.date_local)::INTEGER AS year, month(h.date_local)::TINYINT AS month,
               count(*) FILTER (WHERE h.sensor = 'MODIS')::INTEGER AS count_raw_modis,
               count(*) FILTER (WHERE h.sensor = 'VIIRS')::INTEGER AS count_raw_viirs,
               NULL::DOUBLE AS count_harm, NULL::DOUBLE AS count_harm_lo, NULL::DOUBLE AS count_harm_hi,
               NULL::DOUBLE AS frp_harm, NULL::DOUBLE AS clear_frac, NULL::BOOLEAN AS is_estimated,
               NULL::DOUBLE AS count_agricola, NULL::DOUBLE AS count_forestal,
               sum(h.frp_mw) FILTER (WHERE h.sensor = 'MODIS') AS frp_raw_modis,
               sum(h.frp_mw) FILTER (WHERE h.sensor = 'VIIRS') AS frp_raw_viirs
        FROM h JOIN cells c USING (lat, lon)
        WHERE h.date_local IS NOT NULL
        GROUP BY 1, 2, 3) TO {q(tmp_c)} (FORMAT PARQUET, COMPRESSION ZSTD)""")
    tmp_c.replace(cm_out)
    n = con.execute("SELECT count(*) FROM h").fetchone()[0]
    ncell = con.execute(f"SELECT count(*) FROM read_parquet({q(cm_out)})").fetchone()[0]
    return {"hotspots": n, "unique_points": len(pairs), "cell_month_rows": ncell}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--country", required=True)
    p.add_argument("--years", required=True, type=parse_years)
    p.add_argument("--interim", type=Path, default=Path(os.getenv("FIRELY_DATA_INTERIM", "data/interim")))
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    p.add_argument("--force", action="store_true")
    a = p.parse_args()
    con, report = duckdb.connect(), {}
    for y in a.years:
        src = a.interim / "hotspots" / a.country / f"year={y}" / "part-0.parquet"
        hot = a.processed / "hotspots" / a.country / f"year={y}" / "part-0.parquet"
        cm = a.processed / "cell_month" / a.country / f"year={y}" / "part-0.parquet"
        if not src.exists():
            report[y] = "missing interim input"
        elif hot.exists() and cm.exists() and not a.force:
            report[y] = "skipped"
        else:
            report[y] = process_year(con, src, hot, cm)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
