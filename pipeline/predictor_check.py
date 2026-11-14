"""Which MODIS predictor estimates VIIRS better: Terra+Aqua combined, or Aqua alone?

Aqua flies at the same local time as S-NPP and is orbit-stable, which makes it attractive (the earlier country-level
pipeline used it). This runs the leave-one-year-out validation of pipeline.harmonize with each predictor on 2013-2025
(Aqua is complete from 2003) for the model chosen by each country, and stores the annual errors.
Writes data/processed/metadata/predictor_check.json. Slow (about 10 minutes for six countries).
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import duckdb

from . import harmonize as H


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    a = p.parse_args()
    summary = json.loads((a.processed / "metadata" / "harmonization_summary.json").read_text())
    tmp = a.processed / ".duckdb_tmp"
    tmp.mkdir(exist_ok=True)
    out = {}
    for country, v in summary["countries"].items():
        con = duckdb.connect()
        con.execute(f"SET memory_limit='3GB'; SET temp_directory={H.q(tmp)}")
        H.build_dense(con, a.processed, country)
        H.add_regimes(con, a.processed, country)
        ccol, use_nb = H.CONFIGS[v["model"]]
        res = {}
        for name, pred in (("terra_aqua", "modis_ta"), ("aqua_only", "aqua")):
            cell, region = H.validate(con, f"x_{name}", pred, "nb_ta", ccol, use_nb, range(2013, 2026))
            m = H.summarize(cell, region)
            res[name] = {"annual_mape_pct": round(m["region_year_mape_pct"], 2),
                         "baseline_annual_mape_pct": round(m["region_year_mape_baseline_pct"], 2)}
        res["best"] = min(("terra_aqua", "aqua_only"), key=lambda k: res[k]["annual_mape_pct"])
        out[country] = res
        con.close()
        print(country, res, flush=True)
    (a.processed / "metadata" / "predictor_check.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
