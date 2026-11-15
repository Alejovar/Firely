"""Materialize the historical cell_day and cell_stats tables from scientific Parquet.

Daily harmonized counts allocate a cell/month's calibrated total in proportion to
observed daily points where any exist. Cells with a modelled monthly count but no
observed date have no daily row; assigning a date would invent an observation.
Therefore the daily table is intentionally not additive to the monthly table for
historical MODIS-only years. It is not a separately calibrated daily sensor model.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from scipy.stats import kendalltau

from .climatology import build as build_climatology
from .tables_common import connect, copy_atomic, countries, harmonized_glob, last_full_year, parser, q


def build_day(processed: Path, country: str, force: bool = False, memory_limit: str = "2GB") -> dict:
    cm = processed / "cell_month_harmonized" / country
    years = sorted(int(p.name[5:]) for p in cm.glob("year=*") if any(p.glob("*.parquet")))
    con = connect(memory_limit, processed)
    report = {}
    try:
        for year in years:
            out = processed / "cell_day" / country / f"year={year}" / "part.parquet"
            if out.exists() and not force:
                report[year] = "skipped"
                continue
            hot = processed / "hotspots" / country / f"year={year}" / "*.parquet"
            monthly = cm / f"year={year}" / "*.parquet"
            if not list(hot.parent.glob(hot.name)):
                report[year] = "no hotspots"
                continue
            # Multi-satellite detections are counted once in the daily denominator.
            # For VIIRS-era months, prefer SNPP, then NOAA20, then NOAA21;
            # historical MODIS months use Aqua (or Terra when Aqua is unavailable).
            sql = f"""
                WITH raw AS (
                  SELECT h3_r6, date_local AS date, month(date_local) AS month,
                    count(*) FILTER (WHERE platform='SNPP') AS snpp,
                    count(*) FILTER (WHERE platform='NOAA20') AS noaa20,
                    count(*) FILTER (WHERE platform='NOAA21') AS noaa21,
                    count(*) FILTER (WHERE platform='Aqua') AS aqua,
                    count(*) FILTER (WHERE platform='Terra') AS terra,
                    count(*) FILTER (WHERE sensor='MODIS')::INTEGER AS count_raw_modis,
                    count(*) FILTER (WHERE sensor='VIIRS')::INTEGER AS count_raw_viirs,
                    sum(frp_mw) FILTER (WHERE platform='SNPP') AS frp_snpp,
                    sum(frp_mw) FILTER (WHERE platform='NOAA20') AS frp_noaa20,
                    sum(frp_mw) FILTER (WHERE platform='NOAA21') AS frp_noaa21,
                    sum(frp_mw) FILTER (WHERE platform='Aqua') AS frp_aqua,
                    sum(frp_mw) FILTER (WHERE platform='Terra') AS frp_terra,
                    count(*) FILTER (WHERE burn_type='agricola') AS agricola,
                    count(*) FILTER (WHERE burn_type='forestal') AS forestal
                  FROM read_parquet({q(hot)}) WHERE confidence_h IN ('nominal','alta')
                  GROUP BY 1,2,3
                ), weighted AS (
                  SELECT *, CASE WHEN {year} >= 2012 THEN
                    CASE WHEN sum(snpp) OVER (PARTITION BY h3_r6,month)>0 THEN snpp
                         WHEN sum(noaa20) OVER (PARTITION BY h3_r6,month)>0 THEN noaa20 ELSE noaa21 END
                    ELSE CASE WHEN sum(aqua) OVER (PARTITION BY h3_r6,month)>0 THEN aqua ELSE terra END END::DOUBLE AS w,
                    CASE WHEN {year} >= 2012 THEN coalesce(frp_snpp,frp_noaa20,frp_noaa21,0)
                         ELSE coalesce(frp_aqua,frp_terra,0) END AS frp_w
                  FROM raw
                ), shares AS (
                  SELECT *, w/nullif(sum(w) OVER (PARTITION BY h3_r6,month),0) AS share,
                    frp_w/nullif(sum(frp_w) OVER (PARTITION BY h3_r6,month),0) AS frp_share,
                    agricola::DOUBLE/nullif(sum(agricola+forestal) OVER (PARTITION BY h3_r6,month),0) AS ag_share,
                    forestal::DOUBLE/nullif(sum(agricola+forestal) OVER (PARTITION BY h3_r6,month),0) AS fo_share
                  FROM weighted
                )
                SELECT s.h3_r6,s.date,s.count_raw_modis,s.count_raw_viirs,
                  m.count_harm*s.share AS count_harm,
                  m.count_harm_lo*s.share AS count_harm_lo,
                  m.count_harm_hi*s.share AS count_harm_hi,
                  m.frp_harm*coalesce(s.frp_share,s.share) AS frp_harm,
                  m.clear_frac,m.is_estimated,
                  m.count_agricola*s.ag_share AS count_agricola,
                  m.count_forestal*s.fo_share AS count_forestal,
                  'SP'::VARCHAR AS source
                FROM shares s JOIN read_parquet({q(monthly)}) m USING (h3_r6,month)
                WHERE s.share IS NOT NULL ORDER BY s.h3_r6,s.date"""
            copy_atomic(con, sql, out)
            report[year] = con.execute(f"SELECT count(*) FROM read_parquet({q(out)})").fetchone()[0]
    finally:
        con.close()
    return {"country": country, "years": report}


def _regime_labels(con, cm: str) -> pd.DataFrame:
    """One shared five-cluster model for early and late monthly fire calendars.

    Cluster 0 means too little activity to characterise. A shared model makes
    early/late labels directly comparable; fixed seed keeps rebuilds stable.
    """
    months = ",".join(f"sum(count_harm) FILTER (WHERE month={m}) AS m{m}" for m in range(1,13))
    df = con.execute(f"""SELECT h3_r6, CASE WHEN year<=2010 THEN 0 ELSE 1 END AS period,
      {months},sum(count_harm) AS total FROM read_parquet({q(cm)},hive_partitioning=true)
      WHERE year BETWEEN 2001 AND 2010 OR year BETWEEN 2016 AND 2025
      GROUP BY 1,2 ORDER BY 1,2""").fetchdf()
    if df.empty:
        return pd.DataFrame(columns=["h3_r6","regime_early","regime_late"])
    monthly = df[[f"m{m}" for m in range(1,13)]].fillna(0).to_numpy(float)
    total = monthly.sum(axis=1)
    active = total >= 20
    labels = np.zeros(len(df),dtype=np.int32)
    if active.sum() >= 5:
        profile = monthly[active] / total[active,None]
        density = np.log1p(total[active])[:,None]
        features = np.column_stack([profile * 5,density])
        labels[active] = KMeans(n_clusters=5,n_init=5,random_state=0).fit_predict(features)+1
    df["regime"] = labels
    out = df.pivot(index="h3_r6",columns="period",values="regime").rename(columns={0:"regime_early",1:"regime_late"})
    for col in ("regime_early","regime_late"):
        if col not in out:
            out[col] = 0
    return out.fillna(0).astype({"regime_early":"int32","regime_late":"int32"}).reset_index()


def _trend_p_values(con) -> pd.DataFrame:
    annual = con.execute("SELECT h3_r6,year,activity FROM yearly ORDER BY h3_r6,year").fetchdf()
    wide = annual.pivot(index="h3_r6",columns="year",values="activity")
    years = np.broadcast_to(wide.columns.to_numpy(float),wide.shape)
    values = wide.to_numpy(float)
    result = kendalltau(years,values,axis=1,method="asymptotic",nan_policy="omit")
    return pd.DataFrame({"h3_r6":wide.index,"trend_p_value":result.pvalue}).replace({np.nan:None})


def build_stats(processed: Path, country: str, force: bool = False, memory_limit: str = "2GB") -> dict:
    out = processed / "cell_stats" / country / "part.parquet"
    if out.exists() and not force:
        return {"country": country, "skipped": True}
    con = connect(memory_limit, processed)
    try:
        cm = harmonized_glob(processed, country)
        ev = processed / "events" / country / "year=*" / "*.parquet"
        geo = processed / "geo" / country / "cell_geo.parquet"
        biome = processed / "cell_biome" / f"{country}.parquet"
        last = last_full_year(con,cm)
        con.execute(f"CREATE TEMP VIEW yearly AS SELECT h3_r6,year,sum(count_harm) AS activity FROM read_parquet({q(cm)},hive_partitioning=true) WHERE year <= {int(last)} GROUP BY 1,2")
        joins = []
        cols = []
        if list(ev.parent.parent.glob("year=*/*.parquet")):
            joins.append(f"LEFT JOIN (SELECT h3_r6, count(DISTINCT year(start_date))::INTEGER AS years_with_fire, max(year(end_date))::INTEGER AS last_fire_year FROM (SELECT start_date,end_date,unnest(cells) AS h3_r6 FROM read_parquet({q(ev)},hive_partitioning=true)) expanded GROUP BY 1) e USING(h3_r6)")
            cols += ["e.years_with_fire", "e.last_fire_year"]
        else:
            cols += ["NULL::INTEGER AS years_with_fire", "NULL::INTEGER AS last_fire_year"]
        if geo.exists():
            joins.append(f"LEFT JOIN read_parquet({q(geo)}) g USING(h3_r6)")
            cols += ["g.dist_locality_km", "g.pop_10km", "g.in_protected_area"]
        else:
            cols += ["NULL::DOUBLE AS dist_locality_km", "NULL::BIGINT AS pop_10km", "NULL::BOOLEAN AS in_protected_area"]
        if biome.exists():
            joins.append(f"LEFT JOIN read_parquet({q(biome)}) b USING(h3_r6)")
            cols += ["CASE b.biome WHEN 1 THEN 'bosque' WHEN 2 THEN 'matorral' WHEN 3 THEN 'pastizal/sabana' WHEN 4 THEN 'cultivo' WHEN 5 THEN 'otros' END AS dominant_landcover"]
        else:
            cols += ["NULL::VARCHAR AS dominant_landcover"]
        regimes = _regime_labels(con,cm)
        con.register("regime_labels",regimes)
        con.register("trend_p",_trend_p_values(con))
        sql = f"""WITH trends AS (
          SELECT a.h3_r6, median((b.activity-a.activity)/(b.year-a.year)) AS trend_sen_slope
          FROM yearly a JOIN yearly b ON a.h3_r6=b.h3_r6 AND b.year>a.year GROUP BY 1
        ), daily_onsets AS (
          SELECT h3_r6,year,min(month) FILTER (WHERE running >= annual*0.1) AS onset
          FROM (SELECT h3_r6,year,month,
            sum(count_harm) OVER (PARTITION BY h3_r6,year ORDER BY month) AS running,
            sum(count_harm) OVER (PARTITION BY h3_r6,year) AS annual
            FROM read_parquet({q(cm)},hive_partitioning=true) WHERE year <= {int(last)}) x
          WHERE annual>0 GROUP BY 1,2
        ), onset_trend AS (
          SELECT h3_r6,CASE WHEN count(*)>=8 THEN regr_slope(onset*30.4375,year)*10 ELSE NULL END AS season_onset_trend_days
          FROM daily_onsets WHERE onset IS NOT NULL GROUP BY 1
        ) SELECT r.h3_r6,{', '.join(cols)},t.trend_sen_slope,
          p.trend_p_value,o.season_onset_trend_days,
          r.regime_early,r.regime_late
          FROM regime_labels r LEFT JOIN trends t USING(h3_r6)
          LEFT JOIN trend_p p USING(h3_r6) LEFT JOIN onset_trend o USING(h3_r6)
          {' '.join(joins)} ORDER BY r.h3_r6"""
        copy_atomic(con, sql, out)
        n = con.execute(f"SELECT count(*) FROM read_parquet({q(out)})").fetchone()[0]
        return {"country": country, "rows": n, "output": str(out)}
    finally:
        con.close()


def main() -> None:
    a = parser(__doc__).parse_args()
    for country in a.country or countries(a.processed):
        print(json.dumps({"day": build_day(a.processed,country,a.force,a.memory_limit),
                          "stats": build_stats(a.processed,country,a.force,a.memory_limit),
                          "climatology": build_climatology(a.processed,country,a.force,a.memory_limit)},
                         ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
