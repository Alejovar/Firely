"""Train and back-test the 1-3 month fire outlook (docs/plan-modelo-predictivo.md §5, §6, §14).

Reads  data/processed/forecast/panel/<Country>/*.parquet   (pipeline.forecast_features)
Writes data/processed/forecast/predictions/<split>/h<h>.parquet   (validation + test rows, every model)
       data/processed/forecast/models/<split>_h<h>.txt            (LightGBM model)
       data/processed/forecast/train_log.json

Unit: cell x issue month t x horizon h (one model per horizon, pooled over the six countries; `country` enters as a
categorical feature). Target: log1p(count_harm) of month t+h; months estimated from MODIS (yest_h = 1) are never
targets, only lags (decision 3.2).

Model features come from the panel; its climatologies are expanding (previous years only). The fixed climatology of
the TRAINING target years (decision 3.5) is computed here only for the baselines and the evaluation:
  clim_fixed      mean log1p(count) for the cell and target calendar month (B0)
  clim_count_t    mean count (B1, area totals)        q33 / q67   tercile thresholds of the monthly count

Models
  B0  climatology: clim_fixed                                  B2  same month last year: ly_h
  B1  persistence of the anomaly: log1p(mean_count_t * clip(ratio0, 0.25, 4))
  M1  LightGBM regression on log1p (l2)                    M1t LightGBM tweedie on the count (predicts the mean)

Cells without a single detection in the training years are not modelled: their forecast is the climatology (0).
Zero-target rows (92% of the panel) are subsampled 1 in ZERO_KEEP with weight ZERO_KEEP in TRAINING only (unbiased
in expectation, fits in memory); validation and test keep every row.

Splits
  main          train target years 2012-2021, validation 2022 (early stopping), test 2023-2025
  roll<Y>       train 2012..Y-1 with the main split's best iteration, test Y (Y = 2019..2025, model M1 only)

    python -m pipeline.forecast_train [--split main|rolling|all] [--horizons 1 2 3] [--force]
"""
from __future__ import annotations

import json
import time

import lightgbm as lgb
import numpy as np
import pandas as pd

from .tables_common import connect, copy_atomic, parser, q

SEED = 20261115
ZERO_KEEP = 8  # training keeps every row with fire and 1 in ZERO_KEEP zero-target rows (weight ZERO_KEEP)
FIRST_TARGET_YEAR = 2012
CLIM_VARS = ["pr3", "pr6", "pr12", "vpd", "gwr", "t2m"]
BASE_FEATURES = ["l0", "l1", "l2", "s3", "s12", "frp0", "nb0", "nb_s3", "est0",
                 "pr1", "pr3", "pr6", "pr12", "t2m", "tmax", "rh", "ws", "gwr", "gwt", "vpd", "vpd3",
                 "oni1", "oni4", "lat", "lon", "logpop", "dist_loc", "in_anp", "biome", "igbp", "issue_month"]
FOLD_FEATURES = ["ly", "nb_ly", "clim_t", "sd_t", "clim_i", "z0", "ratio0", "tm_sin", "tm_cos", "country_code"] + \
                [f"{v}_a" for v in CLIM_VARS]  # per-horizon or derived columns (names kept from the first design)
FEATURES = BASE_FEATURES + FOLD_FEATURES
COUNTRIES = ["Argentina", "Bolivia", "Chile", "Mexico", "Paraguay", "Uruguay"]
PARAMS = {"learning_rate": 0.05, "num_leaves": 63, "min_data_in_leaf": 200, "feature_fraction": 0.8,
          "bagging_fraction": 0.8, "bagging_freq": 1, "lambda_l2": 1.0, "seed": SEED, "verbose": -1,
          "num_threads": 10, "deterministic": True, "force_col_wise": True}
ROUNDS, EARLY = 3000, 100


def open_panel(con, processed):
    glob = processed / "forecast" / "panel" / "*" / "*.parquet"
    con.execute(f"CREATE OR REPLACE VIEW panel AS SELECT * FROM read_parquet({q(glob)})")


CLIM_END = {"year": None}  # last training year of the climatology currently loaded


def build_climatology(con, train_end: int) -> None:
    """Fixed climatology of the training years (decision 3.5): B0, B1, terciles and the set of modelled cells.
    It is NOT a model feature: inside the training rows it would contain their own target (a leave-one-out version
    leaks too). The model uses the expanding climatologies of the panel instead."""
    con.execute(f"""CREATE OR REPLACE TEMP TABLE clim AS
        SELECT h3_r6, issue_month AS m, count(*) AS n, sum(l0) AS sl, sum(l0 * l0) AS sl2, sum(exp(l0) - 1) AS sc,
               quantile_cont(exp(l0) - 1, 1/3) AS q33, quantile_cont(exp(l0) - 1, 2/3) AS q67
        FROM panel WHERE issue_year BETWEEN {FIRST_TARGET_YEAR} AND {train_end} AND est0 = 0
        GROUP BY 1, 2""")
    con.execute("""CREATE OR REPLACE TEMP TABLE active AS
                   SELECT h3_r6 FROM clim GROUP BY 1 HAVING sum(sc) > 0""")
    CLIM_END["year"] = train_end


def fetch(con, h: int, year_lo: int, year_hi: int, train: bool, where: str | None = None) -> pd.DataFrame:
    """Rows whose TARGET year is in [year_lo, year_hi], with fold features joined. `where` replaces the target
    filter (used by the export to fetch issue months whose targets are still unknown)."""
    ty = f"(issue_year + (issue_month - 1 + {h}) // 12)"
    tm = f"((issue_month - 1 + {h}) % 12 + 1)"
    base = ", ".join(f"p.{c}" for c in BASE_FEATURES if c != "issue_month")
    anoms = ", ".join(f"p.{v}_a" for v in CLIM_VARS)
    fixed_mean = "(ct.sl / ct.n)"
    zero = f"(p.y_{h} = 0)"
    sample = (f"AND (NOT {zero} OR hash(p.h3_r6, p.issue_year, p.issue_month, {h}) % {ZERO_KEEP} = 0)"
              if train else "")
    weight = f"CASE WHEN {zero} THEN {ZERO_KEEP} ELSE 1 END" if train else "1"
    cc = "CASE p.country " + " ".join(f"WHEN '{c}' THEN {i}" for i, c in enumerate(COUNTRIES)) + " END"
    sql = f"""SELECT p.h3_r6, p.country, p.issue_year, p.issue_month::INTEGER AS issue_month,
                     {ty} AS target_year, {tm} AS target_month, {base},
                     p.ly_{h} AS ly, p.nb_ly_{h} AS nb_ly,
                     p.clim_t_{h} AS clim_t, p.sd_t_{h} AS sd_t, p.clim_i, p.z0, p.ratio0,
                     sin(2 * pi() * {tm} / 12) AS tm_sin, cos(2 * pi() * {tm} / 12) AS tm_cos,
                     {cc} AS country_code, {anoms},
                     ln(1 + p.y_{h}) AS y, {fixed_mean} AS clim_fixed, ct.sc / ct.n AS clim_count_t, ct.q33, ct.q67, {weight} AS w
              FROM panel p
              JOIN active a USING (h3_r6)
              JOIN clim ct ON ct.h3_r6 = p.h3_r6 AND ct.m = {tm}
              WHERE {where or f"{ty} BETWEEN {year_lo} AND {year_hi} AND p.yest_{h} = 0 AND p.y_{h} IS NOT NULL"}
              {sample}"""
    keys = ("h3_r6", "country", "issue_year", "issue_month", "target_year", "target_month")
    outer = (f"SELECT {', '.join(keys)}, COLUMNS(c -> c NOT IN {keys})::FLOAT "
             f"FROM ({sql})")
    return con.execute(outer).df()


def baselines(df: pd.DataFrame) -> pd.DataFrame:
    df["b0"] = df.clim_fixed
    df["b1"] = np.log1p(df.clim_count_t * np.clip(df.ratio0, 0.25, 4)).astype("float32")
    df["b2"] = df.ly
    return df


def _dataset(df, label, ref=None):
    return lgb.Dataset(df[FEATURES], label=label, weight=df.w, reference=ref,
                       categorical_feature=["country_code"], free_raw_data=True)


def fit(train, val, objective, rounds=None):
    params = dict(PARAMS)
    if objective == "tweedie":
        params.update(objective="tweedie", tweedie_variance_power=1.3, metric="tweedie")
        ytr, yva = np.expm1(train.y), (np.expm1(val.y) if val is not None else None)
    else:
        params.update(objective="regression", metric="l2")
        ytr, yva = train.y, (val.y if val is not None else None)
    dtr = _dataset(train, ytr)
    if val is not None:
        dva = _dataset(val, yva, dtr)
        model = lgb.train(params, dtr, ROUNDS, valid_sets=[dva],
                          callbacks=[lgb.early_stopping(EARLY, verbose=False), lgb.log_evaluation(0)])
    else:
        model = lgb.train(params, dtr, rounds)
    return model


def predict(model, df, objective):
    p = model.predict(df[FEATURES], num_iteration=model.best_iteration or None)
    return (np.log1p(np.clip(p, 0, None)) if objective == "tweedie" else np.clip(p, 0, None)).astype("float32")


KEEP = ["h3_r6", "country", "issue_year", "issue_month", "target_year", "target_month", "y", "clim_count_t", "clim_t",
        "q33", "q67", "b0", "b1", "b2"]


def save(con, df, dest):
    con.register("_df", df)
    try:
        copy_atomic(con, "SELECT * FROM _df", dest)
    finally:
        con.unregister("_df")


def run_main(con, processed, h, log):
    out = processed / "forecast"
    build_climatology(con, 2021)
    t0 = time.time()
    train = fetch(con, h, FIRST_TARGET_YEAR, 2021, train=True)
    val = baselines(fetch(con, h, 2022, 2022, train=False))
    entry = {"rows_train": len(train), "rows_val": len(val), "load_s": round(time.time() - t0, 1)}
    # anti-leakage asserts
    assert train.target_year.max() <= 2021 and val.target_year.min() == 2022
    models = {}
    for name, objective in (("m1", "l2"), ("m1t", "tweedie")):
        t1 = time.time()
        model = fit(train, val, objective)
        val[name] = predict(model, val, objective)
        models[name] = (model, objective)
        model.save_model(str(out / "models" / f"main_h{h}_{name}.txt"))
        entry[name] = {"best_iteration": model.best_iteration, "fit_s": round(time.time() - t1, 1),
                       "val_mse": float(np.mean((val[name] - val.y) ** 2))}
        if name == "m1":
            imp = pd.DataFrame({"feature": FEATURES, "gain": model.feature_importance("gain")})
            imp["horizon"] = h
            save(con, imp.sort_values("gain", ascending=False), out / "predictions" / "main" / f"importance_h{h}.parquet")
    del train
    test = baselines(fetch(con, h, 2023, 2025, train=False))
    assert test.target_year.min() >= 2023
    entry["rows_test"] = len(test)
    for name, (model, objective) in models.items():
        test[name] = predict(model, test, objective)
    del models
    entry["val_mse_b0"] = float(np.mean((val.b0 - val.y) ** 2))
    best = min(("m1", "m1t"), key=lambda k: entry[k]["val_mse"])
    entry["chosen"] = best
    for part, df in (("val", val), ("test", test)):
        df = df[KEEP + ["m1", "m1t"]].copy()
        df["model"] = df[best]
        df["horizon"] = h
        save(con, df, out / "predictions" / "main" / f"{part}_h{h}.parquet")
    log[f"main_h{h}"] = entry
    print(f"h={h}", json.dumps(entry), flush=True)


def run_rolling(con, processed, h, log, years=range(2019, 2026)):
    out = processed / "forecast"
    main = log.get(f"main_h{h}")
    if not main:
        raise SystemExit(f"run the main split for h={h} first")
    best = main["chosen"]
    objective = "tweedie" if best == "m1t" else "l2"
    rounds = max(100, int(main[best]["best_iteration"]))
    for y in years:
        dest = out / "predictions" / "rolling" / f"y{y}_h{h}.parquet"
        t1 = time.time()
        build_climatology(con, y - 1)
        train = baselines(fetch(con, h, FIRST_TARGET_YEAR, y - 1, train=True))
        test = baselines(fetch(con, h, y, y, train=False))
        assert train.target_year.max() < test.target_year.min()
        model = fit(train, None, objective, rounds)
        test["model"] = predict(model, test, objective)
        test["horizon"] = h
        save(con, test[KEEP + ["model", "horizon"]], dest)
        log[f"roll{y}_h{h}"] = {"rows_train": len(train), "rows_test": len(test), "rounds": rounds,
                                "objective": objective, "fit_s": round(time.time() - t1, 1)}
        print(f"roll {y} h={h}", json.dumps(log[f"roll{y}_h{h}"]), flush=True)
        del train, test, model


def main() -> None:
    p = parser(__doc__)
    p.add_argument("--split", choices=["main", "rolling", "all"], default="main")
    p.add_argument("--horizons", type=int, nargs="+", default=[1, 2, 3])
    p.add_argument("--years", type=int, nargs="+", default=None, help="rolling-origin test years")
    a = p.parse_args()
    out = a.processed / "forecast"
    (out / "models").mkdir(parents=True, exist_ok=True)
    log_path = out / "train_log.json"
    log = json.loads(log_path.read_text()) if log_path.is_file() else {}
    con = connect(a.memory_limit, a.processed)
    try:
        open_panel(con, a.processed)
        for h in a.horizons:
            if a.split in ("main", "all") and (a.force or f"main_h{h}" not in log):
                run_main(con, a.processed, h, log)
                log_path.write_text(json.dumps(log, indent=2))
            if a.split in ("rolling", "all"):
                run_rolling(con, a.processed, h, log, a.years or range(2019, 2026))
                log_path.write_text(json.dumps(log, indent=2))
    finally:
        con.close()


if __name__ == "__main__":
    main()
