import csv
import io
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

import duckdb
import h3
import pytest
from fastapi import HTTPException

from api.app import nrt as api_nrt
from pipeline import nrt, static_sources


def test_static_mask_from_annual_zip(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    header = "latitude,longitude,type\n"
    for year, rows in ((2024, "19.4,-99.1,2\n19.4,-99.1,0\n"),
                       (2025, "19.4,-99.1,2\n19.4,-99.1,1\n")):
        path = raw / f"modis_{year}_all_countries.zip"
        with ZipFile(path, "w") as archive:
            archive.writestr(f"modis/{year}/modis_{year}_Mexico.csv", header + rows)
    with ZipFile(raw / "viirs-snpp_2025_all_countries.zip", "w") as archive:
        archive.writestr("viirs-snpp/2025/viirs-snpp_2025_Mexico.csv", header + "19.4,-99.1,2\n")
    result = static_sources.build(raw, tmp_path / "processed", "Mexico")
    assert result["archives"] == 3
    assert result["detections"] == 4
    with duckdb.connect(":memory:") as con:
        rows = con.execute("SELECT type,n_detections,n_years FROM read_parquet(?) ORDER BY type",
                           [result["output"]]).fetchall()
    assert rows == [(1, 1, 1), (2, 3, 2)]
    assert static_sources.build(raw, tmp_path / "processed", "Mexico")["skipped"]


class FakeResponse:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


def test_fetch_clean_filter_dedupe_and_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(nrt.time, "sleep", lambda _: None)
    rows = [
        [19.4, -99.1, "2026-11-14", "1200", "N", "n", 12, "D"],
        [19.4, -99.1, "2026-11-14", "1200", "N", "n", 12, "D"],
        [19.5, -99.2, "2026-11-14", "1200", "N", "l", 5, "D"],
        [19.6, -99.3, "2026-11-14", "1200", "N", "h", 7, "N"],
        [19.7, -99.4, "2026-11-11", "1200", "N", "h", 9, "N"],
    ]
    calls = []

    def getter(url, timeout):
        calls.append(url)
        source = url.split("/")[7]
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight"])
        if source == "VIIRS_SNPP_NRT":
            writer.writerows(rows)
        elif source == "MODIS_NRT":
            writer.writerows([[19.8, -99.5, "2026-11-14", "1200", "T", 29, 5, "D"],
                              [19.9, -99.6, "2026-11-14", "1200", "A", 80, 20, "D"]])
        return FakeResponse(stream.getvalue())

    now = datetime(2026, 11, 14, 13, tzinfo=timezone.utc)
    kwargs = dict(bbox=(-100, 19, -99, 20), hours=48, cache_dir=tmp_path / "cache",
                  now=now, key="test-key", getter=getter, mask={h3.latlng_to_cell(19.6, -99.3, 7)})
    first = nrt.fetch_recent(**kwargs)
    assert first["type"] == "FeatureCollection"
    assert len(first["features"]) == 2
    assert {f["properties"]["platform"] for f in first["features"]} == {"SNPP", "Aqua"}
    assert len(calls) == 4
    assert nrt.fetch_recent(**kwargs) == first
    assert len(calls) == 4


def test_missing_key_and_api_envelope(tmp_path, monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    monkeypatch.chdir(tmp_path)
    assert nrt.map_key(tmp_path / ".env") is None
    with pytest.raises(HTTPException) as exc:
        api_nrt.recent()
    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "firms_map_key_missing"
    (tmp_path / ".env").write_text('FIRMS_MAP_KEY="fake-key"\n')
    assert nrt.map_key(tmp_path / ".env") == "fake-key"
    monkeypatch.setenv("FIRMS_MAP_KEY", "fake-key")
    cell = h3.latlng_to_cell(19.4, -99.1, 6)
    feature = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-99.1, 19.4]},
               "properties": {"h3_r7": h3.latlng_to_cell(19.4, -99.1, 7),
                              "ts_utc": "2026-11-14T12:00:00Z", "platform": "SNPP"}}
    monkeypatch.setattr(api_nrt.client, "fetch_recent", lambda **kwargs: {"type": "FeatureCollection", "features": [feature]})
    result = api_nrt.recent(h3=cell)
    assert result["data_cutoff"] == feature["properties"]["ts_utc"]
    assert result["source"] == "FIRMS NRT"
    assert result["attribution"] == "NASA FIRMS"
    assert result["features"] == [feature]
