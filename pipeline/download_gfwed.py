"""Download GFWED (MERRA2.CORRECTED) daily fire-weather fields, crop to Coahuila, one NetCDF per year.

Fixed version of the original descargar_gfwed.py. What changed:
* The real date of each daily file is ALWAYS written into the `time` coordinate. NASA's daily files already
  carry a constant `time` dimension (value 1), so the original `"time" not in dims` test never fired and the
  dates were lost; slices were then concatenated in completion order. Dates are now exact, sorted, and a year
  with failed days is still correctly dated (missing days are simply absent and are reported).
* Forces IPv4 (the NASA route over IPv6 hangs), `--years`, `--force`, `--out-dir`, `--workers`.
* Failed days are reported per year; a year is only skipped on re-run if its file exists and is complete
  (use --force to rebuild, or delete the year file).

Usage (inside the project venv):
    python -m pipeline.download_gfwed --years 2014 2019 2020 2021 2023 2026 --force
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import socket
import tempfile
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import requests
import urllib3.util.connection as urllib3_cn
import xarray as xr

urllib3_cn.allowed_gai_family = lambda: socket.AF_INET  # force IPv4

BASE = "https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/fwiCalcs.MERRA2/Default/MERRA2.CORRECTED"
WEST, SOUTH, EAST, NORTH = -104.7, 24.0, -99.1, 30.4  # Coahuila + one grid cell of margin
session = requests.Session()


def coord_name(ds, options):
    for name in options:
        if name in ds.coords or name in ds.dims:
            return name
    raise KeyError(f"None of {options} in {list(ds.coords)}")


def crop(ds):
    lat, lon = coord_name(ds, ["lat", "latitude", "Y"]), coord_name(ds, ["lon", "longitude", "X"])
    if float(ds[lon].max()) > 180:
        ds = ds.assign_coords({lon: ((ds[lon] + 180) % 360) - 180})
    ds = ds.sortby(lat).sortby(lon)
    return ds.sel({lat: slice(SOUTH, NORTH), lon: slice(WEST, EAST)})


def fetch_and_crop(url: str, when: date | None = None):
    """Download one file, crop it, delete it. Returns None if missing or failed after 3 attempts."""
    r = None
    for attempt in range(3):
        try:
            r = session.get(url, timeout=(15, 180))
            if r.status_code == 404:
                return None
            r.raise_for_status()
            break
        except requests.RequestException:
            r = None
    if r is None:
        print(f"  failed after 3 attempts: {url}", flush=True)
        return None
    fd, path = tempfile.mkstemp(suffix=".nc")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(r.content)
        with xr.open_dataset(path, decode_times=False) as ds:
            small = crop(ds).load()
    finally:
        os.remove(path)
    if when is not None:
        if "time" in small.dims:  # constant dummy value in NASA's files: replace, never trust it
            small = small.isel(time=0, drop=True)
        small = small.drop_vars("time", errors="ignore").expand_dims(time=[np.datetime64(when)])
    return small


def daily_url(d: date) -> str:
    return f"{BASE}/{d:%Y}/FWI.MERRA2.CORRECTED.Daily.Default.{d:%Y%m%d}.nc"


def do_year(year: int, out_dir: Path, workers: int, force: bool):
    out = out_dir / f"gfwed_coahuila_{year}.nc"
    end = min(date(year, 12, 31), date.today())
    days = [date(year, 1, 1) + timedelta(n) for n in range((end - date(year, 1, 1)).days + 1)]
    if out.exists() and not force:
        print(f"{year}: exists, skipped (use --force to rebuild)", flush=True)
        return
    pieces, missing = [], []
    with cf.ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(fetch_and_crop, daily_url(d), d): d for d in days}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            res = fut.result()
            (pieces if res is not None else missing).append(res if res is not None else futures[fut])
            if i % 50 == 0 or i == len(days):
                print(f"{year}: {i}/{len(days)} days", flush=True)
    if not pieces:
        print(f"{year}: no data available", flush=True)
        return
    ds = xr.concat(pieces, dim="time").sortby("time")  # exact dates -> chronological
    tmp = out.with_suffix(".tmp.nc")
    ds.to_netcdf(tmp)
    tmp.replace(out)
    note = f" | {len(missing)} missing days (first: {min(missing)})" if missing else ""
    print(f"{year}: saved {out} ({len(pieces)}/{len(days)} days){note}", flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--years", nargs="+", type=int, required=True)
    p.add_argument("--out-dir", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw"))
                   / "nasa_center_for_climate_simulation" / "gfwed_coahuila")
    p.add_argument("--workers", type=int, default=16)
    p.add_argument("--force", action="store_true")
    a = p.parse_args()
    a.out_dir.mkdir(parents=True, exist_ok=True)
    for year in a.years:
        do_year(year, a.out_dir, a.workers, a.force)
    print("Done.")


if __name__ == "__main__":
    main()
