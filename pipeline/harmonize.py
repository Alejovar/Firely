"""Harmonize MODIS into SNPP-equivalent VIIRS units (methodology v1.2).

Reference unit: one Suomi-NPP VIIRS satellite (375 m). Per country:

* 2012-02 .. 2026-10  -> observed SNPP counts/FRP (the reference itself).
* 2001-01 .. 2012-01  -> estimated from MODIS (Terra-only before 2002-08, no Aqua), calibrated on the
  orbit-stable years 2012-02..2021-12 (Terra/Aqua drift afterwards).
* after the last S-NPP month -> MODIS-based estimate (FIRMS SP data lag: VIIRS ended 2026-07 while MODIS
  reaches 2026-08), flagged is_estimated; NOAA-20 x its S-NPP ratio only if S-NPP is over (2026-11-02)
  but NOAA-20 still delivers.

Estimator (hybrid, two-part): the regional monthly total is the sum over cell classes of
(SNPP/MODIS ratio of that class and calendar month) x (MODIS activity of the class); it is
then allocated to cells: cells with MODIS detections share it in proportion to their MODIS
count, and zero-MODIS cells (where VIIRS still sees small fires) get an allocation tied to
the regional activity and, optionally, to MODIS activity in the 6 neighbouring H3 cells.

Up to four configurations are validated (leave-one-year-out, 2012-2025) and each country keeps
the one with the lowest annual error: "plain" (no classes/neighbours), "regimes" (fire-regime
classes + neighbours), "biome" (IGBP biome from MCD12Q1, see pipeline/landcover.py, +
neighbours) and "biome_regime" (their product):

* classes = k-means (k=5) on MODIS-only behaviour per cell (mean FRP, night fraction,
  spring/winter/summer share, activity). No SNPP is used -> no target leakage, and it works
  before 2012. It stands in for the IGBP biome split of docs section 5.4 until the landcover
  rasters are available locally; classes are fire-regime proxies, not land-cover labels.

Reads  data/processed/hotspots/<Country>/year=*/part-0.parquet
Writes data/processed/cell_month_harmonized/<Country>/year=YYYY/*.parquet
       data/processed/cell_class/<Country>.parquet
       data/processed/metadata/*.csv|json (validation, star-chart series, summary)
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import duckdb

METHODOLOGY_VERSION = "1.2.0-hybrid-biome"
FIRST_YM, SNPP_FIRST_YM, SNPP_LAST_YM, AQUA_FIRST_YM = 200101, 201202, 202610, 200208
STABLE_END_YM = 202112  # Terra/Aqua orbits drift after ~2020-2022: calibrate pre-2012 estimates on stable years
N_CLASSES = 5
CONFIGS = {"plain": (None, False), "regimes": ("c", True), "biome": ("c_bio", True), "biome_regime": ("c_br", True)}
PREDICTORS = {"ta": ("modis_ta", "nb_ta"), "t": ("terra", "nb_t")}


def q(path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def build_dense(con, processed: Path, country: str) -> int:
    """cells x months frame with per-platform counts/FRP; zeros are explicit."""
    hot = processed / "hotspots" / country / "year=*" / "part-0.parquet"
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE sparse AS
        SELECT h3_r6, year(date_local)::INTEGER * 100 + month(date_local)::INTEGER AS ym,
            count(*) FILTER (WHERE platform = 'Terra')::INTEGER AS terra,
            count(*) FILTER (WHERE platform = 'Aqua')::INTEGER AS aqua,
            count(*) FILTER (WHERE platform = 'SNPP')::INTEGER AS snpp,
            count(*) FILTER (WHERE platform = 'NOAA20')::INTEGER AS n20,
            count(*) FILTER (WHERE platform = 'NOAA21')::INTEGER AS n21,
            coalesce(sum(frp_mw) FILTER (WHERE sensor = 'MODIS'), 0)::FLOAT AS f_modis,
            coalesce(sum(frp_mw) FILTER (WHERE platform = 'SNPP'), 0)::FLOAT AS f_snpp,
            coalesce(sum(frp_mw) FILTER (WHERE platform = 'NOAA20'), 0)::FLOAT AS f_n20
        FROM read_parquet({q(hot)}) WHERE date_local IS NOT NULL GROUP BY 1, 2""")
    last = con.execute("SELECT max(ym) FROM sparse").fetchone()[0]
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE dense0 AS
        SELECT c.h3_r6, t.ym, t.ym // 100 AS y, t.ym % 100 AS m,
            coalesce(s.terra, 0) AS terra, coalesce(s.aqua, 0) AS aqua,
            coalesce(s.terra, 0) + coalesce(s.aqua, 0) AS modis_ta,
            coalesce(s.snpp, 0) AS snpp, coalesce(s.n20, 0) AS n20, coalesce(s.n21, 0) AS n21,
            coalesce(s.f_modis, 0) AS f_modis, coalesce(s.f_snpp, 0) AS f_snpp, coalesce(s.f_n20, 0) AS f_n20
        FROM (SELECT DISTINCT h3_r6 FROM sparse) c
        CROSS JOIN (SELECT y * 100 + mm AS ym FROM range(2001, {last // 100 + 1}) r(y), range(1, 13) r2(mm)
                    WHERE y * 100 + mm BETWEEN {FIRST_YM} AND {last}) t
        LEFT JOIN sparse s ON s.h3_r6 = c.h3_r6 AND s.ym = t.ym""")
    con.execute("DROP TABLE sparse")
    return last


def add_regimes(con, processed: Path, country: str) -> dict:
    """Attach MODIS-only fire-regime class (c) and neighbour-activity bins (nb_ta, nb_t) to `dense`."""
    import h3
    import numpy as np
    from sklearn.cluster import KMeans

    hot = processed / "hotspots" / country / "year=*" / "part-0.parquet"
    feats = con.execute(f"""
        SELECT h3_r6, count(*) AS n, avg(frp_mw) AS frp, avg((daynight = 'N')::INT) AS night,
               avg((month(date_local) BETWEEN 3 AND 5)::INT) AS spring,
               avg((month(date_local) IN (12, 1, 2))::INT) AS winter,
               avg((month(date_local) BETWEEN 6 AND 8)::INT) AS summer
        FROM read_parquet({q(hot)}) WHERE sensor = 'MODIS' GROUP BY 1""").fetchdf()
    cells = con.execute("SELECT DISTINCT h3_r6 FROM dense0").fetchdf().merge(feats, how="left", on="h3_r6")
    cells["n"] = cells["n"].fillna(0)
    active = cells["n"] >= 20
    x = np.column_stack([np.log1p(cells.loc[active, "frp"]), cells.loc[active, "night"], cells.loc[active, "spring"],
                         cells.loc[active, "winter"], cells.loc[active, "summer"], np.log1p(cells.loc[active, "n"])])
    mu, sd = x.mean(0), x.std(0)
    sd[sd == 0] = 1
    labels = KMeans(n_clusters=N_CLASSES, n_init=5, random_state=0).fit((x - mu) / sd).labels_
    cells["c"] = 0  # class 0: too few MODIS detections to characterise
    cells.loc[active, "c"] = labels + 1
    describe = cells[active].groupby("c")[["frp", "night", "spring", "winter", "summer", "n"]].mean().round(3)
    describe["cells"] = cells[active].groupby("c").size()
    describe.loc[0, "cells"] = int((~active).sum())

    con.execute("CREATE OR REPLACE TEMP TABLE cls(h3_r6 VARCHAR, c INTEGER)")
    con.executemany("INSERT INTO cls VALUES (?, ?)", list(zip(cells.h3_r6, cells.c.astype(int))))
    biome_file = processed / "cell_biome" / f"{country}.parquet"
    if biome_file.exists():
        con.execute(f"CREATE OR REPLACE TEMP TABLE bio AS SELECT h3_r6, biome FROM read_parquet({q(biome_file)})")
    else:
        con.execute("CREATE OR REPLACE TEMP TABLE bio AS SELECT h3_r6, 0 AS biome FROM cls")
    con.execute("CREATE OR REPLACE TEMP TABLE nbmap(h3_r6 VARCHAR, nb VARCHAR)")
    con.executemany("INSERT INTO nbmap VALUES (?, ?)", [(c, n) for c in cells.h3_r6 for n in h3.grid_ring(c, 1)])
    for col, pred in (("ta", "modis_ta"), ("t", "terra")):
        con.execute(f"""CREATE OR REPLACE TEMP TABLE nbs_{col} AS
            SELECT m.h3_r6, d.ym, sum(d.{pred})::INT AS s FROM nbmap m
            JOIN dense0 d ON d.h3_r6 = m.nb AND d.{pred} > 0 GROUP BY 1, 2""")
    nb = lambda col: f"""CASE WHEN coalesce(s_{col}.s, 0) = 0 THEN 0 WHEN s_{col}.s <= 2 THEN 1
                              WHEN s_{col}.s <= 6 THEN 2 ELSE 3 END"""
    con.execute(f"""CREATE OR REPLACE TEMP TABLE dense AS
        SELECT d.*, c.c, coalesce(b.biome, 0) AS c_bio, coalesce(b.biome, 0) * 10 + c.c AS c_br,
               {nb('ta')} AS nb_ta, {nb('t')} AS nb_t
        FROM dense0 d JOIN cls c USING (h3_r6) LEFT JOIN bio b USING (h3_r6)
        LEFT JOIN nbs_ta s_ta ON s_ta.h3_r6 = d.h3_r6 AND s_ta.ym = d.ym
        LEFT JOIN nbs_t s_t ON s_t.h3_r6 = d.h3_r6 AND s_t.ym = d.ym""")
    for t in ("dense0", "nbs_ta", "nbs_t", "nbmap"):
        con.execute(f"DROP TABLE {t}")
    cls_out = processed / "cell_class"
    cls_out.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY (SELECT h3_r6, c AS fire_regime_class FROM cls) TO {q(cls_out / (country + '.parquet'))} (FORMAT PARQUET)")
    return {"classes": describe.reset_index().to_dict(orient="records"), "has_biome": biome_file.exists()}


def fit(con, name: str, pred: str, nbcol: str, ccol: str | None, use_nb: bool, where: str):
    """Calibration tables for one configuration. `where` is evaluated on dense alias d.

    Returns (global fixed ratio = naive baseline, mean SNPP FRP per detection)."""
    cc = f"d.{ccol}" if ccol else "0"
    nbx = f"d.{nbcol}" if use_nb else "0"
    con.execute(f"""CREATE OR REPLACE TEMP TABLE cal_{name} AS
        SELECT {cc} AS c, d.m,
            sum(d.snpp) FILTER (WHERE d.{pred} > 0)::DOUBLE / nullif(sum(d.{pred}), 0) AS r_pos,
            sum(d.snpp)::DOUBLE / nullif(sum(d.{pred}), 0) AS r_tot,
            sum(d.f_snpp)::DOUBLE / nullif(sum(d.snpp), 0) AS fpd
        FROM dense d WHERE {where} GROUP BY 1, 2""")
    con.execute(f"""CREATE OR REPLACE TEMP TABLE regc_{name} AS
        SELECT {cc} AS c, d.ym, sum(d.{pred})::DOUBLE AS rr, count(*) AS n FROM dense d GROUP BY 1, 2""")
    con.execute(f"""CREATE OR REPLACE TEMP TABLE zcal_{name} AS
        SELECT {cc} AS c, d.m, {nbx} AS nb, sum(d.snpp)::DOUBLE AS zs, sum(g.rr / g.n)::DOUBLE AS zden
        FROM dense d JOIN regc_{name} g ON g.c = {cc} AND g.ym = d.ym
        WHERE {where} AND d.{pred} = 0 GROUP BY 1, 2, 3""")
    row = con.execute(f"""SELECT sum(snpp)::DOUBLE / nullif(sum({pred}), 0), sum(f_snpp)::DOUBLE / nullif(sum(snpp), 0)
                          FROM dense d WHERE {where}""").fetchone()
    return (row[0] or 1.0), (row[1] or 0.0)


def predict_sql(name: str, pred: str, nbcol: str, ccol: str | None, use_nb: bool, ratio: float, fpd0: float,
                where: str, band: float = 0.0) -> str:
    """Estimates for the rows selected by `where` (alias d)."""
    cc = f"d.{ccol}" if ccol else "0"
    nbx = f"d.{nbcol}" if use_nb else "0"
    return f"""WITH raw AS (
        SELECT d.h3_r6, d.ym, d.y, d.m, d.snpp, d.{pred} AS x, {cc} AS cc,
            CASE WHEN d.{pred} > 0 THEN d.{pred} * coalesce(cal.r_pos, cal.r_tot, {ratio!r}::DOUBLE)
                 ELSE coalesce(z.zs / nullif(z.zden, 0), 0) * g.rr / g.n END AS e0,
            coalesce(cal.r_tot, {ratio!r}::DOUBLE) * g.rr AS part,
            coalesce(cal.fpd, {fpd0!r}::DOUBLE) AS fpd, d.{pred} * {ratio!r}::DOUBLE AS base
        FROM dense d
        JOIN cal_{name} cal ON cal.c = {cc} AND cal.m = d.m
        JOIN regc_{name} g ON g.c = {cc} AND g.ym = d.ym
        LEFT JOIN zcal_{name} z ON z.c = {cc} AND z.m = d.m AND z.nb = {nbx}
        WHERE {where}),
      s AS (SELECT ym, sum(e0) AS s0 FROM raw GROUP BY ym),
      tg AS (SELECT ym, sum(part) AS target FROM (SELECT DISTINCT ym, cc, part FROM raw) GROUP BY ym)
      SELECT r.h3_r6, r.ym, r.y, r.m, r.snpp, r.x,
             coalesce(r.e0 * tg.target / nullif(s.s0, 0), 0) AS est,
             coalesce(r.e0 * tg.target / nullif(s.s0, 0), 0) * (1 - {band!r}::DOUBLE) AS est_lo,
             coalesce(r.e0 * tg.target / nullif(s.s0, 0), 0) * (1 + {band!r}::DOUBLE) AS est_hi,
             coalesce(r.e0 * tg.target / nullif(s.s0, 0), 0) * r.fpd AS est_frp, r.base
      FROM raw r JOIN s USING (ym) JOIN tg USING (ym)"""


def validate(con, name: str, pred: str, nbcol: str, ccol: str | None, use_nb: bool, years: range):
    """Leave-one-year-out; returns cell-level and region-month frames."""
    import pandas as pd
    cell_rows, region = [], []
    for year in years:
        ratio, fpd0 = fit(con, name, pred, nbcol, ccol, use_nb, f"d.ym BETWEEN {SNPP_FIRST_YM} AND 202512 AND d.y <> {year}")
        con.execute(f"CREATE OR REPLACE TEMP TABLE fold AS {predict_sql(name, pred, nbcol, ccol, use_nb, ratio, fpd0, f'd.y = {year}')}")
        cell = con.execute("""SELECT count(*) n, avg(est - snpp) bias, avg(abs(est - snpp)) mae,
            sqrt(avg((est - snpp) ^ 2)) rmse, avg(base - snpp) bias_b, avg(abs(base - snpp)) mae_b,
            sqrt(avg((base - snpp) ^ 2)) rmse_b FROM fold""").fetchdf()
        cell.insert(0, "year", year)
        cell_rows.append(cell)
        region.append(con.execute(f"""SELECT {year} AS year, m AS month, sum(snpp) AS actual, sum(est) AS est,
            sum(base) AS base FROM fold GROUP BY m ORDER BY m""").fetchdf())
    return pd.concat(cell_rows, ignore_index=True), pd.concat(region, ignore_index=True)


def summarize(cell, region) -> dict:
    import numpy as np
    ann = region.groupby("year")[["actual", "est", "base"]].sum()
    ape = lambda col: (ann[col] - ann["actual"]).abs() / ann["actual"]
    peak = region.loc[region.groupby("year")["actual"].idxmax()].set_index("year")["month"]
    pk = lambda col: region.loc[region.groupby("year")[col].idxmax()].set_index("year")["month"]
    spear = lambda col: float(region["actual"].rank().corr(region[col].rank()))
    w = cell["n"]
    wavg = lambda c: float((cell[c] * w).sum() / w.sum())
    return {
        "cell_month": {k: wavg(k) for k in ["bias", "mae", "rmse", "bias_b", "mae_b", "rmse_b"]},
        "cell_month_mae_improvement_pct": 100 * (1 - wavg("mae") / wavg("mae_b")),
        "cell_month_rmse_improvement_pct": 100 * (1 - wavg("rmse") / wavg("rmse_b")),
        "region_year_mape_pct": float(100 * ape("est").mean()),
        "region_year_mape_baseline_pct": float(100 * ape("base").mean()),
        "region_year_median_ape_pct": float(100 * ape("est").median()),
        "region_year_p90_ape_pct": float(100 * np.quantile(ape("est"), 0.9)),
        "region_month_spearman": spear("est"),
        "region_month_spearman_baseline": spear("base"),
        "peak_month_exact_pct": float(100 * (pk("est") == peak).mean()),
        "peak_month_pm1_pct": float(100 * ((pk("est") - peak).abs() <= 1).mean()),
        "bias_region_pct": float(100 * (ann["est"].sum() - ann["actual"].sum()) / ann["actual"].sum()),
    }


def _mann_kendall(x):
    """Two-sided Mann-Kendall p (normal approx, no tie correction) and Sen slope for a short series."""
    import numpy as np
    from math import erfc, sqrt
    n = len(x)
    s = sum(np.sign(x[j] - x[i]) for i in range(n) for j in range(i + 1, n))
    z = (s - np.sign(s)) / sqrt(n * (n - 1) * (2 * n + 5) / 18) if s else 0.0
    sen = float(np.median([(x[j] - x[i]) / (j - i) for i in range(n) for j in range(i + 1, n)]))
    return float(erfc(abs(z) / sqrt(2))), sen


def drift_and_backcast(con, ccol, use_nb) -> dict:
    """Orbit-drift diagnostics (SNPP/MODIS ratios by year) and a BACKWARD validation: calibrate on the later
    years (2018-2025) and predict the earlier ones (2012-2017), the same direction as the 2001-2011 estimates."""
    import numpy as np
    yearly = con.execute(f"""SELECT y AS year, sum(snpp)::DOUBLE / sum(modis_ta) AS ratio_terra_aqua,
        sum(snpp)::DOUBLE / nullif(sum(terra), 0) AS ratio_terra, sum(snpp)::DOUBLE / nullif(sum(aqua), 0) AS ratio_aqua
        FROM dense WHERE ym BETWEEN {SNPP_FIRST_YM} AND 202512 GROUP BY y ORDER BY y""").fetchdf()
    trends = {}
    for col in ("ratio_terra_aqua", "ratio_terra", "ratio_aqua"):
        p, sen = _mann_kendall(yearly[col].to_numpy())
        trends[col] = {"mk_p": p, "sen_pct_per_year": 100 * sen / float(np.mean(yearly[col]))}
    back = {}
    for label, cc, nb in (("chosen", ccol, use_nb), ("plain", None, False)):
        ratio, fpd0 = fit(con, "bc", "modis_ta", "nb_ta", cc, nb, "d.ym BETWEEN 201801 AND 202512")
        con.execute(f"CREATE OR REPLACE TEMP TABLE bcf AS "
                    f"{predict_sql('bc', 'modis_ta', 'nb_ta', cc, nb, ratio, fpd0, 'd.ym BETWEEN 201202 AND 201712')}")
        a = con.execute("SELECT y, sum(snpp) AS act, sum(est) AS est, sum(base) AS base FROM bcf GROUP BY y").fetchdf()
        back[label] = {"annual_mape_pct": float(100 * ((a.est - a.act).abs() / a.act).mean()),
                       "baseline_annual_mape_pct": float(100 * ((a.base - a.act).abs() / a.act).mean()),
                       "bias_pct": float(100 * (a.est.sum() - a.act.sum()) / a.act.sum())}
    return {"yearly_ratios": yearly.round(4).to_dict(orient="records"), "trends": trends,
            "backcast_train": "2018-2025", "backcast_test": "2012-2017", "backcast": back,
            "stable_orbit_calibration": f"2012-02..{STABLE_END_YM}"}


def assess_quality(meta: dict, brk: dict | None = None) -> dict:
    """Per-country reliability of the harmonized series, from its own validations (see methodology doc).

    alta : leave-one-year-out error is >=20% below the fixed-factor baseline, the BACKWARD validation also beats the
           baseline, and the Terra+Aqua/SNPP ratio shows no significant drift (Mann-Kendall p >= 0.05).
    media: improves on the baseline in both validations and the uncertainty band is <=15%.
    baja : anything else (no improvement, worse backward, or a wide band): data are shown, flagged, not hidden.
    A residual break at 2012 in the harmonized series (pipeline.validation_extra: p < 0.05 and |jump| > 25%) also
    forces 'baja': the estimates for 2001-2011 do not join the observed series."""
    m = meta["validation"]["ta"]
    loyo_red = 100 * (1 - m["region_year_mape_pct"] / m["region_year_mape_baseline_pct"])
    b = meta["drift"]["backcast"]["chosen"]
    back_ok = b["annual_mape_pct"] < b["baseline_annual_mape_pct"]
    drift_p = meta["drift"]["trends"]["ratio_terra_aqua"]["mk_p"]
    band = 100 * meta["band_rel_ta"]
    reasons = []
    if loyo_red < 20:
        reasons.append(f"mejora de {loyo_red:.0f}% frente a la línea base (menos de 20%)")
    if not back_ok:
        reasons.append("la validación hacia atrás es peor que la línea base")
    if drift_p < 0.05:
        reasons.append(f"la razón VIIRS/MODIS cambia con el tiempo (p={drift_p:.2f})")
    if band > 15:
        reasons.append(f"banda de incertidumbre ancha (±{band:.0f}%)")
    residual_break = bool(brk) and brk.get("harmonized_p", 1) < 0.05 and abs(brk.get("harmonized_jump_pct", 0)) > 25
    if residual_break:
        reasons.append(f"persiste un quiebre en 2012 en la serie armonizada ({brk['harmonized_jump_pct']:+.0f}%, p={brk['harmonized_p']:.3f})")
    if residual_break:
        level = "baja"
    elif loyo_red >= 20 and back_ok and drift_p >= 0.05:
        level = "alta"
    elif loyo_red > 0 and back_ok and band <= 15:
        level = "media"
    else:
        level = "baja"
    return {"level": level, "reasons": reasons, "loyo_error_reduction_pct": round(loyo_red, 1)}


def harmonize_country(con, processed: Path, country: str, out_root: Path) -> dict:
    last = build_dense(con, processed, country)
    meta = {"country": country, "last_ym": last}
    meta.update(add_regimes(con, processed, country))
    meta["n_cells"] = con.execute("SELECT count(*) FROM cls").fetchone()[0]

    configs = {k: v for k, v in CONFIGS.items() if meta["has_biome"] or not k.startswith("biome")}
    metrics = {cfg: {} for cfg in configs}
    for cfg, (ccol, use_nb) in configs.items():
        for name, (pred, nbcol) in PREDICTORS.items():
            cell, region = validate(con, f"{cfg}_{name}", pred, nbcol, ccol, use_nb, range(2012, 2026))
            metrics[cfg][name] = summarize(cell, region)
            cell.to_csv(out_root / "metadata" / f"loyo_cell_{country}_{cfg}_{name}.csv", index=False)
            region.to_csv(out_root / "metadata" / f"loyo_region_month_{country}_{cfg}_{name}.csv", index=False)
    chosen = min(configs, key=lambda c: metrics[c]["ta"]["region_year_mape_pct"])
    ccol, use_nb = configs[chosen]
    meta["model"] = chosen
    meta["validation"] = metrics[chosen]
    meta["validation_by_model"] = metrics
    meta["selection_rule"] = "lowest leave-one-year-out annual MAPE (Terra+Aqua predictor), 2012-2025"

    cut = f"d.ym BETWEEN {SNPP_FIRST_YM} AND 202512"
    k20 = con.execute("SELECT sum(snpp)::DOUBLE / nullif(sum(n20), 0) FROM dense WHERE ym BETWEEN 201804 AND 202512").fetchone()[0] or 1.0
    f20 = con.execute("SELECT sum(f_snpp)::DOUBLE / nullif(sum(f_n20), 0) FROM dense WHERE ym BETWEEN 201804 AND 202512").fetchone()[0] or 1.0
    meta["noaa20_to_snpp_count_ratio"], meta["noaa20_to_snpp_frp_ratio"] = k20, f20
    # Where VIIRS data stop (FIRMS SP lags): months after the last S-NPP month are estimated from MODIS.
    vl_snpp = min(SNPP_LAST_YM, con.execute("SELECT coalesce(max(ym), 0) FROM dense WHERE snpp > 0").fetchone()[0])
    vl_any = con.execute("SELECT coalesce(max(ym), 0) FROM dense WHERE snpp + n20 + n21 > 0").fetchone()[0]
    meta["viirs_last_ym"], meta["modis_last_ym"] = vl_snpp, last
    meta["drift"] = drift_and_backcast(con, ccol, use_nb)
    meta["band_rel_ta"] = metrics[chosen]["ta"]["region_year_p90_ape_pct"] / 100
    meta["quality"] = assess_quality(meta)
    stable = f"d.ym BETWEEN {SNPP_FIRST_YM} AND {STABLE_END_YM}"
    parts = []
    # (name, predictor, estimation rows, calibration rows)
    for name, (pred, nbcol), where, calib in (
            ("ta", PREDICTORS["ta"], f"d.ym BETWEEN {AQUA_FIRST_YM} AND {SNPP_FIRST_YM - 1}", stable),
            ("t", PREDICTORS["t"], f"d.ym BETWEEN {FIRST_YM} AND {AQUA_FIRST_YM - 1}", stable),
            ("tl", PREDICTORS["ta"], f"d.ym > {vl_snpp}", cut)):
        band = metrics[chosen]["ta" if name == "tl" else name]["region_year_p90_ape_pct"] / 100
        meta[f"band_rel_{'ta' if name == 'tl' else name}"] = band
        ratio, fpd0 = fit(con, f"final_{name}", pred, nbcol, ccol, use_nb, calib)
        parts.append(predict_sql(f"final_{name}", pred, nbcol, ccol, use_nb, ratio, fpd0, where, band))
    con.execute("CREATE OR REPLACE TEMP TABLE est AS " + " UNION ALL ".join(f"SELECT * FROM ({q_})" for q_ in parts))

    def pick(est_col, snpp_col, n20_col, k):
        """Observed S-NPP where it exists; MODIS-based estimate before it / after VIIRS data stop;
        NOAA-20 scaled by its ratio only if S-NPP is over but NOAA-20 still delivers."""
        return (f"CASE WHEN d.ym < {SNPP_FIRST_YM} THEN e.{est_col} WHEN d.ym <= {vl_snpp} THEN d.{snpp_col} "
                f"WHEN d.ym > {SNPP_LAST_YM} AND d.ym <= {vl_any} THEN d.{n20_col} * {k!r}::DOUBLE ELSE e.{est_col} END")

    dest = out_root / "cell_month_harmonized" / country
    dest.mkdir(parents=True, exist_ok=True)
    con.execute(f"""COPY (
        SELECT d.h3_r6, d.y AS year, d.m::TINYINT AS month,
            d.modis_ta::INTEGER AS count_raw_modis, (d.snpp + d.n20 + d.n21)::INTEGER AS count_raw_viirs,
            {pick('est', 'snpp', 'n20', k20)} AS count_harm,
            {pick('est_lo', 'snpp', 'n20', k20)} AS count_harm_lo,
            {pick('est_hi', 'snpp', 'n20', k20)} AS count_harm_hi,
            {pick('est_frp', 'f_snpp', 'f_n20', f20)} AS frp_harm,
            NULL::DOUBLE AS clear_frac,
            (d.ym < {SNPP_FIRST_YM} OR (d.ym > {vl_snpp} AND NOT (d.ym > {SNPP_LAST_YM} AND d.ym <= {vl_any}))) AS is_estimated,
            NULL::DOUBLE AS count_agricola, NULL::DOUBLE AS count_forestal, d.f_modis AS frp_raw_modis
        FROM dense d LEFT JOIN est e USING (h3_r6, ym)
    ) TO {q(dest)} (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (year), OVERWRITE_OR_IGNORE)""")

    star = con.execute(f"""SELECT year, sum(count_raw_modis) AS modis_raw, sum(count_raw_viirs) AS viirs_raw,
        sum(count_harm) AS harmonized, sum(frp_harm) AS frp_harmonized
        FROM read_parquet({q(dest / '*' / '*.parquet')}) GROUP BY 1 ORDER BY 1""").fetchdf()
    star.insert(0, "country", country)
    star.to_csv(out_root / "metadata" / f"star_chart_{country}.csv", index=False)
    meta["star_chart_rows"] = len(star)
    return meta


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--country", nargs="+", default=["Mexico", "Argentina"])
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    p.add_argument("--memory-limit", default="3GB")
    a = p.parse_args()
    (a.processed / "metadata").mkdir(parents=True, exist_ok=True)
    tmp = a.processed / ".duckdb_tmp"
    tmp.mkdir(exist_ok=True)
    summary = a.processed / "metadata" / "harmonization_summary.json"
    result = {"methodology_version": METHODOLOGY_VERSION, "countries": {}}
    if summary.exists():  # keep other countries from earlier runs of the same version
        old = json.loads(summary.read_text())
        if old.get("methodology_version") == METHODOLOGY_VERSION:
            result["countries"].update(old.get("countries", {}))
    for country in a.country:
        con = duckdb.connect()
        con.execute(f"SET memory_limit='{a.memory_limit}'; SET temp_directory={q(tmp)}")
        result["countries"][country] = harmonize_country(con, a.processed, country, a.processed)
        con.close()
        summary.write_text(json.dumps(result, indent=2, default=float))
        print(f"{country} done (model={result['countries'][country]['model']})", flush=True)
    for c, v in result["countries"].items():
        m = v["validation"]["ta"]
        print(c, v["model"], f"annual MAPE {m['region_year_mape_pct']:.2f}% vs baseline {m['region_year_mape_baseline_pct']:.2f}%",
              f"| cell RMSE improvement {m['cell_month_rmse_improvement_pct']:.1f}%")


if __name__ == "__main__":
    main()
