"""FIRMS near-real-time area client with short-lived raw response cache."""

from __future__ import annotations

import csv
import hashlib
import io
import os
import socket
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from urllib.parse import quote

import duckdb
import h3
import requests
import urllib3.util.connection as urllib3_connection

SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT")
CACHE_TTL_SECONDS = 900
_rate_lock = Lock()
_last_request = 0.0


def map_key(env_file: Path = Path(__file__).resolve().parents[1] / ".env") -> str | None:
    """Read a key from the environment or a simple repo-root KEY=VALUE file."""
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if key:
        return key
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.partition("=")
            if sep and name.strip() == "FIRMS_MAP_KEY":
                return value.strip().strip('"\'') or None
    return None


def static_cells(processed: Path, countries=("Mexico", "Argentina")) -> set[str]:
    paths = [str(processed / "static_sources" / f"{country}.parquet") for country in countries]
    missing = [p for p in paths if not Path(p).is_file()]
    if missing:
        raise FileNotFoundError("Static FIRMS mask missing; run pipeline.static_sources for Mexico and Argentina")
    con = duckdb.connect(":memory:")
    try:
        con.execute("SET memory_limit='1GB'")
        return {row[0] for row in con.execute("SELECT DISTINCT h3_r7 FROM read_parquet(?)", [paths]).fetchall()}
    finally:
        con.close()


def _raw_csv(source: str, bbox: tuple[float, float, float, float], day_range: int,
             key: str, cache_dir: Path, getter, now: datetime) -> str:
    global _last_request
    if source not in SOURCES or not 1 <= day_range <= 5:
        raise ValueError("Invalid FIRMS source or day range")
    bounds = ",".join(f"{x:.6f}" for x in bbox)
    cache_id = hashlib.sha256(f"{source}|{bounds}|{day_range}".encode()).hexdigest()
    cached = cache_dir / f"{cache_id}.csv"
    if cached.is_file() and now.timestamp() - cached.stat().st_mtime < CACHE_TTL_SECONDS:
        return cached.read_text(encoding="utf-8-sig")
    # urllib3 is used by requests. Set the resolver before making any request.
    urllib3_connection.allowed_gai_family = lambda: socket.AF_INET
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{quote(key, safe='')}/{source}/{bounds}/{day_range}"
    with _rate_lock:
        elapsed = time.monotonic() - _last_request
        if _last_request and elapsed < 0.12:
            time.sleep(0.12 - elapsed)
        _last_request = time.monotonic()
        try:
            response = getter(url, timeout=30)
            response.raise_for_status()
        except Exception:
            raise RuntimeError("FIRMS request failed; retry after checking service availability") from None
    body = response.text
    if "latitude" not in (body.splitlines()[0].lower() if body else ""):
        raise ValueError("FIRMS returned no valid CSV header")
    cache_dir.mkdir(parents=True, exist_ok=True)
    temp = cached.with_suffix(".tmp")
    temp.write_text(body, encoding="utf-8")
    temp.replace(cached)
    return body


def fetch_recent(*, bbox: tuple[float, float, float, float], hours: int = 48,
                 processed: Path | None = None, cache_dir: Path | None = None,
                 getter=None, now: datetime | None = None, key: str | None = None,
                 mask: set[str] | None = None) -> dict:
    """Return detections in a GeoJSON FeatureCollection; getter is injectable."""
    if hours not in (24, 48):
        raise ValueError("hours must be 24 or 48")
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("Invalid bbox")
    key = key or map_key()
    if not key:
        raise RuntimeError("FIRMS_MAP_KEY is missing; set it in the environment or repo-root .env")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must have a timezone")
    now = now.astimezone(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    day_range = min(5, (now.date() - cutoff.date()).days + 1)
    processed = processed or Path(os.environ.get("FIRELY_DATA_PROCESSED", "data/processed"))
    cache_dir = cache_dir or Path(os.environ.get("FIRELY_DATA_INTERIM", "data/interim")) / "nrt_cache"
    mask = static_cells(processed) if mask is None else mask
    getter = getter or requests.get
    seen = set()
    features = []
    for source in SOURCES:
        body = _raw_csv(source, bbox, day_range, key, cache_dir, getter, now)
        for row in csv.DictReader(io.StringIO(body)):
            try:
                lat, lon = float(row["latitude"]), float(row["longitude"])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                cell = h3.latlng_to_cell(lat, lon, 7)
                if cell in mask or not (west <= lon <= east and south <= lat <= north):
                    continue
                hhmm = row["acq_time"].zfill(4)
                ts = datetime.strptime(row["acq_date"] + hhmm, "%Y-%m-%d%H%M").replace(tzinfo=timezone.utc)
                if not cutoff <= ts <= now:
                    continue
                confidence = row["confidence"].strip().lower()
                if source == "MODIS_NRT":
                    numeric = float(confidence)
                    if numeric < 30:
                        continue
                    level = "alta" if numeric >= 80 else "nominal"
                    platform = {"t": "Terra", "a": "Aqua"}.get(row.get("satellite", "").strip().lower(), "MODIS")
                else:
                    if confidence == "l":
                        continue
                    level = {"n": "nominal", "h": "alta"}[confidence]
                    platform = {"VIIRS_SNPP_NRT": "SNPP", "VIIRS_NOAA20_NRT": "NOAA20",
                                "VIIRS_NOAA21_NRT": "NOAA21"}[source]
                identity = (platform, ts, lat, lon)
                if identity in seen:
                    continue
                seen.add(identity)
                frp = float(row["frp"]) if row.get("frp") else None
            except (KeyError, ValueError, TypeError):
                continue
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                             "properties": {"h3_r7": cell, "ts_utc": ts.isoformat().replace("+00:00", "Z"),
                                            "platform": platform, "frp_mw": frp,
                                            "confidence_h": level, "daynight": row.get("daynight")}})
    features.sort(key=lambda item: (item["properties"]["ts_utc"], item["properties"]["platform"], item["geometry"]["coordinates"]))
    return {"type": "FeatureCollection", "features": features}
