"""GFWED long-term monthly FWI mean (1981–2010) as a small Parquet table for the forecast route (§8.11).

Reads ``$FIRELY_DATA_RAW/nasa_center_for_climate_simulation/gfwed_coahuila/gfwed_coahuila_longtermmean_1981_2010.nc``
and writes ``$FIRELY_DATA_PROCESSED/context/fwi_longterm_month.parquet`` with columns (lat, lon, month, fwi_ltm).
The API image has no NetCDF libraries and no raw data, so ``/risk/forecast`` reads this table instead.

    .venv/bin/python -m pipeline.fwi_climatology [--force]
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import duckdb
import xarray as xr

NAME = "gfwed_coahuila_longtermmean_1981_2010.nc"


def build(raw: Path, processed: Path, force: bool = False) -> dict:
    dest = processed / "context" / "fwi_longterm_month.parquet"
    if dest.exists() and not force:
        return {"output": str(dest), "skipped": True}
    source = raw / "nasa_center_for_climate_simulation" / "gfwed_coahuila" / NAME
    if not source.is_file():
        raise FileNotFoundError(f"GFWED long-term mean not found: {source}")
    with xr.open_dataset(source) as ds:
        name = next((v for v in ds.data_vars if v.endswith("_FWI")), None)
        if name is None:
            raise ValueError(f"No *_FWI variable in {source.name}: {sorted(ds.data_vars)}")
        da = ds[name]
        if "time" in da.dims:
            da = da.isel(time=0)
        frame = da.rename("fwi_ltm").to_dataframe().reset_index()[["lat", "lon", "month", "fwi_ltm"]]
    frame = frame.dropna(subset=["fwi_ltm"])
    dest.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        con.register("frame", frame)
        con.execute(f"COPY (SELECT lat::DOUBLE AS lat, lon::DOUBLE AS lon, month::INTEGER AS \"month\", fwi_ltm::DOUBLE AS fwi_ltm "
                    f"FROM frame ORDER BY 3, 1, 2) TO '{dest}' (FORMAT PARQUET)")
    finally:
        con.close()
    return {"output": str(dest), "rows": len(frame), "variable": name}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    print(build(args.raw, args.processed, args.force))


if __name__ == "__main__":
    main()
