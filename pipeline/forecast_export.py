"""Tables of the 1-3 month fire outlook for the app, API, bot and MCP (docs/plan-modelo-predictivo.md §11, §14).

Reads  data/processed/forecast/predictions/main/test_h*.parquet, train_log.json, metrics/residuals_h*.npz,
       forecast_summary.json (pipeline.forecast_train / forecast_evaluate), panel/, geo/<Country>/admin_cells.parquet
Writes data/processed/forecast/forecast_cell.parquet
         h3_r6, country, kind ('backtest' | 'forecast'), issue_year, issue_month, target_year, target_month, horizon,
         pred, pred_lo, pred_hi, clim, obs, p_below, p_near, p_above, q33, q67, model_version
       data/processed/forecast/forecast_area.parquet
         level ('country' | admin level), code, country, kind, issue/target, horizon, pred, clim, obs, ratio,
         model_version
       data/processed/forecast/models/final_h<h>.txt

* 'backtest' rows: test years 2023-2025 of the main split (model trained 2012-2021), with the observation.
* 'forecast' rows: final model retrained on every observed target year 2012..FINAL_YEAR (climatology recomputed
  with those years, decision 3.5), issued every month from FINAL_YEAR-12 up to the last month of each country with
  observed fire AND climate (2026 months come from pipeline.snpp_recent and POWER daily: provisional). The latest
  issue is the live outlook; earlier issues whose targets are already observed carry `obs`: a true out-of-sample
  check (plan §9), summarised in forecast_summary.json["oos_2026"].
* Counts: pred is the expected count: tweedie predicts it; a log1p prediction is back-transformed with the
  validation residuals of its prediction bin (forecast_evaluate.expected_counts); pred_lo/pred_hi are the 10-90% band from validation-year residuals. Cells with no fire in the training years
  are not listed: their outlook is the climatology (0 detections).
* Area totals are sums of cell values; tercile probabilities are only published per cell (summing cell
  probabilities would be wrong).

    python -m pipeline.forecast_export [--force]
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from .forecast_evaluate import METHODOLOGY_VERSION, expected_counts, probabilistic
from .forecast_train import FIRST_TARGET_YEAR, build_climatology, baselines, fetch, fit, open_panel, predict, save
from .tables_common import connect, copy_atomic, parser, q

FINAL_YEAR = 2025
COLS = ["h3_r6", "country", "kind", "issue_year", "issue_month", "target_year", "target_month", "horizon",
        "pred", "pred_lo", "pred_hi", "clim", "obs", "p_below", "p_near", "p_above", "q33", "q67", "model_version"]


def residuals(fc, h):
    z = np.load(fc / "metrics" / f"residuals_h{h}.npz")
    return {k: z[k] for k in z.files if k != "smear"}, float(z["smear"])


def to_counts(df, cal, tweedie):
    df["pred"] = (np.expm1(df.model) if tweedie else expected_counts(df.model.to_numpy(), cal)).astype("float32")
    df["pred_lo"] = np.expm1(df.lo).astype("float32")
    df["pred_hi"] = np.expm1(df.hi).astype("float32")
    df["clim"] = df.clim_count_t.astype("float32")
    df["obs"] = np.expm1(df.y).astype("float32")
    df["model_version"] = METHODOLOGY_VERSION
    return df


def latest_issue(con) -> dict:
    """Last issue month per country with observed fire (est0 = 0) and climate (pr1 not null)."""
    rows = con.execute("""SELECT country, max(issue_year::INTEGER * 100 + issue_month) FROM panel
                          WHERE est0 = 0 AND pr1 IS NOT NULL GROUP BY 1""").fetchall()
    return {c: (v // 100, v % 100) for c, v in rows}


def build(processed, force=False, memory_limit="2GB") -> dict:
    fc = processed / "forecast"
    dest = fc / "forecast_cell.parquet"
    if dest.is_file() and not force:
        return {"skipped": True, "output": str(dest)}
    log = json.loads((fc / "train_log.json").read_text())
    con = connect(memory_limit, processed)
    parts, report = [], {"forecast_issues": {}, "oos_2026": {}}
    stage = fc / "_export"
    stage.mkdir(exist_ok=True)

    def put(df, name):  # each part goes to disk at once: holding 13 M rows in pandas does not fit in memory
        df = df[COLS].copy()
        for c in ("issue_year", "target_year"):
            df[c] = df[c].astype("int16")
        for c in ("issue_month", "target_month", "horizon"):
            df[c] = df[c].astype("int8")
        path = stage / f"{name}.parquet"
        save(con, df, path)
        parts.append(path)
    try:
        open_panel(con, processed)
        issues = latest_issue(con)
        report["forecast_issues"] = {c: f"{y}-{m:02d}" for c, (y, m) in issues.items()}
        for h in (1, 2, 3):
            main = log[f"main_h{h}"]
            best = main["chosen"]
            tweedie = best == "m1t"
            cal, _ = residuals(fc, h)
            # backtest rows
            test = con.execute(f"SELECT * FROM read_parquet({q(fc / 'predictions' / 'main' / f'test_h{h}.parquet')})").df()
            test = to_counts(probabilistic(test, cal), cal, tweedie)
            test["kind"] = "backtest"
            put(test, f"backtest_h{h}")
            del test
            # final model on every observed year
            build_climatology(con, FINAL_YEAR)
            train = fetch(con, h, FIRST_TARGET_YEAR, FINAL_YEAR, train=True)
            model = fit(train, None, "tweedie" if tweedie else "l2", max(100, int(main[best]["best_iteration"] * 1.1)))
            del train
            model.save_model(str(fc / "models" / f"final_h{h}.txt"))
            # every issue month after the training data: the latest one is the live outlook, the earlier ones
            # (targets already observed in 2026) are a true out-of-sample check
            where = " OR ".join(f"(p.country = '{c}' AND p.issue_year::INTEGER * 100 + p.issue_month BETWEEN "
                                f"{FINAL_YEAR * 100 + 12} AND {y * 100 + m})" for c, (y, m) in issues.items())
            live = baselines(fetch(con, h, 0, 0, train=False, where=f"({where})"))
            live["model"] = predict(model, live, "tweedie" if tweedie else "l2")
            live = probabilistic(live, cal)
            seen = live[live.y.notna()]
            if len(seen):
                mse_m = float(np.mean((seen.model - seen.y) ** 2))
                mse_b = float(np.mean((seen.b0 - seen.y) ** 2))
                report["oos_2026"][h] = {"rows": int(len(seen)), "skill_vs_climatology": 1 - mse_m / mse_b if mse_b else None,
                                         "targets": [f"{seen.target_year.min()}-{seen[seen.target_year == seen.target_year.min()].target_month.min():02d}",
                                                     f"{seen.target_year.max()}-{seen[seen.target_year == seen.target_year.max()].target_month.max():02d}"]}
            live = to_counts(live, cal, tweedie)
            live["kind"] = "forecast"
            live["horizon"] = h
            report[f"h{h}"] = {"forecast_rows": len(live), "observed_targets": int(live.obs.notna().sum())}
            put(live, f"forecast_h{h}")
            del live, seen
        files = "[" + ", ".join(q(p) for p in parts) + "]"
        copy_atomic(con, f"SELECT * FROM read_parquet({files}) ORDER BY kind, country, h3_r6, issue_year, issue_month, horizon", dest)
        n_area = areas(con, processed, dest, fc / "forecast_area.parquet")
        n_cell = con.execute(f"SELECT count(*) FROM read_parquet({q(dest)})").fetchone()[0]
        for p in parts:
            p.unlink()
        stage.rmdir()
        report.update(rows_cell=int(n_cell), rows_area=int(n_area), output=str(dest))
    finally:
        con.close()
    summary_path = fc / "forecast_summary.json"
    if summary_path.is_file():
        s = json.loads(summary_path.read_text())
        s["forecast_issues"] = report["forecast_issues"]
        s["oos_2026"] = report["oos_2026"]
        s["provisional_note"] = ("Meses de 2026 posteriores a la tabla armonizada: conteos S-NPP observados (archivo SP "
                                 "hasta julio, NRT con máscara de fuentes estáticas después; pipeline.snpp_recent) y clima "
                                 "de NASA POWER diario agregado a mes. Provisionales.")
        summary_path.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    return report


def areas(con, processed, cell_path, dest) -> int:
    """Sums per country and per admin unit (Mexico, Argentina) of the cell table, in SQL."""
    keys = "country, kind, issue_year, issue_month, target_year, target_month, horizon"
    selects = [f"""SELECT 'country' AS level, country AS code, {keys}, sum(pred) AS pred, sum(clim) AS clim,
                          sum(obs) AS obs FROM read_parquet({q(cell_path)}) GROUP BY ALL"""]
    for country in sorted(p.name for p in (processed / "geo").iterdir() if p.is_dir()) if (processed / "geo").is_dir() else []:
        adm = processed / "geo" / country / "admin_cells.parquet"
        if adm.is_file():
            selects.append(f"""SELECT a.level, a.code, {', '.join('c.' + k.strip() for k in keys.split(','))},
                                      sum(c.pred), sum(c.clim), sum(c.obs)
                               FROM read_parquet({q(cell_path)}) c JOIN read_parquet({q(adm)}) a USING (h3_r6)
                               WHERE c.country = '{country}' GROUP BY ALL""")
    sql = f"""SELECT *, (pred / nullif(clim, 0))::FLOAT AS ratio, '{METHODOLOGY_VERSION}' AS model_version
              FROM ({' UNION ALL '.join(selects)})"""
    copy_atomic(con, sql, dest)
    return con.execute(f"SELECT count(*) FROM read_parquet({q(dest)})").fetchone()[0]


def main() -> None:
    a = parser(__doc__).parse_args()
    print(json.dumps(build(a.processed, a.force, a.memory_limit), indent=2), flush=True)


if __name__ == "__main__":
    main()
