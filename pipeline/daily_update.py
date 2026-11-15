"""Daily NRT ingestion and source-labelled derived tables, separate from scientific SP.

Run after SP archive updates too: NRT dates covered by a country's latest SP
hotspot are excluded from all derived NRT outputs. The SP harmonized history is
never overwritten by a provisional NRT estimate.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import duckdb

from . import nrt
from .events import build_events
from .tables_common import connect, copy_atomic, q


def _sp_cutoff(con, processed: Path, country: str):
    paths = sorted((processed / "hotspots" / country).glob("year=*/*.parquet"))
    return con.execute("SELECT max(date_local) FROM read_parquet(?)",[[str(p) for p in paths[-1:]]]).fetchone()[0] if paths else None


def materialize(processed: Path, country: str) -> dict:
    raw = processed / "nrt" / country
    files = sorted(raw.glob("date=*/*.parquet"))
    if not files:
        return {"country":country,"rows":0}
    con = connect(processed=processed)
    try:
        cutoff = _sp_cutoff(con,processed,country)
        con.execute("CREATE TEMP TABLE live AS SELECT * FROM read_parquet(?,hive_partitioning=false) WHERE date_utc > ?",[[str(f) for f in files],cutoff or "1900-01-01"])
        n = con.execute("SELECT count(*) FROM live").fetchone()[0]
        years = [r[0] for r in con.execute("SELECT DISTINCT year(date_utc) FROM live ORDER BY 1").fetchall()]
        # A newly published SP archive can remove every provisional row. Drop
        # only generated NRT derivatives; the raw NRT audit log is retained.
        for table in ("cell_day_nrt","cell_month_nrt","events_nrt"):
            for old in (processed / table / country).glob("year=*/*.parquet"):
                if int(old.parent.name[5:]) not in years:
                    old.unlink()
        if not n:
            return {"country":country,"rows":0,"sp_cutoff":str(cutoff)}
        for year in years:
            day = processed / "cell_day_nrt" / country / f"year={year}" / "part.parquet"
            month = processed / "cell_month_nrt" / country / f"year={year}" / "part.parquet"
            # NRT has no independently validated cross-sensor calibration. Prefer
            # S-NPP where present; otherwise NOAA20/NOAA21, then MODIS. Preserve
            # raw counts and identify every estimate as NRT in the source field.
            day_sql = f"""WITH d AS (
              SELECT h3_r6,date_utc AS date,month(date_utc) AS month,
                count(*) FILTER (WHERE platform IN ('Aqua','Terra','MODIS'))::INTEGER AS count_raw_modis,
                count(*) FILTER (WHERE platform NOT IN ('Aqua','Terra','MODIS'))::INTEGER AS count_raw_viirs,
                count(*) FILTER (WHERE platform='SNPP') AS snpp,
                count(*) FILTER (WHERE platform='NOAA20') AS noaa20,
                count(*) FILTER (WHERE platform='NOAA21') AS noaa21,
                count(*) FILTER (WHERE platform IN ('Aqua','Terra','MODIS')) AS modis,
                sum(frp_mw) AS frp_harm
              FROM live WHERE year(date_utc)={year} GROUP BY 1,2,3
            ) SELECT h3_r6,date,count_raw_modis,count_raw_viirs,
                (CASE WHEN snpp>0 THEN snpp WHEN noaa20>0 THEN noaa20 WHEN noaa21>0 THEN noaa21 ELSE modis END)::DOUBLE AS count_harm,
                NULL::DOUBLE AS count_harm_lo,NULL::DOUBLE AS count_harm_hi,
                frp_harm,NULL::DOUBLE AS clear_frac,FALSE AS is_estimated,
                NULL::DOUBLE AS count_agricola,NULL::DOUBLE AS count_forestal,
                'NRT'::VARCHAR AS source
              FROM d ORDER BY h3_r6,date"""
            copy_atomic(con,day_sql,day)
            month_sql = f"""SELECT h3_r6,month(date)::TINYINT AS month,
              sum(count_raw_modis)::INTEGER AS count_raw_modis,sum(count_raw_viirs)::INTEGER AS count_raw_viirs,
              sum(count_harm) AS count_harm,NULL::DOUBLE AS count_harm_lo,NULL::DOUBLE AS count_harm_hi,
              sum(frp_harm) AS frp_harm,NULL::DOUBLE AS clear_frac,FALSE AS is_estimated,
              NULL::DOUBLE AS count_agricola,NULL::DOUBLE AS count_forestal,'NRT'::VARCHAR AS source
              FROM read_parquet({q(day)}) GROUP BY 1,2 ORDER BY 1,2"""
            copy_atomic(con,month_sql,month)
            df = con.execute("""SELECT lat,lon,date_utc AS date_local,platform,h3_r6,daynight,frp_mw,
               NULL::VARCHAR AS burn_type FROM live
               WHERE year(date_utc)=? AND platform NOT IN ('Aqua','Terra','MODIS')
               QUALIFY row_number() OVER (PARTITION BY platform,date_utc,lat,lon ORDER BY ingested_at)=1""",[year]).fetchdf()
            ev = build_events(df,"VIIRS",year,country,1.5,3)
            if len(ev):
                con.register("ev_df",ev)
                out = processed / "events_nrt" / country / f"year={year}" / "part.parquet"
                copy_atomic(con,"SELECT *, 'NRT'::VARCHAR AS source FROM ev_df",out)
                con.unregister("ev_df")
            else:
                out = processed / "events_nrt" / country / f"year={year}" / "part.parquet"
                if out.exists():
                    out.unlink()
        return {"country":country,"rows":n,"sp_cutoff":str(cutoff),"years":years}
    finally:
        con.close()


def main() -> int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--processed",type=Path,default=Path(os.environ.get("FIRELY_DATA_PROCESSED","data/processed")))
    p.add_argument("--country",action="append",choices=sorted(nrt.JOB_COUNTRIES))
    p.add_argument("--hours",type=int,choices=(24,48),default=48)
    a=p.parse_args()
    if not nrt.map_key():
        print("FIRMS_MAP_KEY missing; no NRT ingestion performed")
        return 2
    selected=tuple(a.country or nrt.JOB_COUNTRIES)
    ingested=nrt.ingest(out=a.processed/"nrt",processed=a.processed,countries=selected,hours=a.hours)
    derived=[materialize(a.processed,c) for c in selected]
    print(json.dumps({"ingest":ingested,"derived":derived},ensure_ascii=False))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
