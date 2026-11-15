"""Build H3 r7 masks of archived non-vegetation FIRMS detections."""

from __future__ import annotations

import argparse
import csv
import io
import os
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

import duckdb
import h3

from pipeline.ingest import annual_sources


def build(raw: Path, processed: Path, country: str, force: bool = False) -> dict:
    # Any FIRMS country works: the mask only reads the annual all-country summaries (which carry `type`).
    dest = processed / "static_sources" / f"{country}.parquet"
    if dest.exists() and not force:
        return {"country": country, "skipped": True}
    if not raw.is_dir():
        raise FileNotFoundError(f"FIRMS raw directory does not exist: {raw}")
    counts: Counter[tuple[str, int]] = Counter()
    years_seen: dict[tuple[str, int], set[int]] = {}
    archives = 0
    for path, member, _platform, _assigned, _priority in annual_sources(raw, country, set(range(2000, 2100))):
        archives += 1
        year = int(path.name.split("_")[1])
        with ZipFile(path) as archive, archive.open(member) as stream:
            reader = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
            required = {"latitude", "longitude", "type"}
            if not required.issubset(reader.fieldnames or []):
                raise ValueError(f"{path.name}/{member}: missing {sorted(required - set(reader.fieldnames or []))}")
            for row in reader:
                try:
                    kind = int(row["type"])
                    if kind not in (1, 2, 3):
                        continue
                    lat, lon = float(row["latitude"]), float(row["longitude"])
                    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        continue
                    key = (h3.latlng_to_cell(lat, lon, 7), kind)
                except (ValueError, TypeError):
                    continue
                counts[key] += 1
                years_seen.setdefault(key, set()).add(year)
    if not archives:
        raise FileNotFoundError(f"No annual FIRMS archives found for {country} under {raw}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_suffix(".tmp.parquet")
    con = duckdb.connect(":memory:")
    try:
        con.execute("SET memory_limit='1GB'")
        con.execute("CREATE TABLE mask (h3_r7 VARCHAR, type INTEGER, n_detections BIGINT, n_years INTEGER)")
        con.executemany("INSERT INTO mask VALUES (?, ?, ?, ?)",
                        [(cell, kind, count, len(years_seen[cell, kind])) for (cell, kind), count in counts.items()])
        con.execute("COPY (SELECT * FROM mask ORDER BY h3_r7, type) TO ? (FORMAT PARQUET, COMPRESSION ZSTD)", [str(temp)])
        temp.replace(dest)
    finally:
        con.close()
    return {"country": country, "archives": archives, "cells": len({cell for cell, _ in counts}),
            "rows": len(counts), "detections": sum(counts.values()), "output": str(dest)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--country", required=True, help="FIRMS country name, e.g. Mexico, Bolivia")
    parser.add_argument("--raw", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    print(build(args.raw, args.processed, args.country, args.force))


if __name__ == "__main__":
    main()
