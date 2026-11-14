"""Independent checks of the harmonized series (they do not reuse the calibration data).

1. Break test at 2012 (per country): log(total+1) = a + b*year + d*[year >= 2012] over 2003-2025, for the RAW
   pasted series (MODIS until 2011, VIIRS S-NPP from 2012) and for the harmonized one. If the harmonization works,
   the raw jump is large and the harmonized jump is not distinguishable from 0.
2. CONAFOR (Mexico): reported forest fires are independent of any satellite. Correlation of the annual reported
   fire count / area with the harmonized and with the raw pasted series, nationally and by state.
3. Cross-check against the country-level model in country_factors.zip (a separate implementation): annual totals.

Reads  data/processed/{hotspots,cell_month_harmonized,geo,reported}, data/raw/country_factors.zip (optional)
Writes data/processed/metadata/validation_extra.json
"""
from __future__ import annotations

import argparse
import io
import json
import os
import zipfile
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from scipy import stats

BREAK_YEAR = 2012
TEST_YEARS = (2003, 2025)  # full years with Aqua


def q(path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def level_shift(years, values, break_year=BREAK_YEAR) -> dict:
    """OLS of log1p(value) on (year centred, step at break_year); returns the jump in % and its two-sided t p-value."""
    t = np.asarray(years, float)
    y = np.log1p(np.asarray(values, float))
    X = np.column_stack([np.ones_like(t), t - t.mean(), (t >= break_year).astype(float)])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    df = len(y) - X.shape[1]
    sigma2 = float(resid @ resid) / df
    se = np.sqrt(sigma2 * np.diag(np.linalg.inv(X.T @ X)))
    tstat = beta[2] / se[2]
    return {"jump_pct": float(100 * (np.exp(beta[2]) - 1)), "p": float(2 * stats.t.sf(abs(tstat), df))}


def annual_series(con, processed: Path, country: str) -> pd.DataFrame:
    hot = processed / "hotspots" / country / "year=*" / "part-0.parquet"
    harm = processed / "cell_month_harmonized" / country / "year=*" / "*.parquet"
    raw = con.execute(f"""SELECT year(date_local) AS year,
        count(*) FILTER (WHERE sensor = 'MODIS') AS modis, count(*) FILTER (WHERE platform = 'SNPP') AS snpp
        FROM read_parquet({q(hot)}) WHERE date_local IS NOT NULL GROUP BY 1""").fetchdf()
    h = con.execute(f"SELECT year, sum(count_harm) AS harmonized FROM read_parquet({q(harm)}, hive_partitioning=true) GROUP BY 1").fetchdf()
    df = raw.merge(h, on="year", how="inner").sort_values("year")
    df["raw_concat"] = np.where(df.year < BREAK_YEAR, df.modis, df.snpp)
    return df


def break_test(df: pd.DataFrame) -> dict:
    d = df[(df.year >= TEST_YEARS[0]) & (df.year <= TEST_YEARS[1])]
    if len(d) < 12:
        return {}
    raw, harm = level_shift(d.year, d.raw_concat), level_shift(d.year, d.harmonized)
    return {"raw_jump_pct": round(raw["jump_pct"], 1), "raw_p": round(raw["p"], 4),
            "harmonized_jump_pct": round(harm["jump_pct"], 1), "harmonized_p": round(harm["p"], 3),
            "break_removed": bool(harm["p"] > 0.05 and abs(harm["jump_pct"]) < abs(raw["jump_pct"])),
            "years": f"{TEST_YEARS[0]}-{TEST_YEARS[1]}"}


def _corr(a, b) -> dict:
    a, b = np.asarray(a, float), np.asarray(b, float)
    ok = np.isfinite(a) & np.isfinite(b) & (a > 0) & (b > 0)
    if ok.sum() < 6:
        return {}
    pr, pp = stats.pearsonr(np.log(a[ok]), np.log(b[ok]))
    sr, sp = stats.spearmanr(a[ok], b[ok])
    return {"n_years": int(ok.sum()), "pearson_log": round(float(pr), 3), "pearson_p": round(float(pp), 4),
            "spearman": round(float(sr), 3), "spearman_p": round(float(sp), 4)}


def _fold(text) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(text).lower()) if unicodedata.category(c) != "Mn").strip()


def conafor_check(con, processed: Path, raw_dir: Path, mexico: pd.DataFrame) -> dict:
    """Official CONAFOR national/state yearly totals 2001-2025 (transcribed in country_factors.zip, conafor/*.csv).
    They span the 2012 break (11 years before it), unlike the 2010-2024 tables we parsed ourselves."""
    zpath = raw_dir / "country_factors.zip"
    if not zpath.exists():
        return {}
    with zipfile.ZipFile(zpath) as z:
        nat = pd.read_csv(io.BytesIO(z.read("conafor/conafor_national_annual.csv")), usecols=["year", "conafor_n_fires", "conafor_area_ha"])
        st = pd.read_csv(io.BytesIO(z.read("conafor/conafor_state_year.csv")), usecols=["state", "year", "conafor_n_fires"])
    m = mexico.merge(nat, on="year")
    out = {"source": "country_factors.zip/conafor (official CONAFOR yearly totals)", "years": f"{int(m.year.min())}-{int(m.year.max())}",
           "national": {}}
    for target in ("conafor_n_fires", "conafor_area_ha"):
        pre = m[m.year < BREAK_YEAR]
        out["national"][target] = {"harmonized": _corr(m.harmonized, m[target]), "raw_concat": _corr(m.raw_concat, m[target]),
                                   "harmonized_2001_2011": _corr(pre.harmonized, pre[target]),
                                   "raw_concat_2001_2011": _corr(pre.raw_concat, pre[target])}
    # by state: map CONAFOR state names to our INEGI state codes by accent-insensitive name
    geo = processed / "geo" / "Mexico"
    if (geo / "cell_geo.parquet").exists() and (geo / "admin_units.parquet").exists():
        units = con.execute(f"SELECT code, name FROM read_parquet({q(geo / 'admin_units.parquet')}) WHERE level = 'ent'").fetchdf()
        special = {"distrito federal": "ciudad de mexico", "mexico": "mexico", "estado de mexico": "mexico"}
        codes = {}
        for name in st.state.unique():
            f = special.get(_fold(name), _fold(name))
            hit = units[units.name.map(_fold).map(lambda u: u == f or u.startswith(f + " ") or f.startswith(u + " "))]
            if f == "mexico":  # 'México' must not match 'Ciudad de México'
                hit = units[units.name.map(_fold) == "mexico"]
            if len(hit) == 1:
                codes[name] = str(hit.code.iloc[0])
        hot = processed / "hotspots" / "Mexico" / "year=*" / "part-0.parquet"
        harm = processed / "cell_month_harmonized" / "Mexico" / "year=*" / "*.parquet"
        gq = q(geo / "cell_geo.parquet")
        hs = con.execute(f"SELECT g.cve_ent AS code, h.year, sum(h.count_harm) AS harmonized FROM read_parquet({q(harm)}, hive_partitioning=true) h "
                         f"JOIN read_parquet({gq}) g USING (h3_r6) GROUP BY 1, 2").fetchdf()
        rs = con.execute(f"""SELECT g.cve_ent AS code, year(p.date_local) AS year,
            count(*) FILTER (WHERE sensor = 'MODIS' AND year(p.date_local) < {BREAK_YEAR}) +
            count(*) FILTER (WHERE platform = 'SNPP' AND year(p.date_local) >= {BREAK_YEAR}) AS raw_concat
            FROM read_parquet({q(hot)}) p JOIN read_parquet({gq}) g USING (h3_r6) WHERE p.date_local IS NOT NULL GROUP BY 1, 2""").fetchdf()
        st["code"] = st.state.map(codes)
        s2 = st.dropna(subset=["code"]).merge(hs, on=["code", "year"]).merge(rs, on=["code", "year"])
        rows = []
        for code, d in s2.groupby("code"):
            if len(d) >= 15 and d.conafor_n_fires.nunique() > 1:
                rows.append({"harm": float(stats.spearmanr(d.harmonized, d.conafor_n_fires)[0]),
                             "raw": float(stats.spearmanr(d.raw_concat, d.conafor_n_fires)[0])})
        if rows:
            r = pd.DataFrame(rows).dropna()
            out["by_state"] = {"states_matched": len(codes), "states_tested": int(len(r)),
                               "median_spearman_harmonized": round(float(r.harm.median()), 3),
                               "median_spearman_raw": round(float(r.raw.median()), 3),
                               "share_states_better_harmonized": round(float((r.harm > r.raw).mean()), 3)}
    return out


def country_model_check(raw_dir: Path, series: dict) -> dict:
    zpath = raw_dir / "country_factors.zip"
    if not zpath.exists():
        return {}
    with zipfile.ZipFile(zpath) as z:
        theirs = pd.read_csv(io.BytesIO(z.read("country_year_harmonized.csv")), usecols=["country", "year", "harm_n"])
    out = {}
    for country, df in series.items():
        t = theirs[theirs.country == country]
        m = df.merge(t, on="year")
        m = m[(m.year >= 2001) & (m.year <= 2025)]
        if len(m) < 10:
            continue
        pre = m[m.year < BREAK_YEAR]
        out[country] = {"pearson_log": round(float(stats.pearsonr(np.log1p(m.harmonized), np.log1p(m.harm_n))[0]), 3),
                        "pearson_log_2001_2011": round(float(stats.pearsonr(np.log1p(pre.harmonized), np.log1p(pre.harm_n))[0]), 3) if len(pre) > 4 else None,
                        "median_ratio_ours_over_theirs": round(float((m.harmonized / m.harm_n).median()), 3),
                        "median_ratio_2001_2011": round(float((pre.harmonized / pre.harm_n).median()), 3) if len(pre) else None}
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    p.add_argument("--raw", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    a = p.parse_args()
    summary = json.loads((a.processed / "metadata" / "harmonization_summary.json").read_text())
    con = duckdb.connect()
    con.execute("SET memory_limit='2GB'")
    series, result = {}, {"breaks": {}, "conafor_mexico": {}, "country_model_crosscheck": {}}
    for c in summary["countries"]:
        series[c] = annual_series(con, a.processed, c)
        result["breaks"][c] = break_test(series[c])
    if "Mexico" in series:
        result["conafor_mexico"] = conafor_check(con, a.processed, a.raw, series["Mexico"])
    result["country_model_crosscheck"] = country_model_check(a.raw, series)
    out = a.processed / "metadata" / "validation_extra.json"
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(json.dumps(result, indent=1, ensure_ascii=False)[:3500])


if __name__ == "__main__":
    main()
