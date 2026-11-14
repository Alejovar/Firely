"""Harmonize CONAFOR reported-fire shapefiles without administrative spatial joins.

SINASIC polygons with exactly one year supply 2010–2013. The richer and more
complete info_estadistica point records supply 2015–2020; annual polygon
records supply 2021–2024. SINASIC's multi-year polygons cannot be interpreted
as individual annual fires and are excluded.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import unicodedata
from collections import Counter
from pathlib import Path

import pandas as pd
import pyogrio
import duckdb


STATE_NAMES = (
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
    "Coahuila", "Colima", "Chiapas", "Chihuahua", "Ciudad de México",
    "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "México",
    "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla",
    "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora",
    "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
)


def clean_text(value):
    if pd.isna(value):
        return None
    value = str(value).strip()
    if not value or value.lower() in {"nan", "n/a", "null"}:
        return None
    if "Ã" in value or "Â" in value:
        try:
            value = value.encode("latin1").decode("utf8")
        except (UnicodeError, ValueError):
            pass
    return value


def state_key(value):
    value = clean_text(value)
    if value is None:
        return None
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold())
                   if not unicodedata.combining(c))


STATE_CODES = {state_key(name): f"{n:02d}" for n, name in enumerate(STATE_NAMES, 1)}
STATE_CODES.update({"estado de mexico": "15", "distrito federal": "09",
                    "veracruz de ignacio de la llave": "30", "michoacan de ocampo": "16",
                    "coahuila de zaragoza": "05"})


def parse_dates(values):
    """Accept the four date encodings observed in the source archives."""
    s = pd.Series(values, dtype="string").str.strip()
    result = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y"):
        result = result.fillna(pd.to_datetime(s, format=fmt, errors="coerce"))
    return result.dt.normalize()


def municipality_code(values):
    n = pd.to_numeric(values, errors="coerce")
    return n.where(n.ge(1) & n.le(999) & n.mod(1).eq(0)).map(
        lambda v: f"{int(v):03d}" if pd.notna(v) else None
    )


def coordinates(frame, point_columns=None):
    if point_columns:
        lat = pd.to_numeric(frame[point_columns[0]], errors="coerce")
        lon = pd.to_numeric(frame[point_columns[1]], errors="coerce")
    else:
        # Project before computing a representative centroid, then return WGS84.
        centroids = frame.to_crs("EPSG:6933").geometry.centroid.to_crs("EPSG:4326")
        lat, lon = centroids.y, centroids.x
    valid = lat.between(14, 33) & lon.between(-119, -86)
    return lat.where(valid), lon.where(valid)


def read_zip(raw_dir, filename):
    path = (raw_dir / filename).resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    info = pyogrio.read_info("zip://" + str(path))
    if info["crs"] != "EPSG:4326":
        raise ValueError(f"Unexpected CRS in {filename}: {info['crs']}")
    frame = pyogrio.read_dataframe("zip://" + str(path), on_invalid="ignore")
    return frame, {
        "file": filename, "features": int(info["features"]),
        "crs": info["crs"], "encoding": info["encoding"],
        "fields": list(info["fields"]),
        "null_or_unreadable_geometries": int(frame.geometry.isna().sum()),
    }


def shared_fields(frame, source, year, start, end, state, municipality,
                  mun_code, area, vegetation, cause, lat, lon, source_id):
    n = len(frame)
    out = pd.DataFrame({
        "source": [source] * n, "source_id": source_id,
        "year": year, "start_date": start, "end_date": end,
        "state": state, "municipality": municipality,
        "cve_mun": mun_code, "lat": lat, "lon": lon,
        "area_ha": area, "vegetation_type": vegetation, "cause": cause,
    })
    out["cve_ent"] = out.state.map(lambda x: STATE_CODES.get(state_key(x)))
    out["year"] = pd.to_numeric(out.year, errors="coerce").astype("Int64")
    out["area_ha"] = pd.to_numeric(out.area_ha, errors="coerce").where(lambda s: s.ge(0))
    return out


def normalize_info(frame):
    lat, lon = coordinates(frame, ("lat", "lon"))
    out = shared_fields(
        frame, "info_estadistica", frame.anio, parse_dates(frame.inicio),
        parse_dates(frame.termino), frame.edo, frame.mun.map(clean_text),
        municipality_code(frame.clv_mun), frame.tot_ha,
        frame.tipo_veg.map(clean_text), frame.causa.map(clean_text), lat, lon,
        frame.incendio_c,
    )
    return out


def normalize_annual(frame, year):
    lat, lon = coordinates(frame)
    out = shared_fields(
        frame, f"conafor_{year}", pd.Series(year, index=frame.index),
        parse_dates(frame.FECHAINIC), parse_dates(frame.FECHALIQ),
        frame.ESTADO, frame.MUNICIPIO.map(clean_text),
        municipality_code(frame.CLAVEMUN), frame.AREA_HA,
        frame.TIPVEG.map(clean_text), frame.CAUSA.map(clean_text), lat, lon,
        frame.CLAVEINC,
    )
    # The four repeated 2021 keys have an undated duplicate of the same fire.
    return out.sort_values("start_date", na_position="last").drop_duplicates(
        ["source", "source_id"], keep="first"
    ).sort_index().reset_index(drop=True)


def sinasic_years(frame):
    return frame.Ano_incen.astype("string").map(lambda x: re.findall(r"20\d{2}", x) if pd.notna(x) else [])


def normalize_sinasic(frame):
    years = sinasic_years(frame)
    selected = frame.loc[years.map(lambda x: len(x) == 1 and int(x[0]) <= 2013)].copy()
    selected["single_year"] = years.loc[selected.index].map(lambda x: int(x[0]))
    selected = selected.reset_index(drop=True)
    lat, lon = coordinates(selected)
    n = len(selected)
    return shared_fields(
        selected, "sinasic_v2", selected.single_year,
        pd.Series(pd.NaT, index=selected.index), pd.Series(pd.NaT, index=selected.index),
        pd.Series([None] * n, index=selected.index),
        pd.Series([None] * n, index=selected.index),
        pd.Series([None] * n, index=selected.index), selected.Sup_ha,
        pd.Series([None] * n, index=selected.index),
        pd.Series([None] * n, index=selected.index), lat, lon, selected.OBJECTID_1,
    ).reset_index(drop=True)


ANNUAL_FILES = {
    2021: "_2021_incendios_forestales.zip",
    2022: "_2022_incendios_forestales_wgs84.zip",
    2023: "_2023_incendios_forestales_wgs84.zip",
    2024: "_2024_incendios_forestales.zip",
}


def summarize(events, source_meta, source_counts, source_state_counts, anomalies):
    return {
        "selection_rule": "SINASIC single-year 2010-2013; info_estadistica 2015-2020; annual polygons 2021-2024. Keep info_estadistica over SINASIC in 2015-2019 because yearly counts are higher and it has fire dates, state and municipality attributes.",
        "overlap_comparison_2015_2019": {
            str(year): {
                "sinasic_single_year_polygons": int(source_counts["sinasic_v2_single_year"].get(year, 0)),
                "info_estadistica_points": int(source_counts["info_estadistica"].get(year, 0)),
                "sinasic_state_counts": None,
                "kept_source": "info_estadistica",
            } for year in range(2015, 2020)
        },
        "counts_by_source_year": {k: {str(y): int(v) for y, v in sorted(c.items())}
                                  for k, c in source_counts.items()},
        "counts_by_source_year_state": source_state_counts,
        "selected_counts_by_year": {str(k): int(v) for k, v in events.year.value_counts().sort_index().items()},
        "coverage": {
            "event_rows": len(events),
            "years": sorted(int(y) for y in events.year.dropna().unique()),
            "states_with_code": int(events.loc[events.cve_ent.notna(), "cve_ent"].nunique()),
            "rows_with_state_code": int(events.cve_ent.notna().sum()),
            "rows_with_municipality_code": int(events.cve_mun.notna().sum()),
            "rows_with_start_date": int(events.start_date.notna().sum()),
            "rows_with_coordinates": int((events.lat.notna() & events.lon.notna()).sum()),
            "rows_with_area": int(events.area_ha.notna().sum()),
            "missing_2014": True,
            "sinasic_state_comparison": "Unavailable: SINASIC has no state attribute; no administrative spatial join was performed.",
        },
        "anomalies": anomalies,
        "source_metadata": source_meta,
        "fields_mapped": {
            "info_estadistica": {"start_date": "inicio", "end_date": "termino", "state": "edo", "municipality": "mun", "cve_mun": "clv_mun", "area_ha": "tot_ha", "vegetation_type": "tipo_veg", "cause": "causa"},
            "annual_polygons": {"start_date": "FECHAINIC", "end_date": "FECHALIQ", "state": "ESTADO", "municipality": "MUNICIPIO", "cve_mun": "CLAVEMUN", "area_ha": "AREA_HA", "vegetation_type": "TIPVEG", "cause": "CAUSA"},
            "sinasic_v2": {"year": "sole nonzero year in Ano_incen", "area_ha": "Sup_ha", "state": None, "municipality": None, "start_date": None},
        },
        "ambiguities": ["SINASIC multi-year polygons do not identify an individual fire year and are excluded.", "Undated SINASIC fires appear in monthly aggregation with month=null.", "Municipality codes are source attributes, not spatially validated."],
    }


def build(raw_dir):
    source_meta, source_counts, source_state_counts, anomalies = {}, {}, {}, {}
    sinasic, meta = read_zip(raw_dir, "incendios_sinasic_v2_4326.zip")
    source_meta["sinasic_v2"] = meta
    years = sinasic_years(sinasic)
    source_counts["sinasic_v2_single_year"] = Counter(int(x[0]) for x in years if len(x) == 1)
    anomalies["sinasic_multi_year_polygons_excluded"] = int(years.map(lambda x: len(x) > 1).sum())
    parts = [normalize_sinasic(sinasic)]
    del sinasic

    info, meta = read_zip(raw_dir, "info_estadistica.zip")
    source_meta["info_estadistica"] = meta
    source_counts["info_estadistica"] = Counter(int(y) for y in info.anio)
    source_state_counts["info_estadistica"] = {
        str(year): {str(state): int(count) for state, count in group.edo.value_counts().sort_index().items()}
        for year, group in info.groupby("anio")
    }
    source_state_counts["sinasic_v2_single_year"] = None
    anomalies["info_duplicate_ids"] = int(info.incendio_c.duplicated().sum())
    parts.append(normalize_info(info))
    del info

    for year, filename in ANNUAL_FILES.items():
        frame, meta = read_zip(raw_dir, filename)
        source_meta[f"conafor_{year}"] = meta
        source_counts[f"conafor_{year}"] = {year: len(frame)}
        source_state_counts[f"conafor_{year}"] = {
            str(year): {str(state): int(count) for state, count in frame.ESTADO.value_counts().sort_index().items()}
        }
        anomalies[f"conafor_{year}_duplicate_ids"] = int(frame.CLAVEINC.duplicated().sum())
        parts.append(normalize_annual(frame, year))
        del frame

    events = pd.concat(parts, ignore_index=True)
    events["source_id"] = events.source_id.astype("string")
    anomalies["invalid_or_missing_coordinates"] = int((events.lat.isna() | events.lon.isna()).sum())
    anomalies["missing_start_dates"] = int(events.start_date.isna().sum())
    anomalies["start_year_differs_from_reported_year"] = int((events.start_date.dt.year.notna() & events.start_date.dt.year.ne(events.year)).sum())
    anomalies["unmapped_state_names"] = sorted(events.loc[events.state.notna() & events.cve_ent.isna(), "state"].unique().tolist())
    anomalies["missing_municipality_codes"] = int(events.cve_mun.isna().sum())
    events["month"] = events.start_date.dt.month.astype("Int64")
    grouped = events.groupby(["cve_ent", "cve_mun", "year", "month"], dropna=False).agg(
        n_fires=("source", "size"), area_ha=("area_ha", lambda x: x.sum(min_count=1))
    ).reset_index()
    events = events.drop(columns="month")
    return events, grouped, summarize(events, source_meta, source_counts, source_state_counts, anomalies)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path(os.getenv("FIRELY_DATA_RAW", "data/raw")))
    parser.add_argument("--processed-dir", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    out = args.processed_dir / "reported"
    paths = [out / "reported_fires_events.parquet", out / "reported_fires.parquet", out / "reported_summary.json"]
    if all(p.exists() for p in paths) and not args.force:
        print("Reported-fire outputs already exist; use --force to rebuild.")
        return
    events, grouped, summary = build(args.raw_dir)
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path("data/interim/reported_tmp")
    tmp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(config={"memory_limit": "1GB", "temp_directory": str(tmp)})
    try:
        for name, frame, path in (("events", events, paths[0]), ("grouped", grouped, paths[1])):
            con.register(name, frame)
            escaped = str(path.resolve()).replace("'", "''")
            con.execute(f"COPY (SELECT * FROM {name}) TO '{escaped}' (FORMAT PARQUET)")
            con.unregister(name)
    finally:
        con.close()
        shutil.rmtree(tmp)
    paths[2].write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Wrote {len(events)} events and {len(grouped)} monthly groups to {out}")


if __name__ == "__main__":
    main()
