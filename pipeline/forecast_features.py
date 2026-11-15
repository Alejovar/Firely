"""Feature panel for the 1-3 month fire outlook (docs/plan-modelo-predictivo.md §4, §14).

One row per H3 r6 cell and issue month t (closing of month t); targets are the harmonized counts of t+1, t+2, t+3.
All features are fold-independent. Climatologies used as FEATURES (clim_t, sd_t, clim_i, z0, ratio0, climate
anomalies) are expanding: the same calendar month over previous years only, so a row never sees its own target
(a fixed or leave-one-out climatology leaks the target inside the training rows). The fixed training-years
climatology of the plan (decision 3.5) is kept for the B0 baseline and the terciles in pipeline.forecast_train.

Reads  data/processed/cell_month_harmonized/<Country>/year=*/        count_harm, frp_harm, is_estimated
       data/processed/cell_month_recent/<Country>/ (provisional S-NPP months after the harmonized table, pipeline.snpp_recent)
       data/processed/forecast/power_grid_month.parquet + power_grid_month_recent.parquet + cell_power/
       (pipeline.forecast_climate)
       data/processed/cell_stats/<Country>/, cell_biome/<Country>.parquet, context/oni.parquet
Writes data/processed/forecast/panel/<Country>/part-NN.parquet
       data/processed/forecast/feature_dictionary.csv

Anti-leakage (checked with asserts): every feature reads months <= t, except static fields and the calendar month
of the target. ONI is a 3-month running mean centred on its month, so the value used at t is the one centred on
t-1 (season t-2..t). POWER monthly values exist only for complete years: issue months after the last POWER year
carry NaN climate (the operational gap is studied by the ablation in pipeline.forecast_evaluate).

    python -m pipeline.forecast_features [--country ...] [--force]
"""
from __future__ import annotations

import csv
import warnings

import h3
import numpy as np
import pandas as pd

from .tables_common import connect, copy_atomic, countries, harmonized_glob, parser, q

FIRST_YEAR = 2001
FIRST_ISSUE = (2011, 12)  # first target = 2012-01 (estimated, used only as lag); observed targets from 2012-02
HORIZONS = (1, 2, 3)
CHUNK = 8000  # cells per output part (memory bound)
ANOM_VARS = ["pr3", "pr6", "pr12", "vpd", "gwr", "t2m"]

FEATURES = [  # name, description, lag relative to t, source
    ("l0", "log1p(count_harm) en t", "t", "cell_month_harmonized"),
    ("l1", "log1p(count_harm) en t-1", "t-1", "cell_month_harmonized"),
    ("l2", "log1p(count_harm) en t-2", "t-2", "cell_month_harmonized"),
    ("s3", "log1p(suma de count_harm t-2..t)", "t-2..t", "cell_month_harmonized"),
    ("s12", "log1p(suma de count_harm t-11..t)", "t-11..t", "cell_month_harmonized"),
    ("frp0", "log1p(frp_harm) en t", "t", "cell_month_harmonized"),
    ("nb0", "media de log1p(count_harm) de las 6 celdas vecinas (h3 grid_ring 1) en t", "t", "cell_month_harmonized"),
    ("nb_s3", "media de log1p(suma t-2..t) de las celdas vecinas", "t-2..t", "cell_month_harmonized"),
    ("ly", "log1p(count_harm) del mes objetivo un año antes (t+h-12)", "t+h-12 (<= t-9)", "cell_month_harmonized"),
    ("nb_ly", "media vecinal de log1p(count_harm) en t+h-12", "t+h-12", "cell_month_harmonized"),
    ("est0", "1 si el mes t es estimado desde MODIS (no VIIRS observado)", "t", "cell_month_harmonized"),
    ("pr1", "precipitación media diaria (mm/día) en t", "t", "NASA POWER PRECTOTCORR"),
    ("pr3", "precipitación media t-2..t", "t-2..t", "NASA POWER PRECTOTCORR"),
    ("pr6", "precipitación media t-5..t", "t-5..t", "NASA POWER PRECTOTCORR"),
    ("pr12", "precipitación media t-11..t", "t-11..t", "NASA POWER PRECTOTCORR"),
    ("t2m", "temperatura media a 2 m en t", "t", "NASA POWER T2M"),
    ("tmax", "temperatura máxima media a 2 m en t", "t", "NASA POWER T2M_MAX"),
    ("rh", "humedad relativa a 2 m en t", "t", "NASA POWER RH2M"),
    ("ws", "viento a 2 m en t", "t", "NASA POWER WS2M"),
    ("gwr", "humedad de suelo en zona de raíces (0-1) en t", "t", "NASA POWER GWETROOT"),
    ("gwt", "humedad de suelo superficial (0-1) en t", "t", "NASA POWER GWETTOP"),
    ("vpd", "déficit de presión de vapor (kPa) en t, derivado de T2M y RH2M mensuales", "t", "NASA POWER"),
    ("vpd3", "VPD medio t-2..t", "t-2..t", "NASA POWER"),
    ("oni1", "ONI centrado en t-1 (temporada t-2..t)", "t", "NOAA CPC ONI"),
    ("oni4", "ONI centrado en t-4", "t-3", "NOAA CPC ONI"),
    ("lat", "latitud del centroide de la celda", "estática", "H3"),
    ("lon", "longitud del centroide de la celda", "estática", "H3"),
    ("logpop", "log1p(población a 10 km)", "estática", "cell_stats (INEGI/GeoNames)"),
    ("dist_loc", "distancia a la localidad más cercana (km)", "estática", "cell_stats"),
    ("in_anp", "1 si la celda está en un área protegida", "estática", "cell_stats (CONANP/WDPA)"),
    ("biome", "bioma IGBP agrupado (solo México y Argentina)", "estática", "cell_biome (MCD12Q1)"),
    ("igbp", "clase IGBP dominante (solo México y Argentina)", "estática", "cell_biome (MCD12Q1)"),
    ("clim_i", "media de log1p(count_harm) del mes de emisión en años ANTERIORES (climatología expansiva, >=3 años)", "años previos", "cell_month_harmonized"),
    ("z0", "anomalía estandarizada de log1p(count_harm) en t contra clim_i", "t", "derivada"),
    ("ratio0", "(conteo en t + 1) / (media de años previos del mismo mes + 1)", "t", "derivada"),
    ("clim_t", "media de log1p(count_harm) del mes objetivo en años anteriores al año objetivo", "<= t", "cell_month_harmonized"),
    ("sd_t", "desviación de la misma climatología expansiva del mes objetivo", "<= t", "cell_month_harmonized"),
    ("pr3_a … t2m_a", "anomalías estandarizadas de pr3, pr6, pr12, vpd, gwr, t2m contra el mismo mes de años previos", "t", "NASA POWER"),
    ("issue_month", "mes calendario de emisión", "t", "calendario"),
    ("target_month", "mes calendario objetivo (sin/cos en el modelo)", "t+h (conocido de antemano)", "calendario"),
]


def _month_index(year, month):
    return (np.asarray(year) - FIRST_YEAR) * 12 + np.asarray(month) - 1


def _rolling_sum(a: np.ndarray, k: int) -> np.ndarray:
    """Sum over the last k months (inclusive) along axis 1; NaN where the window starts before the series or
    contains a missing month (climate NaN is "no data", never zero)."""
    c = np.cumsum(np.concatenate([np.zeros((a.shape[0], 1), a.dtype), a], axis=1), axis=1)
    out = np.full(a.shape, np.nan, dtype=np.float32)
    out[:, k - 1:] = c[:, k:] - c[:, :-k]
    # cumsum propagates a NaN to every later month; recompute those windows directly
    bad = np.isnan(out[:, k - 1:])
    if bad.any():
        win = np.lib.stride_tricks.sliding_window_view(a, k, axis=1)
        out[:, k - 1:][bad] = win.sum(axis=2)[bad]
    return out


def _expanding(a: np.ndarray, min_years: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Mean and sd of the same calendar month over PREVIOUS years only (value at (y, m) uses years < y).
    Leak-free by construction: every month it reads is at least 12 months before the one it describes."""
    c, m = a.shape
    yrs = -(-m // 12)
    pad = np.full((c, yrs * 12), np.nan, np.float64)
    pad[:, :m] = a
    x = pad.reshape(c, yrs, 12)
    ok = ~np.isnan(x)
    s1 = np.cumsum(np.where(ok, x, 0), axis=1)
    s2 = np.cumsum(np.where(ok, x * x, 0), axis=1)
    n = np.cumsum(ok, axis=1)
    # shift one year: stats at year y come from years < y
    s1 = np.concatenate([np.zeros((c, 1, 12)), s1[:, :-1]], axis=1)
    s2 = np.concatenate([np.zeros((c, 1, 12)), s2[:, :-1]], axis=1)
    n = np.concatenate([np.zeros((c, 1, 12)), n[:, :-1]], axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(n >= min_years, s1 / n, np.nan)
        var = np.where(n >= min_years, (s2 - n * mean * mean) / np.maximum(n - 1, 1), np.nan)
    sd = np.sqrt(np.clip(var, 0, None))
    return (mean.reshape(c, -1)[:, :m].astype(np.float32), sd.reshape(c, -1)[:, :m].astype(np.float32))


def _shift(a: np.ndarray, lag: int) -> np.ndarray:
    """Value at t-lag (lag >= 0), NaN when out of range."""
    out = np.full(a.shape, np.nan, dtype=np.float32)
    out[:, lag:] = a[:, :a.shape[1] - lag] if lag else a
    return out


def _lead(a: np.ndarray, h: int) -> np.ndarray:
    out = np.full(a.shape, np.nan, dtype=np.float32)
    out[:, :a.shape[1] - h] = a[:, h:]
    return out


def _neighbour_mean(a: np.ndarray, nb: np.ndarray) -> np.ndarray:
    """Mean over neighbour rows (index -1 = outside the country, ignored)."""
    pad = np.vstack([a, np.full((1, a.shape[1]), np.nan, np.float32)])
    stack = pad[nb]  # cells x 6 x months
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(stack, axis=1).astype(np.float32)


def load_country(con, processed, country):
    sql = f"""SELECT h3_r6, year, month, count_harm, frp_harm, is_estimated
              FROM read_parquet({q(harmonized_glob(processed, country))}, hive_partitioning=true)
              WHERE year >= {FIRST_YEAR}"""
    recent = processed / "cell_month_recent" / country
    if any(recent.glob("year=*/*.parquet")):
        # provisional observed S-NPP months (pipeline.snpp_recent) replace estimated / missing months
        rglob = q(recent / "year=*" / "*.parquet")
        sql = f"""WITH h AS ({sql}),
                       r AS (SELECT h3_r6, year, month, count_harm, frp_harm, is_estimated
                             FROM read_parquet({rglob}, hive_partitioning=true))
                  SELECT h.* FROM h ANTI JOIN r USING (h3_r6, year, month)
                  UNION ALL SELECT * FROM r"""
    df = con.execute(sql).df()
    cells = np.sort(df.h3_r6.unique())
    ci = np.searchsorted(cells, df.h3_r6.to_numpy())
    mi = _month_index(df.year.to_numpy(), df.month.to_numpy())
    n_m = int(mi.max()) + 1
    N = np.full((len(cells), n_m), np.nan, np.float32)
    F = np.full_like(N, np.nan)
    E = np.ones_like(N)  # missing = not observed
    N[ci, mi] = df.count_harm.to_numpy(np.float32)
    F[ci, mi] = df.frp_harm.to_numpy(np.float32)
    E[ci, mi] = df.is_estimated.to_numpy(np.float32)
    return cells, N, F, E


def load_climate(con, processed, country, cells, n_m):
    fc = processed / "forecast"
    grid = con.execute(f"SELECT * FROM read_parquet({q(fc / 'power_grid_month.parquet')})").df()
    recent = fc / "power_grid_month_recent.parquet"
    if recent.is_file():  # current year from the POWER daily API (pipeline.forecast_climate --recent)
        r = con.execute(f"SELECT * FROM read_parquet({q(recent)})").df()
        grid = pd.concat([grid, r[grid.columns]], ignore_index=True).drop_duplicates(["lat", "lon", "year", "month"], keep="last")
    cmap = con.execute(f"SELECT * FROM read_parquet({q(fc / 'cell_power' / (country + '.parquet'))})").df()
    pts = grid[["lat", "lon"]].drop_duplicates().reset_index(drop=True)
    pts["pi"] = np.arange(len(pts))
    grid = grid.merge(pts, on=["lat", "lon"])
    cmap = cmap.merge(pts, on=["lat", "lon"], how="left").set_index("h3_r6").reindex(cells)
    assert cmap.pi.notna().all(), "cells without a POWER grid point"
    pidx = cmap.pi.to_numpy(int)
    mi = _month_index(grid.year.to_numpy(), grid.month.to_numpy())
    keep = mi < n_m
    out = {}
    for col in ["precip_mm_day", "t2m_c", "t2m_max_c", "rh_pct", "wind_ms", "gwetroot", "gwettop", "vpd_kpa"]:
        G = np.full((len(pts), n_m), np.nan, np.float32)
        G[grid.pi.to_numpy()[keep], mi[keep]] = grid[col].to_numpy(np.float32)[keep]
        out[col] = G
    return pidx, out


def load_static(con, processed, country, cells):
    st = pd.DataFrame({"h3_r6": cells})
    stats_glob = processed / "cell_stats" / country / "*.parquet"
    if any((processed / "cell_stats" / country).glob("*.parquet")):
        s = con.execute(f"""SELECT h3_r6, pop_10km, dist_locality_km, in_protected_area
                            FROM read_parquet({q(stats_glob)})""").df()
        st = st.merge(s, on="h3_r6", how="left")
    for col in ["pop_10km", "dist_locality_km", "in_protected_area"]:
        if col not in st:
            st[col] = np.nan
    bio = processed / "cell_biome" / f"{country}.parquet"
    if bio.is_file():
        st = st.merge(con.execute(f"SELECT h3_r6, igbp, biome FROM read_parquet({q(bio)})").df(), on="h3_r6", how="left")
    else:
        st["igbp"], st["biome"] = np.nan, np.nan
    ll = np.array([h3.cell_to_latlng(c) for c in cells], np.float32)
    return pd.DataFrame({
        "lat": ll[:, 0], "lon": ll[:, 1],
        "logpop": np.log1p(pd.to_numeric(st.pop_10km, errors="coerce")).astype(np.float32),
        "dist_loc": pd.to_numeric(st.dist_locality_km, errors="coerce").astype(np.float32),
        "in_anp": st.in_protected_area.astype("float32"),
        "biome": pd.to_numeric(st.biome, errors="coerce").astype(np.float32),
        "igbp": pd.to_numeric(st.igbp, errors="coerce").astype(np.float32),
    })


def neighbours(cells) -> np.ndarray:
    pos = {c: i for i, c in enumerate(cells)}
    nb = np.full((len(cells), 6), -1, np.int64)
    for i, c in enumerate(cells):
        for j, n in enumerate(list(h3.grid_ring(c, 1))[:6]):
            nb[i, j] = pos.get(n, -1)
    nb[nb < 0] = len(cells)  # padding row
    return nb


def oni_lagged(con, processed, n_m):
    oni = con.execute(f"SELECT year, month, oni FROM read_parquet({q(processed / 'context' / 'oni.parquet')})").df()
    series = np.full(n_m, np.nan, np.float32)
    mi = _month_index(oni.year.to_numpy(), oni.month.to_numpy())
    ok = (mi >= 0) & (mi < n_m)
    series[mi[ok]] = oni.oni.to_numpy(np.float32)[ok]
    s1 = np.full(n_m, np.nan, np.float32)
    s4 = np.full(n_m, np.nan, np.float32)
    s1[1:], s4[4:] = series[:-1], series[:-4]
    return s1, s4


def build(processed, country, force=False, memory_limit="2GB") -> dict:
    out_dir = processed / "forecast" / "panel" / country
    if out_dir.is_dir() and any(out_dir.glob("part-*.parquet")) and not force:
        return {"country": country, "skipped": True}
    con = connect(memory_limit, processed)
    try:
        cells, N, F, E = load_country(con, processed, country)
        n_m = N.shape[1]
        pidx, clim = load_climate(con, processed, country, cells, n_m)
        static = load_static(con, processed, country, cells)
        nb = neighbours(cells)
        oni1, oni4 = oni_lagged(con, processed, n_m)
        t0 = int(_month_index(*FIRST_ISSUE))
        issue = np.arange(t0, n_m)
        iy, im = FIRST_YEAR + issue // 12, issue % 12 + 1
        for old in out_dir.glob("part-*.parquet"):
            old.unlink()
        total = 0
        L = np.log1p(N)
        LS3 = np.log1p(_rolling_sum(N, 3))
        # climatology of the fire series from previous years only (fold-independent, leak-free)
        CM, CS = _expanding(L)
        CC, _ = _expanding(N)
        # climate series and their anomalies (previous years only), on the POWER grid, indexed per chunk later
        G = {"pr1": clim["precip_mm_day"], "t2m": clim["t2m_c"], "tmax": clim["t2m_max_c"], "rh": clim["rh_pct"],
             "ws": clim["wind_ms"], "gwr": clim["gwetroot"], "gwt": clim["gwettop"], "vpd": clim["vpd_kpa"]}
        G["pr3"] = _rolling_sum(G["pr1"], 3) / 3
        G["pr6"] = _rolling_sum(G["pr1"], 6) / 6
        G["pr12"] = _rolling_sum(G["pr1"], 12) / 12
        G["vpd3"] = _rolling_sum(G["vpd"], 3) / 3
        for v in ANOM_VARS:
            gm, gs = _expanding(G[v])
            with np.errstate(invalid="ignore", divide="ignore"):
                G[f"{v}_a"] = ((G[v] - gm) / np.where(gs > 0, gs, np.nan)).astype(np.float32)
        for part, a in enumerate(range(0, len(cells), CHUNK)):
            sl = slice(a, min(a + CHUNK, len(cells)))
            Lc, Nc = L[sl], N[sl]
            # neighbours need every cell: computed on the full matrix, rows sliced
            nb_l = _neighbour_mean(L, nb[sl])
            nb_s3 = _neighbour_mean(LS3, nb[sl])
            cols = {
                "l0": Lc, "l1": _shift(Lc, 1), "l2": _shift(Lc, 2),
                "s3": np.log1p(_rolling_sum(Nc, 3)), "s12": np.log1p(_rolling_sum(Nc, 12)),
                "frp0": np.log1p(F[sl]), "nb0": nb_l, "nb_s3": nb_s3, "est0": E[sl],
            }
            for h in HORIZONS:
                cols[f"ly_{h}"] = _shift(Lc, 12 - h)
                cols[f"nb_ly_{h}"] = _shift(nb_l, 12 - h)
                cols[f"y_{h}"] = _lead(Nc, h)
                cols[f"yest_{h}"] = _lead(E[sl], h)
                cols[f"yfrp_{h}"] = _lead(F[sl], h)
            for k, g in G.items():
                cols[k] = g[pidx[sl]]
            cm_i, cs_i = CM[sl], CS[sl]
            cols["clim_i"] = cm_i
            with np.errstate(invalid="ignore", divide="ignore"):
                cols["z0"] = (Lc - cm_i) / np.maximum(cs_i, 0.1)
                cols["ratio0"] = (Nc + 1) / (CC[sl] + 1)
            for h in HORIZONS:
                # target month t+h of previous years: indices <= t (see _expanding)
                cols[f"clim_t_{h}"] = _lead(CM[sl], h)
                cols[f"sd_t_{h}"] = _lead(CS[sl], h)
            n_c = sl.stop - sl.start
            frame = {"h3_r6": np.repeat(cells[sl], len(issue)),
                     "issue_year": np.tile(iy, n_c).astype(np.int16), "issue_month": np.tile(im, n_c).astype(np.int8)}
            for k, v in cols.items():
                frame[k] = v[:, issue].astype(np.float32).ravel()
            frame["oni1"] = np.tile(oni1[issue], n_c)
            frame["oni4"] = np.tile(oni4[issue], n_c)
            for k in static:
                frame[k] = np.repeat(static[k].to_numpy(np.float32)[sl], len(issue))
            df = pd.DataFrame(frame)
            df.insert(1, "country", country)
            con.register("_df", df)
            copy_atomic(con, "SELECT * FROM _df", out_dir / f"part-{part:02d}.parquet")
            con.unregister("_df")
            total += len(df)
            del df, frame, cols
        _check_no_leak()
    finally:
        con.close()
    return {"country": country, "cells": int(len(cells)), "issue_months": [f"{iy[0]}-{im[0]:02d}", f"{iy[-1]}-{im[-1]:02d}"],
            "rows": int(total), "output": str(out_dir)}


def _check_no_leak() -> None:
    """Synthetic check: a feature computed at t must not change when months > t change."""
    rng = np.random.default_rng(0)
    a = rng.random((3, 30)).astype(np.float32)
    b = a.copy()
    b[:, 20:] += 100
    for fn in (lambda x: _shift(x, 1), lambda x: _rolling_sum(x, 3), lambda x: _rolling_sum(x, 12),
               lambda x: _shift(x, 12 - 3)):
        np.testing.assert_array_equal(fn(a)[:, :20], fn(b)[:, :20])
    np.testing.assert_array_equal(_lead(a, 1)[:, :19], a[:, 1:20])
    long_a = rng.random((2, 120)).astype(np.float32)
    long_b = long_a.copy()
    long_b[:, 60:] += 100  # change everything from month 60 on
    for h in (1, 2, 3):  # clim of target t+h must not see months > t
        np.testing.assert_array_equal(_lead(_expanding(long_a)[0], h)[:, 36:60],
                                      _lead(_expanding(long_b)[0], h)[:, 36:60])


def write_dictionary(processed) -> None:
    dest = processed / "forecast" / "feature_dictionary.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["feature", "description", "lag", "source"])
        w.writerows(FEATURES)
        w.writerow(["b0 / q33 / q67", "climatología fija y terciles de los años de entrenamiento de cada partición "
                    "(solo líneas base y evaluación, pipeline.forecast_train)", "entrenamiento", "derivada"])


def main() -> None:
    a = parser(__doc__).parse_args()
    write_dictionary(a.processed)
    for country in a.country or countries(a.processed):
        print(build(a.processed, country, a.force, a.memory_limit), flush=True)


if __name__ == "__main__":
    main()
