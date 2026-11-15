"""Evaluate the 1-3 month fire outlook (docs/plan-modelo-predictivo.md §6) from the predictions of
pipeline.forecast_train. Every number in the report comes from here; nothing is typed by hand.

Reads  data/processed/forecast/predictions/main/{val,test}_h*.parquet, predictions/rolling/*.parquet
       data/processed/forecast/panel/ (only to compute the climatological tercile frequencies, training years)
Writes data/processed/forecast/metrics/
         metrics_by_horizon.csv        skill vs B0/B1/B2 per horizon, country and cell group (all / active)
         metrics_breakdown.csv         high season vs rest, per country and horizon
         metrics_rolling_origin.csv    per test year 2019-2025
         national_totals.csv           observed vs forecast monthly totals per country (test years)
         tercile_reliability.csv       reliability of P(above normal)
         interval_coverage.csv         10-90% interval coverage on the test years
         feature_importance.csv
       data/processed/forecast/forecast_summary.json   (headline numbers for the report, API and UI)

Probabilistic outputs (interval, terciles) come from the empirical distribution of validation-year (2022)
residuals, binned by predicted value: the test years never shape them. The tercile reference is the climatological
frequency of each category in the training years for that cell and month (not 1/3: with many zero months a
"below normal" category is often impossible, and 1/3 would be an unfairly weak reference).

    python -m pipeline.forecast_evaluate
"""
from __future__ import annotations

import json
from datetime import date

import numpy as np
import pandas as pd

from .forecast_train import FIRST_TARGET_YEAR
from .tables_common import connect, parser, q

ACTIVE_MEAN = 1.0  # active cell = training climatology >= 12 detections per year (mean >= 1 per month)
N_BINS = 20
QLO, QHI = 0.1, 0.9
METHODOLOGY_VERSION = "forecast-1.0"


def mse(a, b):
    return float(np.mean((np.asarray(a) - np.asarray(b)) ** 2)) if len(a) else float("nan")


def skill(df, col, ref):
    m, r = mse(df[col], df.y), mse(df[ref], df.y)
    return float(1 - m / r) if r > 0 else float("nan")


def _iso(x, y):
    """Isotonic (increasing) fit of an event frequency on x, stored as interpolation knots."""
    from sklearn.isotonic import IsotonicRegression
    if len(x) < 50:
        return np.array([0.0, 1.0]), np.array([float(np.mean(y)) if len(y) else 0.0] * 2)
    if len(x) > 400_000:  # knots are what matters; a seeded sample keeps it fast
        idx = np.random.default_rng(0).choice(len(x), 400_000, replace=False)
        x, y = x[idx], y[idx]
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(x, y)
    return iso.X_thresholds_.astype(np.float64), iso.y_thresholds_.astype(np.float64)


def residual_model(val: pd.DataFrame) -> dict:
    """Calibration learnt on the validation year only:
    * interval: residual sample per bin of the predicted value (10-90% band);
    * terciles: isotonic P(count > q67) on (pred - log1p(q67)), separately for cells whose "normal" is 0
      (q67 = 0, the event is "any fire") and the rest, and P(count < q33) on (log1p(q33) - pred) where q33 > 0.
      Adding residuals to the prediction would ignore the point mass at zero and inflate P(above)."""
    edges = np.unique(np.quantile(val.model, np.linspace(0, 1, N_BINS + 1)))
    bins = np.clip(np.searchsorted(edges, val.model, side="right") - 1, 0, len(edges) - 2)
    res = (val.y - val.model).to_numpy()
    cal = {"edges": edges, **{f"s{b}": np.sort(res[bins == b]) for b in range(len(edges) - 1)}}
    count = np.expm1(val.y.to_numpy())
    pred = val.model.to_numpy()
    t33, t67 = np.log1p(val.q33.to_numpy()), np.log1p(val.q67.to_numpy())
    above = (count > val.q67.to_numpy() + 1e-9).astype(float)
    below = (count < val.q33.to_numpy() - 1e-9).astype(float)
    z = val.q67.to_numpy() <= 0
    cal["ab0_x"], cal["ab0_y"] = _iso(pred[z] - t67[z], above[z])
    cal["ab1_x"], cal["ab1_y"] = _iso(pred[~z] - t67[~z], above[~z])
    pos = val.q33.to_numpy() > 0
    cal["be_x"], cal["be_y"] = _iso(t33[pos] - pred[pos], below[pos])
    return cal


def probabilistic(df: pd.DataFrame, cal: dict) -> pd.DataFrame:
    edges = cal["edges"]
    samples = [cal[f"s{b}"] for b in range(len(edges) - 1)]
    bins = np.clip(np.searchsorted(edges, df.model, side="right") - 1, 0, len(edges) - 2)
    lo = np.zeros(len(df), np.float32)
    hi = np.zeros(len(df), np.float32)
    pred = df.model.to_numpy()
    for b, s in enumerate(samples):
        idx = np.where(bins == b)[0]
        if not len(idx) or not len(s):
            continue
        lo[idx] = np.clip(pred[idx] + np.quantile(s, QLO), 0, None)
        hi[idx] = np.clip(pred[idx] + np.quantile(s, QHI), 0, None)
    t33, t67 = np.log1p(df.q33.to_numpy()), np.log1p(df.q67.to_numpy())
    z = df.q67.to_numpy() <= 0
    p_above = np.where(z, np.interp(pred - t67, cal["ab0_x"], cal["ab0_y"]),
                       np.interp(pred - t67, cal["ab1_x"], cal["ab1_y"]))
    p_below = np.where(df.q33.to_numpy() > 0, np.interp(t33 - pred, cal["be_x"], cal["be_y"]), 0.0)
    total = p_below + p_above
    scale = np.where(total > 1, 1 / np.maximum(total, 1e-9), 1.0)
    out = df.copy()
    out["lo"], out["hi"] = lo, hi
    out["p_below"] = (p_below * scale).astype(np.float32)
    out["p_above"] = (p_above * scale).astype(np.float32)
    out["p_near"] = np.clip(1 - out.p_below - out.p_above, 0, 1).astype(np.float32)
    return out


def expected_counts(pred: np.ndarray, cal: dict, nq: int = 200, chunk: int = 200_000) -> np.ndarray:
    """Expected count from a log1p prediction: mean of expm1(clip(pred + r, 0)) over the validation residuals r of
    its prediction bin. Replaces a single smearing factor, whose bias depends on the prediction level (it inflated
    the totals of countries with many small predictions)."""
    edges = cal["edges"]
    pred = np.asarray(pred, dtype=np.float64)
    out = np.zeros(len(pred))
    bins = np.clip(np.searchsorted(edges, pred, side="right") - 1, 0, len(edges) - 2)
    for b in range(len(edges) - 1):
        s = cal[f"s{b}"]
        idx = np.where(bins == b)[0]
        if not len(idx) or not len(s):
            continue
        qs = np.quantile(s, (np.arange(nq) + 0.5) / nq)
        for a in range(0, len(idx), chunk):
            j = idx[a:a + chunk]
            out[j] = np.expm1(np.clip(pred[j, None] + qs[None, :], 0, None)).mean(axis=1)
    return out.astype(np.float32)


def category(count, q33, q67):
    return np.where(count < q33 - 1e-9, 0, np.where(count > q67 + 1e-9, 2, 1))


def clim_category_freq(con, processed) -> pd.DataFrame:
    """Frequency of below / above in the training years (2012-2021) per cell and calendar month."""
    glob = processed / "forecast" / "panel" / "*" / "*.parquet"
    return con.execute(f"""
        WITH x AS (SELECT h3_r6, issue_month AS m, exp(l0) - 1 AS c FROM read_parquet({q(glob)})
                   WHERE issue_year BETWEEN {FIRST_TARGET_YEAR} AND 2021 AND est0 = 0),
             t AS (SELECT h3_r6, m, quantile_cont(c, 1/3) AS q33, quantile_cont(c, 2/3) AS q67 FROM x GROUP BY 1, 2)
        SELECT x.h3_r6, x.m AS target_month,
               avg(CASE WHEN c < q33 - 1e-9 THEN 1 ELSE 0 END)::FLOAT AS f_below,
               avg(CASE WHEN c > q67 + 1e-9 THEN 1 ELSE 0 END)::FLOAT AS f_above
        FROM x JOIN t USING (h3_r6, m) GROUP BY 1, 2""").df()


def rps(p_below, p_above, obs):
    f1, f2 = p_below, 1 - p_above
    o1, o2 = (obs == 0).astype(float), (obs <= 1).astype(float)
    return (f1 - o1) ** 2 + (f2 - o2) ** 2


def capture_at(df, col, frac=0.10):
    """Share of observed detections inside the top `frac` cells by `col`, per country and target month."""
    got = tot = 0.0
    for _, g in df.groupby(["country", "target_year", "target_month"]):
        obs = np.expm1(g.y.to_numpy())
        if obs.sum() <= 0:
            continue
        k = max(1, int(round(frac * len(g))))
        top = np.argsort(-g[col].to_numpy(), kind="stable")[:k]
        got += obs[top].sum()
        tot += obs.sum()
    return float(got / tot) if tot else float("nan")


def high_season(test: pd.DataFrame) -> dict:
    """The five calendar months with the largest climatological total, per country."""
    t = test.groupby(["country", "target_month"]).clim_count_t.sum().reset_index()
    return {c: sorted(g.nlargest(5, "clim_count_t").target_month.astype(int).tolist()) for c, g in t.groupby("country")}


def evaluate(processed) -> dict:
    fc = processed / "forecast"
    out = fc / "metrics"
    out.mkdir(parents=True, exist_ok=True)
    con = connect("3GB", processed)
    freq = clim_category_freq(con, processed)
    rows, breakdown, totals, reliab, cover, imps = [], [], [], [], [], []
    summary = {"methodology_version": METHODOLOGY_VERSION, "generated": date.today().isoformat(),
               "split": {"train": [2012, 2021], "validation": 2022, "test": [2023, 2025]},
               "horizons": {}}
    for h in (1, 2, 3):
        vp, tp = fc / "predictions" / "main" / f"val_h{h}.parquet", fc / "predictions" / "main" / f"test_h{h}.parquet"
        if not tp.is_file():
            continue
        val = con.execute(f"SELECT * FROM read_parquet({q(vp)})").df()
        test = con.execute(f"SELECT * FROM read_parquet({q(tp)})").df()
        cal = residual_model(val)
        test = probabilistic(test, cal)
        test = test.merge(freq, on=["h3_r6", "target_month"], how="left")
        cell_active = test.groupby("h3_r6").clim_count_t.mean() >= ACTIVE_MEAN
        test["active"] = test.h3_r6.map(cell_active)
        seasons = high_season(test)
        test["season"] = [m in seasons.get(c, []) for c, m in zip(test.country, test.target_month)]
        chosen = "m1t" if (test.model == test.m1t).all() else "m1"
        for country in ["Todos"] + sorted(test.country.unique()):
            g0 = test if country == "Todos" else test[test.country == country]
            for group, g in (("todas", g0), ("activas", g0[g0.active])):
                if not len(g):
                    continue
                r = {"horizon": h, "country": country, "cells": group, "rows": len(g),
                     "mse_model": mse(g.model, g.y), "mse_b0": mse(g.b0, g.y), "mse_b1": mse(g.b1, g.y),
                     "mse_b2": mse(g.b2, g.y), "mae_model": float(np.mean(np.abs(g.model - g.y))),
                     "mae_b0": float(np.mean(np.abs(g.b0 - g.y))),
                     "skill_vs_b0": skill(g, "model", "b0"), "skill_vs_b1": skill(g, "model", "b1"),
                     "skill_vs_b2": skill(g, "model", "b2"), "skill_m1_vs_b0": skill(g, "m1", "b0"),
                     "skill_m1t_vs_b0": skill(g, "m1t", "b0"), "skill_b1_vs_b0": skill(g, "b1", "b0"),
                     "capture10_model": capture_at(g, "model"), "capture10_b0": capture_at(g, "b0"),
                     "interval_coverage": float(np.mean((g.y >= g.lo - 1e-6) & (g.y <= g.hi + 1e-6)))}
                obs = category(np.expm1(g.y), g.q33, g.q67)
                ok = g.f_below.notna()
                rm = rps(g.p_below[ok], g.p_above[ok], obs[ok])
                rc = rps(g.f_below[ok], g.f_above[ok], obs[ok])
                r["rpss_vs_clim"] = float(1 - rm.mean() / rc.mean()) if rc.mean() > 0 else float("nan")
                r["tercile_hit"] = float(np.mean(np.argmax(np.c_[g.p_below, g.p_near, g.p_above], 1) == obs))
                # Spearman per active cell over time (median)
                if group == "activas":
                    sp = g.groupby("h3_r6")[["model", "y"]].corr(method="spearman").xs("model", level=1)["y"]
                    r["spearman_cell_median"] = float(sp.dropna().median()) if sp.notna().any() else float("nan")
                rows.append(r)
            for season, g in g0.groupby("season"):
                breakdown.append({"horizon": h, "country": country, "season": "alta" if season else "resto",
                                  "rows": len(g), "skill_vs_b0": skill(g, "model", "b0"),
                                  "skill_vs_b1": skill(g, "model", "b1")})
        # national monthly totals (counts): the log1p prediction is back-transformed to an expected count with the
        # validation residuals of its bin (expected_counts); a tweedie model already predicts the mean
        smear = 1.0
        pred_c = expected_counts(test.model.to_numpy(), cal) if chosen == "m1" else np.expm1(test.model)
        tt = test.assign(obs=np.expm1(test.y), pred=pred_c, clim=test.clim_count_t,
                         lo_c=np.expm1(test.lo), hi_c=np.expm1(test.hi))
        nat = tt.groupby(["country", "target_year", "target_month"])[["obs", "pred", "clim"]].sum().reset_index()
        nat["horizon"] = h
        totals.append(nat)
        summary["horizons"][h] = {
            "chosen_model": "LightGBM tweedie" if chosen == "m1t" else "LightGBM log1p",
            "national_corr": {
                c: {"model": float(np.corrcoef(g.obs, g.pred)[0, 1]), "climatology": float(np.corrcoef(g.obs, g.clim)[0, 1]),
                    "mape_model": float((abs(g.pred - g.obs) / g.obs.clip(lower=1)).median()),
                    "mape_climatology": float((abs(g.clim - g.obs) / g.obs.clip(lower=1)).median()),
                    "bias_model": float(g.pred.sum() / g.obs.sum()), "bias_climatology": float(g.clim.sum() / g.obs.sum())}
                for c, g in nat.groupby("country") if g.obs.std() > 0}}
        bins = np.linspace(0, 1, 11)
        test["pb"] = np.clip(np.digitize(test.p_above, bins) - 1, 0, 9)
        rel = test.assign(obs_above=(category(np.expm1(test.y), test.q33, test.q67) == 2).astype(float)) \
            .groupby("pb").agg(p_mean=("p_above", "mean"), obs_freq=("obs_above", "mean"), n=("y", "size")).reset_index()
        rel["horizon"] = h
        reliab.append(rel)
        cv = test.groupby("country").apply(lambda g: float(np.mean((g.y >= g.lo - 1e-6) & (g.y <= g.hi + 1e-6))),
                                           include_groups=False).rename("coverage").reset_index()
        cv["horizon"], cv["nominal"] = h, QHI - QLO
        cover.append(cv)
        ip = fc / "predictions" / "main" / f"importance_h{h}.parquet"
        if ip.is_file():
            imps.append(con.execute(f"SELECT * FROM read_parquet({q(ip)})").df())
        summary["horizons"][h]["seasons"] = seasons
        # residual model kept for the export of live forecasts
        np.savez(out / f"residuals_h{h}.npz", smear=smear, **cal)
    rolling = []
    for p in sorted((fc / "predictions" / "rolling").glob("y*_h*.parquet")):
        d = con.execute(f"SELECT * FROM read_parquet({q(p)})").df()
        for country in ["Todos"] + sorted(d.country.unique()):
            g = d if country == "Todos" else d[d.country == country]
            rolling.append({"test_year": int(d.target_year.iloc[0]), "horizon": int(d.horizon.iloc[0]),
                            "country": country, "rows": len(g), "skill_vs_b0": skill(g, "model", "b0"),
                            "skill_vs_b1": skill(g, "model", "b1"), "capture10_model": capture_at(g, "model"),
                            "capture10_b0": capture_at(g, "b0")})
    con.close()
    m = pd.DataFrame(rows)
    m.to_csv(out / "metrics_by_horizon.csv", index=False)
    pd.DataFrame(breakdown).to_csv(out / "metrics_breakdown.csv", index=False)
    if rolling:
        pd.DataFrame(rolling).to_csv(out / "metrics_rolling_origin.csv", index=False)
    if totals:
        pd.concat(totals).to_csv(out / "national_totals.csv", index=False)
        pd.concat(reliab).to_csv(out / "tercile_reliability.csv", index=False)
        pd.concat(cover).to_csv(out / "interval_coverage.csv", index=False)
    if imps:
        pd.concat(imps).to_csv(out / "feature_importance.csv", index=False)
    # verdict per country and horizon (regla de oro): the app only shows the model where it beats climatology
    verdict = {}
    for r in m[m.cells == "todas"].itertuples():
        verdict.setdefault(r.country, {})[int(r.horizon)] = bool(r.skill_vs_b0 > 0 and r.rpss_vs_clim > 0)
    summary["beats_climatology"] = verdict
    # national totals are a different product: summing cells can lose to climatology even where cells win
    summary["totals_beat_climatology"] = {
        c: {str(h): bool(v["national_corr"][c]["mape_model"] < v["national_corr"][c]["mape_climatology"])
            for h, v in summary["horizons"].items() if c in v["national_corr"]}
        for c in sorted({c for v in summary["horizons"].values() for c in v["national_corr"]})}
    summary["headline"] = m[(m.country == "Todos")].to_dict(orient="records")
    summary["by_country"] = m[m.cells == "todas"].to_dict(orient="records")
    (fc / "forecast_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False, default=float))
    return summary


def main() -> None:
    a = parser(__doc__).parse_args()
    s = evaluate(a.processed)
    for r in s["headline"]:
        print(f"h={r['horizon']} {r['cells']:8s} skill_b0={r['skill_vs_b0']:+.3f} skill_b1={r['skill_vs_b1']:+.3f} "
              f"rpss={r['rpss_vs_clim']:+.3f} cap10={r['capture10_model']:.3f} (b0 {r['capture10_b0']:.3f}) "
              f"cov={r['interval_coverage']:.2f}")
    print("beats_climatology:", json.dumps(s["beats_climatology"]))


if __name__ == "__main__":
    main()
