import csv
import io
import json
from datetime import date, datetime

import duckdb
import h3
import pytest
from api.app import main, real


@pytest.fixture
def client(tmp_path, monkeypatch):
    a = h3.latlng_to_cell(25.0, -100.0, 6)
    b = h3.grid_ring(a, 1)[0]
    monthly = tmp_path / "cell_month_harmonized" / "Mexico"
    hotspots = tmp_path / "hotspots" / "Mexico"
    rows = []
    for year, values in [(2023, (2, 3)), (2024, (4, 5)), (2025, (6, 7)), (2026, (8, 9))]:
        for cell, value in zip((a, b), values):
            rows.append((cell, year, 3, value, value - 1, value + 1,
                         value * 10, 0.8, year < 2024))
    con = duckdb.connect()
    con.execute("CREATE TABLE monthly(h3_r6 VARCHAR, year INTEGER, month INTEGER, count_harm DOUBLE, count_harm_lo DOUBLE, count_harm_hi DOUBLE, frp_harm DOUBLE, clear_frac DOUBLE, is_estimated BOOLEAN)")
    con.executemany("INSERT INTO monthly VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    for year in (2023, 2024, 2025, 2026):
        path = monthly / f"year={year}"
        path.mkdir(parents=True)
        con.execute(f"COPY (SELECT * EXCLUDE (year) FROM monthly WHERE year={year}) TO '{path / 'part.parquet'}' (FORMAT PARQUET)")
    con.execute("CREATE TABLE points(h3_r6 VARCHAR, h3_r7 VARCHAR, ts_utc TIMESTAMP, date_local DATE, lat DOUBLE, lon DOUBLE, sensor VARCHAR, platform VARCHAR, confidence_h VARCHAR, frp_mw DOUBLE, daynight VARCHAR)")
    con.executemany("INSERT INTO points VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        (a, h3.latlng_to_cell(25.0, -100.0, 7), datetime(2025, 3, 2, 12), date(2025, 3, 2), 25.0, -100.0, "VIIRS", "SNPP", "alta", 12.0, "D"),
        (a, h3.latlng_to_cell(25.0, -100.0, 7), datetime(2025, 3, 2, 13), date(2025, 3, 2), 25.0, -100.0, "VIIRS", "SNPP", "baja", 2.0, "D"),
        (b, h3.cell_to_children(b, 7)[0], datetime(2025, 3, 3, 12), date(2025, 3, 3), 25.1, -100.1, "MODIS", "Aqua", "nominal", 5.0, "N"),
    ])
    path = hotspots / "year=2025"
    path.mkdir(parents=True)
    con.execute(f"COPY (SELECT * FROM points) TO '{path / 'part-0.parquet'}' (FORMAT PARQUET)")
    con.close()
    meta = tmp_path / "metadata"
    meta.mkdir()
    (meta / "harmonization_summary.json").write_text(json.dumps({"countries": {"X": {"validation": {"ta": {"region_year_median_ape_pct": 5.0}}}}}))
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    monkeypatch.setenv("FIRELY_API_MODE", "real")
    return a, b


def test_calendar_reference_and_envelope(client):
    a, _ = client
    data = real.calendar(h3_list=a, from_=date(2023, 3, 1), to=date(2026, 3, 31))
    assert data["methodology_version"] == "1.2.0-hybrid-biome"
    assert data["data_cutoff"] == "2026-03-31"
    assert data["attribution"] == "NASA FIRMS"
    assert data["harmonization_uncertainty"] == {"years_estimated": [2001, 2011], "median_rel_error": 0.05}
    assert [r["count_harm"] for r in data["rows"]] == [2, 4, 6, 8]
    assert data["rows"][2]["anomaly_ratio"] == 1.5  # 2023-25 median = 4
    assert data["rows"][3]["percentile"] == 0.75
    assert data["rows"][3]["return_period_years"] == 4
    assert "descending_midrank" in data["return_period_formula"]
    assert data["rows"][0]["is_estimated"] is True
    mean = real.calendar(h3_list=a, reference="mean", metric="frp")
    assert mean["rows"][3]["frp_harm"] == 80
    assert mean["rows"][3]["anomaly_ratio"] == 2


def test_area_filters_and_unsupported_breakdown(client):
    a, b = client
    lat, lon = h3.cell_to_latlng(a)
    response = real.calendar(lat=lat, lon=lon, radius_km=0)
    assert response["rows"][0]["count_harm"] == 2
    # A generous bbox must include both cell centers.
    bbox = f"{lon-0.2},{lat-0.2},{lon+0.2},{lat+0.2}"
    assert real.calendar(bbox=bbox)["rows"][0]["count_harm"] == 5
    shape = {"type": "Polygon", "coordinates": [[[lon-0.2, lat-0.2], [lon+0.2, lat-0.2],
             [lon+0.2, lat+0.2], [lon-0.2, lat+0.2], [lon-0.2, lat-0.2]]]}
    assert real.calendar(geometry=json.dumps(shape))["rows"][0]["count_harm"] == 5
    with pytest.raises(Exception) as exc:
        real.calendar(h3_list=a, burn_type="otro")
    assert exc.value.status_code == 422
    with pytest.raises(Exception) as exc:
        real.calendar(h3_list="invalid")
    assert exc.value.status_code == 422


def test_daily_and_csv(client):
    a, _ = client
    daily = real.daily(year=2025, month=3, h3_list=a)
    assert daily["rows"] == [{"date": "2025-03-02", "count_raw": 2, "count_harm": None}]
    response = real.hotspots_csv(h3_list=a, from_=date(2025, 3, 1), to=date(2025, 3, 31), min_confidence="alta")
    assert response.status_code == 200
    lines = response.body.decode().splitlines()
    assert lines[:3] == ["# attribution=NASA FIRMS", "# methodology_version=1.2.0-hybrid-biome", "# data_cutoff=2025-03-02"]
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[3:]))))
    assert len(rows) == 1 and rows[0]["frp_mw"] == "12.0"


def test_mock_is_default(monkeypatch):
    monkeypatch.delenv("FIRELY_API_MODE", raising=False)
    assert main.calendar(from_=date(2021, 3, 1), to=date(2021, 3, 31))["mock"] is True


def test_main_routes_real(client):
    a, _ = client
    result = main.calendar(h3=a, from_=date(2025, 3, 1), to=date(2025, 3, 31))
    assert result["rows"][0]["count_harm"] == 6
    assert "mock" not in result


def test_missing_data_and_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    result = real.calendar()
    assert result["rows"] == []
    assert result["data_cutoff"] is None
    assert result["harmonization_uncertainty"] is None
