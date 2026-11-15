"""Recent observed S-NPP months that the harmonized table does not have yet (provisional, for the outlook).

The harmonized series is in S-NPP units, so an observed S-NPP month IS its harmonized value (methodology v1.2).
The SP archive used by the harmonization stops at 2026-07 (Mexico, Argentina) or 2025-12 (the other countries);
the 2026 FIRMS requests in data/raw carry S-NPP up to its end of mission (2026-11-02):

* fire_archive_SV-C2_*.csv  2026-01..2026-07, with `type`: keep type == 0 (vegetation), as pipeline.ingest;
* fire_nrt_SV-C2_*.csv      2026-08..2026-11-02, no `type`: drop H3 r7 cells of the static-source mask
                            (data/processed/static_sources/<Country>.parquet, pipeline.static_sources).
Low confidence ('l') is dropped as in the scientific table. Points are assigned to a country by their H3 r6 cell
being in that country's harmonized cell set (cells that never had a detection 2001-2026 are not listed there).
Months use the UTC acquisition date (the scientific table uses the local date: a few detections near midnight
of the last day of a month may fall in the neighbour month).

Writes data/processed/cell_month_recent/<Country>/year=2026/part.parquet
       h3_r6, month, count_harm, frp_harm, is_estimated (false), source ('SP' archive | 'NRT')
       dense (zeros explicit) for every complete month after the country's last observed harmonized month,
       up to LAST_MONTH. NOT part of the scientific harmonized table: only pipeline.forecast_features reads it.

    python -m pipeline.snpp_recent [--country ...] [--force]
"""
from __future__ import annotations

import csv
import io
import os
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

import duckdb
import h3

from .tables_common import connect, copy_atomic, countries, harmonized_glob, parser, q

LAST_MONTH = (2026, 10)  # last complete S-NPP month (mission ended 2026-11-02)
REQUESTS = {"Mexico": "DL_FIRE_SV-C2_846862.zip"}  # Mexico request; every other country is clipped from the world one
WORLD = "DL_FIRE_SV-C2_846867.zip"


def raw_default() -> Path:
    return Path(os.environ.get("FIRELY_DATA_RAW", "data/raw"))


def last_observed(con, processed, country) -> tuple[int, int]:
    ym = con.execute(f"""SELECT max(year * 100 + month) FROM read_parquet({q(harmonized_glob(processed, country))},
                         hive_partitioning=true) WHERE NOT is_estimated""").fetchone()[0]
    return ym // 100, ym % 100


def scan(zip_path: Path, wanted: dict, masks: dict, cells: dict) -> tuple[dict, dict]:
    """Count S-NPP detections per (country, h3_r6, year, month) inside the wanted months of each country."""
    counts, frp = defaultdict(int), defaultdict(float)
    lat0 = min(b[1] for b in (bbox_of(cells[c]) for c in wanted)) - 0.5
    lat1 = max(b[3] for b in (bbox_of(cells[c]) for c in wanted)) + 0.5
    lon0 = min(b[0] for b in (bbox_of(cells[c]) for c in wanted)) - 0.5
    lon1 = max(b[2] for b in (bbox_of(cells[c]) for c in wanted)) + 0.5
    owner = defaultdict(list)
    for c in wanted:
        for cell in cells[c]:
            owner[cell].append(c)
    first = min(min(v) for v in wanted.values())
    with ZipFile(zip_path) as archive:
        for member in archive.namelist():
            if not member.endswith(".csv"):
                continue
            nrt = member.startswith("fire_nrt_")
            with archive.open(member) as stream:
                reader = csv.reader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
                head = next(reader)
                ix = {k: head.index(k) for k in ("latitude", "longitude", "acq_date", "confidence", "frp")}
                it = head.index("type") if "type" in head else None
                if it is None and not nrt:
                    raise ValueError(f"{member}: archive member without type")
                for row in reader:
                    d = row[ix["acq_date"]]
                    ym = (int(d[:4]), int(d[5:7]))
                    if ym < first or ym > LAST_MONTH or row[ix["confidence"]].lower() == "l":
                        continue
                    if it is not None and row[it] != "0":
                        continue
                    lat, lon = float(row[ix["latitude"]]), float(row[ix["longitude"]])
                    if not (lat0 <= lat <= lat1 and lon0 <= lon <= lon1):
                        continue
                    r6 = h3.latlng_to_cell(lat, lon, 6)
                    for c in owner.get(r6, ()):
                        if ym not in wanted[c]:
                            continue
                        if nrt and h3.latlng_to_cell(lat, lon, 7) in masks[c]:
                            continue
                        key = (c, r6, ym[0], ym[1], "NRT" if nrt else "SP")
                        counts[key] += 1
                        try:
                            frp[key] += float(row[ix["frp"]])
                        except ValueError:
                            pass
    return counts, frp


_bbox_cache: dict = {}


def bbox_of(cell_set) -> tuple[float, float, float, float]:
    key = id(cell_set)
    if key not in _bbox_cache:
        pts = [h3.cell_to_latlng(c) for c in cell_set]
        lats, lons = [p[0] for p in pts], [p[1] for p in pts]
        _bbox_cache[key] = (min(lons), min(lats), max(lons), max(lats))
    return _bbox_cache[key]


def build(processed: Path, raw: Path, country_list: list[str], force: bool, memory_limit: str) -> list[dict]:
    con = connect(memory_limit, processed)
    reports = []
    try:
        todo, cells, masks = {}, {}, {}
        for c in country_list:
            dest = processed / "cell_month_recent" / c / "year=2026" / "part.parquet"
            if dest.is_file() and not force:
                reports.append({"country": c, "skipped": True})
                continue
            y, m = last_observed(con, processed, c)
            months = []
            while (y, m) < LAST_MONTH:
                y, m = (y + 1, 1) if m == 12 else (y, m + 1)
                months.append((y, m))
            if not months:
                continue
            assert all(yy == 2026 for yy, _ in months), "recent months must all be in 2026"
            mask_path = processed / "static_sources" / f"{c}.parquet"
            if not mask_path.is_file():
                raise FileNotFoundError(f"run: python -m pipeline.static_sources --country {c}")
            masks[c] = {r[0] for r in con.execute(f"SELECT DISTINCT h3_r7 FROM read_parquet({q(mask_path)})").fetchall()}
            cells[c] = {r[0] for r in con.execute(
                f"SELECT DISTINCT h3_r6 FROM read_parquet({q(harmonized_glob(processed, c))}, hive_partitioning=true)").fetchall()}
            todo[c] = set(months)
        groups = defaultdict(dict)
        for c, months in todo.items():
            groups[REQUESTS.get(c, WORLD)][c] = months
        for zip_name, wanted in groups.items():
            zips = sorted(raw.rglob(zip_name))
            if not zips:
                raise FileNotFoundError(f"{zip_name} not found under {raw}")
            counts, frp = scan(zips[0], wanted, masks, cells)
            for c, months in wanted.items():
                rows = [(cell, mo, n, frp[(cc, cell, yy, mo, src)], src)
                        for (cc, cell, yy, mo, src), n in counts.items() if cc == c]
                con.execute("CREATE OR REPLACE TEMP TABLE pts (h3_r6 VARCHAR, month INTEGER, n INTEGER, f DOUBLE, src VARCHAR)")
                if rows:
                    con.executemany("INSERT INTO pts VALUES (?, ?, ?, ?, ?)", rows)
                con.execute("CREATE OR REPLACE TEMP TABLE cl (h3_r6 VARCHAR)")
                con.executemany("INSERT INTO cl VALUES (?)", [(x,) for x in sorted(cells[c])])
                ms = sorted(m for _, m in months)
                src_of = {m: ("NRT" if m >= 8 else "SP") for m in ms}
                con.execute("CREATE OR REPLACE TEMP TABLE mo (month INTEGER, src VARCHAR)")
                con.executemany("INSERT INTO mo VALUES (?, ?)", list(src_of.items()))
                dest = processed / "cell_month_recent" / c / "year=2026" / "part.parquet"
                copy_atomic(con, """SELECT cl.h3_r6, mo.month::TINYINT AS month,
                                           coalesce(sum(p.n), 0)::DOUBLE AS count_harm,
                                           coalesce(sum(p.f), 0)::DOUBLE AS frp_harm,
                                           FALSE AS is_estimated, mo.src AS source
                                    FROM cl CROSS JOIN mo LEFT JOIN pts p ON p.h3_r6 = cl.h3_r6 AND p.month = mo.month
                                    GROUP BY ALL ORDER BY 1, 2""", dest)
                tot = con.execute(f"SELECT month, sum(count_harm)::INTEGER FROM read_parquet({q(dest)}) GROUP BY 1 ORDER BY 1").fetchall()
                reports.append({"country": c, "months": [f"2026-{m:02d}" for m in ms], "detections_by_month": dict(tot),
                                "output": str(dest)})
    finally:
        con.close()
    return reports


def validate(processed: Path, raw: Path, country: str = "Argentina", months=range(1, 8)) -> dict:
    """Re-count months that ARE in the official harmonized table (Argentina 2026-01..07 come from the same world
    archive) with this method and compare monthly totals. Writes data/processed/metadata/snpp_recent_validation.json."""
    import json
    con = duckdb.connect()
    glob = harmonized_glob(processed, country)
    cells = {r[0] for r in con.execute(f"SELECT DISTINCT h3_r6 FROM read_parquet({q(glob)}, hive_partitioning=true)").fetchall()}
    mask_path = processed / "static_sources" / f"{country}.parquet"
    mask = {r[0] for r in con.execute(f"SELECT DISTINCT h3_r7 FROM read_parquet({q(mask_path)})").fetchall()}
    counts, _ = scan(sorted(raw.rglob(REQUESTS.get(country, WORLD)))[0], {country: {(2026, m) for m in months}},
                     {country: mask}, {country: cells})
    mine = defaultdict(int)
    for (_, _, _, m, _), n in counts.items():
        mine[m] += n
    official = dict(con.execute(f"""SELECT month, sum(count_harm) FROM read_parquet({q(glob)}, hive_partitioning=true)
                                    WHERE year = 2026 AND month IN (SELECT unnest(?)) GROUP BY 1""", [list(months)]).fetchall())
    rel = {f"2026-{m:02d}": mine[m] / official[m] - 1 for m in months if official.get(m)}
    out = {"country": country, "relative_difference": rel, "min": min(rel.values()), "max": max(rel.values())}
    dest = processed / "metadata" / "snpp_recent_validation.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2))
    return out


def main() -> None:
    p = parser(__doc__)
    p.add_argument("--raw", type=Path, default=raw_default())
    p.add_argument("--validate", action="store_true", help="only re-count Argentina 2026-01..07 against the official table")
    a = p.parse_args()
    if a.validate:
        print(validate(a.processed, a.raw), flush=True)
        return
    for r in build(a.processed, a.raw, a.country or countries(a.processed), a.force, a.memory_limit):
        print(r, flush=True)


if __name__ == "__main__":
    main()
