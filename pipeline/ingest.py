"""Stream FIRMS ZIP members into yearly, country-specific hotspot Parquet.

The ZIP files are read only. A temporary CSV spool under the interim directory
lets DuckDB process one country and year at a time without holding the archive
or the resulting table in Python memory.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from zipfile import ZipFile

import duckdb
from tzfpy import get_tz


COUNTRIES = {"Mexico", "Argentina"}  # countries with extra request sources (NOAA-21, 2026); any FIRMS country works with annual summaries
ANNUAL = {"modis": "MODIS", "viirs-snpp": "SNPP", "viirs-jpss1": "NOAA20"}
REQUEST = {"M-C61": "MODIS", "SV-C2": "SNPP", "J1V-C2": "NOAA20", "J2V-C2": "NOAA21"}
# FIRMS download IDs have no country in the filename. These were checked against
# the actual archive samples. The 8468xx requests are 2026 country/world pairs.
REQUEST_COUNTRY = {
    "847107": "Mexico", "847108": "Mexico",
    "847109": "Argentina", "847110": "Argentina",
    "846859": "Mexico", "846860": "Mexico", "846861": "Mexico", "846862": "Mexico",
    "846864": "world", "846865": "world", "846866": "world", "846867": "world",
}
HOTSPOT_COLS = (
    "id", "ts_utc", "date_local", "lat", "lon", "h3_r6", "h3_r7",
    "sensor", "platform", "confidence_h", "frp_mw", "daynight",
    "burn_type", "event_id", "harm_weight", "source",
)


def parse_years(value: str) -> list[int]:
    years = set()
    for part in value.split(","):
        match = re.fullmatch(r"\s*(\d{4})(?:-(\d{4}))?\s*", part)
        if not match:
            raise argparse.ArgumentTypeError(f"Invalid years: {value}")
        start, end = int(match[1]), int(match[2] or match[1])
        if start > end:
            raise argparse.ArgumentTypeError(f"Reversed year range: {part}")
        years.update(range(start, end + 1))
    return sorted(years)


def annual_sources(raw: Path, country: str, years: set[int]):
    for path in sorted(raw.rglob("*_all_countries.zip")):
        match = re.fullmatch(r"(modis|viirs-snpp|viirs-jpss1)_(\d{4})_all_countries\.zip", path.name)
        if not match or int(match[2]) not in years:
            continue
        with ZipFile(path) as archive:
            target = next((name for name in archive.namelist() if name.endswith(f"_{country}.csv")), None)
        if target:
            yield path, target, ANNUAL[match[1]], country, 0


def request_sources(raw: Path, country: str, years: set[int]):
    for path in sorted(raw.rglob("DL_FIRE_*.zip")):
        match = re.fullmatch(r"DL_FIRE_(M-C61|SV-C2|J1V-C2|J2V-C2)_(\d+)\.zip", path.name)
        if not match:
            continue
        assigned = REQUEST_COUNTRY.get(match[2])
        # World-wide 2026 requests are clipped to the country polygon (see country_geometry).
        if assigned != country and not (assigned == "world" and country == "Argentina"):
            continue
        if match[2].startswith("846") and 2026 not in years:
            continue
        with ZipFile(path) as archive:
            target = next((name for name in archive.namelist() if name.startswith("fire_archive_") and name.endswith(".csv")), None)
        if target:
            yield path, target, REQUEST[match[1]], assigned, 1


def country_geometry(raw: Path, country: str):
    """Prepared polygon (and bbox) of a country from geoBoundaries ADM1, used to clip world requests."""
    import json
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely.prepared import prep

    zips = sorted(raw.rglob("geoBoundaries-ARG-ADM1-all.zip"))
    if country != "Argentina" or not zips:
        raise FileNotFoundError("geoBoundaries ARG ADM1 zip not found; cannot clip world requests")
    with ZipFile(zips[0]) as archive:
        data = json.loads(archive.read("geoBoundaries-ARG-ADM1.geojson"))
    geom = unary_union([shape(f["geometry"]) for f in data["features"]])
    return prep(geom), geom.bounds


def spool_sources(raw: Path, country: str, years: set[int], staging: Path):
    """Stream selected ZIP members to year-specific CSVs; return paths and issues."""
    files = defaultdict(list)
    issues = []
    sources = list(annual_sources(raw, country, years)) + list(request_sources(raw, country, years))
    clip = country_geometry(raw, country) if any(src[3] == "world" for src in sources) else None
    for index, (path, member, expected, assigned, priority) in enumerate(sources):
        if path.name.startswith("DL_FIRE_") and 2026 in years:
            with ZipFile(path) as archive:
                for nrt in (name for name in archive.namelist() if name.startswith("fire_nrt_") and name.endswith(".csv")):
                    with archive.open(nrt) as nrt_stream:
                        header = nrt_stream.readline().decode("utf-8-sig").strip().split(",")
                    if "type" not in header:
                        issues.append(f"{path.name}/{nrt}: no type column; NRT excluded")
        handles = {}
        writers = {}
        try:
            with ZipFile(path) as archive, archive.open(member) as stream:
                # FIRMS CSV headers and values in these archives are ASCII/UTF-8.
                import io
                reader = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
                fields = reader.fieldnames or []
                required = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight"}
                if not required.issubset(fields):
                    issues.append(f"{path.name}/{member}: missing {sorted(required - set(fields))}; skipped")
                    continue
                has_type = "type" in fields
                if not has_type:
                    issues.append(f"{path.name}/{member}: no type column")
                    fields = fields + ["type"]
                for row in reader:
                    date = row.get("acq_date", "")
                    if len(date) < 4 or not date[:4].isdigit():
                        continue
                    year = int(date[:4])
                    if year not in years:
                        continue
                    if assigned == "world":
                        try:
                            lat, lon = float(row["latitude"]), float(row["longitude"])
                        except ValueError:
                            continue
                        west, south, east, north = clip[1]
                        if not (west <= lon <= east and south <= lat <= north):
                            continue
                        from shapely.geometry import Point
                        if not clip[0].contains(Point(lon, lat)):
                            continue
                    if year not in writers:
                        dest = staging / f"source-{index:03d}-{year}.csv"
                        handle = dest.open("w", encoding="utf-8", newline="")
                        writer = csv.DictWriter(handle, fieldnames=fields + ["_expected", "_priority", "_source_name", "_has_type"])
                        writer.writeheader()
                        handles[year], writers[year] = handle, writer
                        files[year].append(dest)
                    row.update(_expected=expected, _priority=priority, _source_name=path.name, _has_type=int(has_type))
                    writers[year].writerow(row)
        finally:
            for handle in handles.values():
                handle.close()
    if 2026 in years and country == "Argentina":
        issues.append("2026 Argentina: clipped from world requests with the geoBoundaries ADM1 polygon (SP archive only; NRT excluded)")
    return files, issues


def local_date(ts: datetime | None, lon: float | None, lat: float | None):
    if ts is None or lon is None or lat is None:
        return None
    zone = get_tz(lon, lat)
    if not zone:
        return None
    return ts.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(zone)).date()


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def process_year(connection, inputs: list[Path], dest: Path, low_dest: Path, minimum: int):
    paths = "[" + ", ".join(sql_string(str(p)) for p in inputs) + "]"
    connection.execute(f"CREATE OR REPLACE TEMP VIEW raw_csv AS SELECT * FROM read_csv({paths}, all_varchar=true, union_by_name=true)")
    connection.execute("""
        CREATE OR REPLACE TEMP VIEW parsed AS
        SELECT *, try_cast(latitude AS DOUBLE) AS lat_v,
            try_cast(longitude AS DOUBLE) AS lon_v,
            try_cast(frp AS DOUBLE) AS frp_v,
            try_cast(confidence AS DOUBLE) AS confidence_v,
            try_strptime(acq_date || lpad(acq_time, 4, '0'), '%Y-%m-%d%H%M') AS ts_v,
            CASE WHEN lower(satellite) IN ('t','terra') THEN 'Terra'
                 WHEN lower(satellite) IN ('a','aqua') THEN 'Aqua'
                 WHEN upper(satellite) IN ('N','SNPP') THEN 'SNPP'
                 WHEN upper(satellite) IN ('N20','J1') THEN 'NOAA20'
                 WHEN upper(satellite) IN ('N21','J2') THEN 'NOAA21' END AS platform_v
        FROM raw_csv
    """)
    # The type filter is applied whenever present. Missing type is reported by
    # spool_sources; source remains SP because only archive members are ingested.
    connection.execute(f"""
        CREATE OR REPLACE TEMP VIEW eligible AS
        SELECT *, CASE WHEN platform_v IN ('Terra','Aqua') THEN 'MODIS' ELSE 'VIIRS' END AS sensor_v,
            CASE WHEN platform_v IN ('Terra','Aqua') THEN
                CASE WHEN confidence_v IS NULL THEN NULL WHEN confidence_v < {minimum} THEN 'baja' WHEN confidence_v >= 80 THEN 'alta' ELSE 'nominal' END
            ELSE CASE lower(confidence) WHEN 'l' THEN 'baja' WHEN 'n' THEN 'nominal' WHEN 'h' THEN 'alta' END END AS confidence_h_v
        FROM parsed
        WHERE (_has_type = '0' OR try_cast(type AS INTEGER) = 0)
          AND lat_v BETWEEN -90 AND 90 AND lon_v BETWEEN -180 AND 180
          AND ts_v IS NOT NULL AND platform_v IS NOT NULL
          AND ((_expected = 'MODIS' AND platform_v IN ('Terra','Aqua')) OR _expected = platform_v)
    """)
    counts_before = connection.execute("SELECT platform_v, count(*) FROM parsed GROUP BY 1 ORDER BY 1").fetchall()
    before_sensor = connection.execute("SELECT CASE WHEN platform_v IN ('Terra','Aqua') THEN 'MODIS' ELSE 'VIIRS' END, count(*) FROM parsed WHERE platform_v IS NOT NULL GROUP BY 1 ORDER BY 1").fetchall()
    counts_eligible = connection.execute("SELECT platform_v, count(*) FROM eligible GROUP BY 1 ORDER BY 1").fetchall()
    connection.execute("""
        CREATE OR REPLACE TEMP VIEW deduped AS
        SELECT * EXCLUDE (rn) FROM (
            SELECT *, row_number() OVER (
                PARTITION BY platform_v, ts_v, lat_v, lon_v
                ORDER BY try_cast(_priority AS INTEGER), _source_name
            ) AS rn FROM eligible
        ) WHERE rn = 1
    """)
    connection.execute("""
        CREATE OR REPLACE TEMP VIEW hotspots_out AS
        SELECT md5(platform_v || '|' || cast(ts_v AS VARCHAR) || '|' || cast(lat_v AS VARCHAR) || '|' || cast(lon_v AS VARCHAR)) AS id,
            ts_v AS ts_utc, local_date(ts_v, lon_v, lat_v) AS date_local,
            lat_v AS lat, lon_v AS lon, NULL::VARCHAR AS h3_r6, NULL::VARCHAR AS h3_r7,
            sensor_v AS sensor, platform_v AS platform, confidence_h_v AS confidence_h,
            frp_v AS frp_mw, daynight, NULL::VARCHAR AS burn_type,
            NULL::VARCHAR AS event_id, NULL::DOUBLE AS harm_weight, 'SP' AS source
        FROM deduped WHERE confidence_h_v IS NOT NULL
    """)
    cols = ", ".join(HOTSPOT_COLS)
    for output, predicate in ((dest, "confidence_h <> 'baja'"), (low_dest, "confidence_h = 'baja'")):
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(".tmp.parquet")
        connection.execute(f"COPY (SELECT {cols} FROM hotspots_out WHERE {predicate}) TO {sql_string(str(temporary))} (FORMAT PARQUET, COMPRESSION ZSTD)")
        temporary.replace(output)
    counts_after = connection.execute("SELECT platform, count(*) FROM hotspots_out WHERE confidence_h <> 'baja' GROUP BY 1 ORDER BY 1").fetchall()
    after_sensor = connection.execute("SELECT sensor, count(*) FROM hotspots_out WHERE confidence_h <> 'baja' GROUP BY 1 ORDER BY 1").fetchall()
    counts_low = connection.execute("SELECT platform, count(*) FROM hotspots_out WHERE confidence_h = 'baja' GROUP BY 1 ORDER BY 1").fetchall()
    return counts_before, before_sensor, counts_eligible, counts_after, after_sensor, counts_low


def ingest(raw: Path, interim: Path, country: str, years: list[int], minimum: int = 30, force: bool = False):
    if not re.fullmatch(r"[A-Za-z_]+", country):
        raise ValueError(f"invalid country name: {country!r} (use the FIRMS spelling, e.g. Chile, Trinidad_and_Tobago)")
    if not raw.is_dir():
        raise FileNotFoundError(f"FIRMS raw directory does not exist: {raw}")
    pending = [year for year in years if force or not (
        (interim / "hotspots" / country / f"year={year}" / "part-0.parquet").exists()
        and (interim / "hotspots_low_confidence" / country / f"year={year}" / "part-0.parquet").exists()
    )]
    if not pending:
        return {"country": country, "years": {}, "issues": [], "skipped": years}
    interim.mkdir(parents=True, exist_ok=True)
    report = {"country": country, "years": {}, "issues": [], "skipped": sorted(set(years) - set(pending))}
    with tempfile.TemporaryDirectory(prefix="firely-ingest-", dir=interim) as temp:
        files, issues = spool_sources(raw, country, set(pending), Path(temp))
        report["issues"].extend(issues)
        con = duckdb.connect()
        con.create_function("local_date", local_date, ["TIMESTAMP", "DOUBLE", "DOUBLE"], "DATE", null_handling="special")
        try:
            for year in pending:
                if not files.get(year):
                    report["issues"].append(f"{year}: no matching archive rows")
                    continue
                dest = interim / "hotspots" / country / f"year={year}" / "part-0.parquet"
                low = interim / "hotspots_low_confidence" / country / f"year={year}" / "part-0.parquet"
                before, before_sensor, eligible, after, after_sensor, low_counts = process_year(con, files[year], dest, low, minimum)
                report["years"][str(year)] = {
                    "before": dict(before), "before_sensor": dict(before_sensor),
                    "after_type_and_parse": dict(eligible), "after": dict(after),
                    "after_sensor": dict(after_sensor), "low_confidence": dict(low_counts),
                }
                for path in files[year]:
                    path.unlink()
        finally:
            con.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--country", required=True, help="FIRMS country name, e.g. Mexico, Chile, Trinidad_and_Tobago")
    parser.add_argument("--years", required=True, type=parse_years)
    parser.add_argument("--raw", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--interim", type=Path, default=Path(os.getenv("FIRELY_DATA_INTERIM", "data/interim")))
    parser.add_argument("--modis-min-confidence", type=int, default=30)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not 0 <= args.modis_min_confidence <= 100:
        parser.error("--modis-min-confidence must be between 0 and 100")
    print(json.dumps(ingest(args.raw, args.interim, args.country, args.years, args.modis_min_confidence, args.force), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
