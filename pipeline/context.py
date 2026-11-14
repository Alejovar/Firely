"""Build monthly climate context for the Coahuila H3 fire-cell universe."""

from __future__ import annotations

import argparse
import calendar
import json
import os
import re
import shutil
import warnings
from pathlib import Path

import duckdb
import h3
import numpy as np
import pandas as pd
import xarray as xr


BOX = (-104.0, -99.8, 24.5, 29.9)
SEASONS = ("DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ")
CLOUD_NAME = "MYD08_M3_6_1_Cloud_Fraction_Mean_Mean"
GFWED_SUFFIXES = ("FWI", "FFMC", "DMC", "DC", "ISI", "BUI", "DSR")


def read_oni(path: Path) -> pd.DataFrame:
    rows = []
    for line in path.read_text(encoding="ascii").splitlines()[1:]:
        parts = line.split()
        if not parts:
            continue
        if len(parts) != 4 or parts[0] not in SEASONS:
            raise ValueError(f"Unexpected ONI row: {line}")
        rows.append((int(parts[1]), SEASONS.index(parts[0]) + 1, float(parts[3])))
    frame = pd.DataFrame(rows, columns=["year", "month", "oni"])
    if frame.duplicated(["year", "month"]).any():
        raise ValueError("Duplicate ONI central months")
    frame = frame.sort_values(["year", "month"]).reset_index(drop=True)
    frame["phase"] = np.select([frame.oni >= 0.5, frame.oni <= -0.5], ["nino", "nina"], default="neutral")
    frame["episode"] = episode_flags(frame.phase.to_numpy())
    return frame


def episode_flags(phases: np.ndarray) -> np.ndarray:
    """Flag every season in qualifying runs of five or more consecutive seasons."""
    flags = np.zeros(len(phases), dtype=bool)
    start = 0
    for end in range(1, len(phases) + 1):
        if end == len(phases) or phases[end] != phases[start]:
            if phases[start] != "neutral" and end - start >= 5:
                flags[start:end] = True
            start = end
    return flags


def grid_index(values: np.ndarray, centers: np.ndarray) -> np.ndarray:
    """Containing regular-grid cell index; -1 outside outer cell edges."""
    centers = np.asarray(centers, dtype=float)
    if len(centers) < 2 or not np.all(np.diff(centers) > 0):
        raise ValueError("Expected ascending regular grid with at least two cells")
    steps = np.diff(centers)
    if not np.allclose(steps, steps[0]):
        raise ValueError("Irregular grid")
    values = np.asarray(values, dtype=float)
    indices = np.searchsorted((centers[:-1] + centers[1:]) / 2, values, side="right")
    outside = (values < centers[0] - steps[0] / 2) | (values >= centers[-1] + steps[0] / 2)
    return np.where(outside, -1, indices)


def mapped_cells(cells: pd.DataFrame, ds: xr.Dataset) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    lat = ds.lat.values.astype(float)
    lon = ds.lon.values.astype(float)
    ilat = grid_index(cells.lat.to_numpy(), lat)
    ilon = grid_index(cells.lon.to_numpy(), lon)
    valid = (ilat >= 0) & (ilon >= 0)
    mapped = cells.loc[valid, ["h3_r6"]].copy().reset_index(drop=True)
    mapped["ilat"] = ilat[valid]
    mapped["ilon"] = ilon[valid]
    return mapped, lat, lon


def load_cells(con: duckdb.DuckDBPyConnection, path: Path) -> pd.DataFrame:
    frame = con.execute("SELECT DISTINCT h3_r6 FROM read_parquet(?) WHERE h3_r6 IS NOT NULL", [str(path)]).df()
    centers = [h3.cell_to_latlng(cell) for cell in frame.h3_r6]
    frame["lat"] = [p[0] for p in centers]
    frame["lon"] = [p[1] for p in centers]
    west, east, south, north = BOX
    return frame.loc[frame.lon.between(west, east) & frame.lat.between(south, north)].reset_index(drop=True)


def write_frame(con: duckdb.DuckDBPyConnection, frame: pd.DataFrame, path: Path) -> None:
    con.register("context_frame", frame)
    try:
        con.execute("COPY context_frame TO ? (FORMAT PARQUET, COMPRESSION ZSTD)", [str(path)])
    finally:
        con.unregister("context_frame")


def merge_parts(con: duckdb.DuckDBPyConnection, parts: list[Path], output: Path) -> None:
    # DuckDB cannot bind a parameter for COPY's destination filename.
    destination = "'" + str(output).replace("'", "''") + "'"
    con.execute(f"COPY (SELECT * FROM read_parquet(?) ORDER BY year, month, h3_r6) TO {destination} (FORMAT PARQUET, COMPRESSION ZSTD)",
                [[str(p) for p in parts]])


def build_cloud(con: duckdb.DuckDBPyConnection, files: list[Path], cells: pd.DataFrame, scratch: Path, output: Path) -> dict:
    parts = []
    mapped_count = None
    for file in files:
        with xr.open_dataset(file) as ds:
            if CLOUD_NAME not in ds:
                raise ValueError(f"Missing cloud variable in {file}")
            mapped, _, _ = mapped_cells(cells, ds)
            mapped_count = len(mapped)
            date = pd.Timestamp(ds.time.values[0])
            if date < pd.Timestamp("2002-08-01"):
                continue  # Aqua has no usable full monthly observation before August.
            array = ds[CLOUD_NAME].isel(time=0).values
            values = array[mapped.ilat.to_numpy(), mapped.ilon.to_numpy()]
            valid = np.isfinite(values) & (values >= 0) & (values <= 1)
            frame = pd.DataFrame({"h3_r6": mapped.h3_r6[valid].to_numpy(), "year": date.year,
                                  "month": date.month, "clear_frac": 1 - values[valid]})
            part = scratch / f"cloud_{date.year}_{date.month:02d}.parquet"
            write_frame(con, frame, part)
            parts.append(part)
    if not parts:
        raise ValueError("No usable cloud months")
    merge_parts(con, parts, output)
    return {"cloud_variable": CLOUD_NAME, "cloud_grid_cells": mapped_count}


def variable_names(ds: xr.Dataset) -> dict[str, str]:
    names = {}
    for suffix in GFWED_SUFFIXES:
        matches = [name for name in ds.data_vars if name.endswith("_" + suffix)]
        if len(matches) > 1:
            raise ValueError(f"Ambiguous GFWED variable {suffix}: {matches}")
        if matches:
            names[suffix] = matches[0]
    if "FWI" not in names:
        raise ValueError("GFWED FWI variable absent")
    return names


def monthly_grid_stats(values: np.ndarray, months: np.ndarray, month: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    selected = values[months == month]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(selected, axis=0), np.nanmax(selected, axis=0), np.nanpercentile(selected, 90, axis=0)


EXCLUDED_GFWED_YEARS: dict = {}


def date_reliable(year: int, ndays: int, is_latest: bool) -> bool:
    """GFWED slices carry no usable time coordinate (all 1) and the download script dropped failed days,
    so dates are trusted only when they cannot be shifted: complete years, or the latest (still running)
    year whose slice count ends exactly at a month end (contiguous from 1 January)."""
    full = 366 if calendar.isleap(year) else 365
    if ndays == full:
        return True
    month_ends = np.cumsum([calendar.monthrange(year, m)[1] for m in range(1, 13)])
    return bool(is_latest and ndays in month_ends)


def build_fwi(con: duckdb.DuckDBPyConnection, files: list[Path], climatology: Path,
              cells: pd.DataFrame, scratch: Path, output: Path) -> dict:
    with xr.open_dataset(climatology) as clim:
        clim_names = variable_names(clim)
        clim_months = clim.month.values.astype(int)
        if sorted(clim_months.tolist()) != list(range(1, 13)):
            raise ValueError("Expected climatology months 1 through 12")
        climatologies = {suffix: clim[name].isel(time=0).values for suffix, name in clim_names.items()}
        clim_lat, clim_lon = clim.lat.values, clim.lon.values
    parts = []
    found_names = set(clim_names.values())
    mapped_count = None
    for file in files:  # One year of daily data in memory at a time.
        year = int(re.search(r"_(\d{4})\.nc$", file.name).group(1))
        with xr.open_dataset(file) as ds:
            names = variable_names(ds)
            found_names.update(names.values())
            mapped, lat, lon = mapped_cells(cells, ds)
            mapped_count = len(mapped)
            if not np.array_equal(lat, clim_lat) or not np.array_equal(lon, clim_lon):
                raise ValueError(f"GFWED grid differs from climatology: {file}")
            ndays = ds.sizes["time"]
            if ndays > (366 if calendar.isleap(year) else 365):
                raise ValueError(f"Too many daily slices in {file}")
            real_dates = np.issubdtype(ds["time"].dtype, np.datetime64)  # files from pipeline.download_gfwed
            if not real_dates and not date_reliable(year, ndays, file == files[-1]):
                EXCLUDED_GFWED_YEARS[str(year)] = {
                    "daily_slices": ndays,
                    "reason": "partial year: failed daily downloads were dropped, so slice order cannot be mapped to dates"}
                continue
            # GFWED's time values are all 1 (units='day', calendar='none').
            # The annual files are ordered daily from January 1.
            dates = pd.DatetimeIndex(ds["time"].values) if real_dates else pd.date_range(f"{year}-01-01", periods=ndays, freq="D")
            months = dates.month.to_numpy()
            arrays = {suffix: ds[name].values for suffix, name in names.items() if suffix in ("FWI", "DC", "DMC")}
            ilat, ilon = mapped.ilat.to_numpy(), mapped.ilon.to_numpy()
            annual = []
            for month in np.unique(months):
                fwi_mean, fwi_max, fwi_p90 = monthly_grid_stats(arrays["FWI"], months, month)
                values = {"h3_r6": mapped.h3_r6.to_numpy(), "year": year, "month": int(month),
                          "fwi_mean": fwi_mean[ilat, ilon], "fwi_max": fwi_max[ilat, ilon],
                          "fwi_p90": fwi_p90[ilat, ilon]}
                for suffix in ("FWI", "DC", "DMC"):
                    prefix = suffix.lower()
                    if suffix == "FWI":
                        mean = values["fwi_mean"]
                    elif suffix in arrays:
                        mean = monthly_grid_stats(arrays[suffix], months, month)[0][ilat, ilon]
                        values[prefix + "_mean"] = mean
                    else:
                        mean = np.full(len(mapped), np.nan)
                        values[prefix + "_mean"] = mean
                    baseline = climatologies[suffix][month - 1, ilat, ilon] if suffix in climatologies else np.full(len(mapped), np.nan)
                    if suffix == "FWI":
                        values["fwi_clim"] = baseline
                    values[prefix + "_anom"] = mean - baseline
                frame = pd.DataFrame(values)
                frame = frame.loc[frame.fwi_mean.notna()].copy()
                annual.append(frame)
            part = scratch / f"fwi_{year}.parquet"
            write_frame(con, pd.concat(annual, ignore_index=True), part)
            parts.append(part)
    if not parts:
        raise ValueError("No GFWED annual files")
    merge_parts(con, parts, output)
    return {"gfwed_variables": sorted(found_names), "gfwed_grid_cells": mapped_count}


def coverage(con: duckdb.DuckDBPyConnection, path: Path) -> dict:
    row = con.execute("SELECT count(*), count(DISTINCT h3_r6), min(year * 100 + month), max(year * 100 + month) FROM read_parquet(?)", [str(path)]).fetchone() if path.name != "oni.parquet" else con.execute("SELECT count(*), NULL, min(year * 100 + month), max(year * 100 + month) FROM read_parquet(?)", [str(path)]).fetchone()
    return {"rows": row[0], "h3_cells": row[1], "min_year_month": f"{row[2] // 100:04d}-{row[2] % 100:02d}",
            "max_year_month": f"{row[3] // 100:04d}-{row[3] % 100:02d}"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    output_dir = args.processed / "context"
    output_dir.mkdir(parents=True, exist_ok=True)
    scratch = Path("data/interim/context_tmp")
    scratch.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='1GB'")
    con.execute("SET temp_directory=?", [str(scratch / "duckdb")])
    try:
        oni_path = output_dir / "oni.parquet"
        cloud_path = output_dir / "clear_frac_coahuila.parquet"
        fwi_path = output_dir / "fwi_coahuila_month.parquet"
        summary_path = output_dir / "context_summary.json"
        gfwed_dir = args.raw / "nasa_center_for_climate_simulation" / "gfwed_coahuila"
        gfwed_files = sorted(gfwed_dir.glob("gfwed_coahuila_????.nc"))
        cloud_files = sorted((args.raw / "Giovanni_cloud").glob("*.nc"))
        clim_path = gfwed_dir / "gfwed_coahuila_longtermmean_1981_2010.nc"
        years = [int(re.search(r"_(\d{4})\.nc$", p.name).group(1)) for p in gfwed_files]
        missing_years = sorted(set(range(min(years), max(years) + 1)) - set(years))
        annual_slices = {}
        with xr.open_dataset(gfwed_files[0]) as ds:
            names = set(variable_names(ds).values())
        for file, year in zip(gfwed_files, years):
            with xr.open_dataset(file) as ds:
                annual_slices[year] = ds.sizes["time"]
        with xr.open_dataset(clim_path) as ds:
            names.update(variable_names(ds).values())
        metadata = {"cloud_variable": CLOUD_NAME, "gfwed_variables": sorted(names), "missing_gfwed_years": missing_years,
                    "gfwed_time_note": "Annual daily slices assigned sequentially from January 1; source time coordinate is constant 1."}
        metadata["partial_gfwed_years"] = {
            str(year): {"daily_slices": days, "assumed_last_date": str((pd.Timestamp(f"{year}-01-01") + pd.Timedelta(days=days - 1)).date())}
            for year, days in annual_slices.items() if days < (366 if calendar.isleap(year) else 365)
        }
        if args.force or not oni_path.exists():
            write_frame(con, read_oni(args.raw / "oni.ascii.txt"), oni_path)
        if args.force or not cloud_path.exists() or not fwi_path.exists():
            cells = load_cells(con, args.processed / "cell_class" / "Mexico.parquet")
            metadata["cells_in_box"] = len(cells)
            if args.force or not cloud_path.exists():
                metadata.update(build_cloud(con, cloud_files, cells, scratch, cloud_path))
            if args.force or not fwi_path.exists():
                metadata.update(build_fwi(con, gfwed_files, clim_path, cells, scratch, fwi_path))
                metadata["excluded_gfwed_years"] = dict(EXCLUDED_GFWED_YEARS)
        metadata["coverage"] = {"oni": coverage(con, oni_path), "clear_frac_coahuila": coverage(con, cloud_path),
                                "fwi_coahuila_month": coverage(con, fwi_path)}
        if args.force or not summary_path.exists():
            summary_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps(metadata["coverage"], indent=2))
    finally:
        con.close()
        shutil.rmtree(scratch)


if __name__ == "__main__":
    main()
