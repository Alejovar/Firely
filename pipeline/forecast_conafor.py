"""External check of the outlook against CONAFOR reported fires (docs/plan-modelo-predictivo.md §6, Mexico).

Sums, per state and year of the test period (2023-2025), the back-test forecasts (forecast_cell.parquet,
kind = 'backtest'), the observed harmonized detections and the climatology, and correlates each one with the number
of fires CONAFOR reported for that state and year (country_factors.zip, conafor/conafor_state_year.csv; the same
source as pipeline.validation_extra). Detections are not fires (agricultural burns, several detections per fire):
the useful question is whether the forecast tracks the reports about as well as the observation does, and better
than the climatology.

Writes data/processed/forecast/metrics/conafor_forecast_check.csv and adds "conafor" to forecast_summary.json.

    python -m pipeline.forecast_conafor [--raw data/raw]
"""
from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from .tables_common import connect, parser, q
from .validation_extra import _fold

YEARS = (2023, 2025)


def state_codes(con, processed: Path, names) -> dict:
    units = con.execute(f"""SELECT code, name FROM read_parquet({q(processed / 'geo' / 'Mexico' / 'admin_units.parquet')})
                            WHERE level = 'ent'""").df()
    special = {"distrito federal": "ciudad de mexico", "estado de mexico": "mexico"}
    codes = {}
    for name in names:
        f = special.get(_fold(name), _fold(name))
        if f == "mexico":  # 'México' must not match 'Ciudad de México'
            hit = units[units.name.map(_fold) == "mexico"]
        else:
            hit = units[units.name.map(_fold).map(lambda u: u == f or u.startswith(f + " ") or f.startswith(u + " "))]
        if len(hit) == 1:
            codes[name] = str(hit.code.iloc[0])
    return codes


def build(processed: Path, raw: Path) -> dict:
    zpath = raw / "country_factors.zip"
    if not zpath.is_file():
        raise FileNotFoundError(f"{zpath} not found (CONAFOR state-year totals)")
    with zipfile.ZipFile(zpath) as z:
        st = pd.read_csv(io.BytesIO(z.read("conafor/conafor_state_year.csv")), usecols=["state", "year", "conafor_n_fires"])
    fc = processed / "forecast"
    con = connect("2GB", processed)
    try:
        st["code"] = st.state.map(state_codes(con, processed, st.state.unique()))
        st = st.dropna(subset=["code"])
        sums = con.execute(f"""
            SELECT g.cve_ent AS code, f.horizon, f.target_year AS year,
                   sum(f.pred) AS forecast, sum(f.obs) AS observed, sum(f.clim) AS climatology, count(DISTINCT f.target_month) AS months
            FROM read_parquet({q(fc / 'forecast_cell.parquet')}) f
            JOIN read_parquet({q(processed / 'geo' / 'Mexico' / 'cell_geo.parquet')}) g USING (h3_r6)
            WHERE f.kind = 'backtest' AND f.country = 'Mexico' AND f.target_year BETWEEN {YEARS[0]} AND {YEARS[1]}
            GROUP BY ALL""").df()
    finally:
        con.close()
    sums["code"] = sums.code.astype(str)
    d = sums.merge(st[["code", "year", "conafor_n_fires"]], on=["code", "year"])
    rows = []
    for h, g in d.groupby("horizon"):
        g = g[g.months == 12]
        for col in ("forecast", "observed", "climatology"):
            rows.append({"horizon": int(h), "series": col, "state_years": len(g), "years": sorted(g.year.unique().tolist()),
                         "pearson_log": float(np.log1p(g[col].clip(lower=0)).corr(np.log1p(g.conafor_n_fires))),
                         "spearman": float(g[col].corr(g.conafor_n_fires, method="spearman"))})
    out = pd.DataFrame(rows)
    dest = fc / "metrics" / "conafor_forecast_check.csv"
    out.to_csv(dest, index=False)
    summary_path = fc / "forecast_summary.json"
    if summary_path.is_file():
        s = json.loads(summary_path.read_text())
        s["conafor"] = out.to_dict(orient="records")
        summary_path.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    return {"rows": out.to_dict(orient="records"), "output": str(dest)}


def main() -> None:
    p = parser(__doc__)
    p.add_argument("--raw", type=Path, default=Path(os.environ.get("FIRELY_DATA_RAW", "data/raw")))
    a = p.parse_args()
    r = build(a.processed, a.raw)
    print(pd.DataFrame(r["rows"]).to_string(index=False))


if __name__ == "__main__":
    main()
