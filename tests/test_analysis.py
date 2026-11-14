from datetime import date, timedelta

import duckdb
import pytest
from fastapi import HTTPException

from api.app.analysis_routes import (router, return_period as return_period_route,
                                     analogs as analogs_route)
from pipeline import analysis

CELL = "864990cf7ffffff"


@pytest.fixture
def data(tmp_path, monkeypatch):
    root = tmp_path / "processed"
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(root))
    con = duckdb.connect(":memory:")
    con.execute("SET memory_limit='1GB'")
    con.execute("CREATE TABLE months (h3_r6 VARCHAR, year INTEGER, month INTEGER, count_harm DOUBLE, is_estimated BOOLEAN)")
    rows = [(CELL, y, m, 10.0 if m == 3 else 0.0, y == 2019)
            for y in (2019, 2020, 2021, 2022) for m in range(1, 13)]
    rows += [(CELL, 2023, m, 1.0, False) for m in range(1, 5)]
    con.executemany("INSERT INTO months VALUES (?, ?, ?, ?, ?)", rows)
    for y in range(2019, 2024):
        p = root / "cell_month_harmonized" / "Mexico" / f"year={y}" / "part.parquet"
        p.parent.mkdir(parents=True)
        con.execute(f"COPY (SELECT h3_r6, month, count_harm, is_estimated FROM months WHERE year={y}) TO '{p}' (FORMAT PARQUET)")
    con.execute("CREATE TABLE spots (h3_r6 VARCHAR, date_local DATE, sensor VARCHAR, platform VARCHAR, daynight VARCHAR)")
    spots = [(CELL, date(2021, 1, 4) + timedelta(days=i), "VIIRS", "SNPP", "N") for i in range(7)]
    spots += [(CELL, date(2021, 1, 4), "MODIS", "Aqua", "D")] * 20
    spots += [(CELL, date(2021, 1, 4), "VIIRS", "NOAA21", "D")] * 20
    con.executemany("INSERT INTO spots VALUES (?, ?, ?, ?, ?)", spots)
    p = root / "hotspots" / "Mexico" / "year=2021" / "part-0.parquet"
    p.parent.mkdir(parents=True)
    con.execute(f"COPY spots TO '{p}' (FORMAT PARQUET)")
    # fire events: one per weekday (kept), one with <3 hotspots and one estimated (both excluded)
    con.execute("CREATE TABLE ev (start_date DATE, n_hotspots_harm DOUBLE, cells VARCHAR[], estimated BOOLEAN)")
    evs = [(date(2021, 1, 4) + timedelta(days=i), 5.0, [CELL], False) for i in range(7)]
    evs += [(date(2021, 1, 4), 1.0, [CELL], False), (date(2021, 1, 4), 9.0, [CELL], True)]
    con.executemany("INSERT INTO ev VALUES (?, ?, ?, ?)", evs)
    p = root / "events" / "Mexico" / "year=2021" / "part-0.parquet"
    p.parent.mkdir(parents=True)
    con.execute(f"COPY ev TO '{p}' (FORMAT PARQUET)")
    p = root / "context" / "oni.parquet"
    p.parent.mkdir(parents=True)
    con.execute("CREATE TABLE oni (year INTEGER, month INTEGER, oni DOUBLE, phase VARCHAR)")
    con.executemany("INSERT INTO oni VALUES (?, 3, 0.0, 'neutral')", [(y,) for y in range(2019, 2023)])
    con.execute(f"COPY oni TO '{p}' (FORMAT PARQUET)")
    con.close()
    return root


def test_season_interpolation_and_incomplete_year(data):
    result = analysis.season([CELL])
    assert [r["year"] for r in result["rows"]] == [2019, 2020, 2021, 2022]
    assert result["rows"][2]["onset"] == "2021-03-04"
    assert result["rows"][2]["peak"] == "2021-03-16"
    assert result["rows"][0]["is_estimated"] is True
    assert result["trend"]["onset"]["p_value"] == 1.0
    assert "no hay una tendencia clara" in result["summary_es"]


def test_analogs_and_return_period(data):
    result = analysis.analogs([CELL], date(2021, 3, 31))
    assert [r["year"] for r in result["analogs"]] == [2019, 2020]
    assert result["estimated_analog_years"] == [2019]
    assert result["projection"] == {"p10": 10.0, "p50": 10.0, "p90": 10.0}
    period = analysis.return_period([CELL], 2021, 3)
    assert period["n_reference_years"] == 3
    assert period["percentile"] == pytest.approx(0.5)
    assert period["return_period_years"] == pytest.approx(2.0)
    assert analysis.return_period([CELL], 2023, 5)["percentile"] is None


def test_weekday_night_filter_and_statistics(data):
    w = analysis.weekday([CELL])
    assert w["counts_monday_first"] == [1] * 7
    assert w["n_events"] == 7 and w["p_value"] == 1.0
    assert "pocos" in w["summary_es"]
    n = analysis.night_ratio([CELL])
    assert n["rows"] == [{"year": 2021, "night_detections": 7,
                           "total_detections": 7, "night_ratio": 1.0}]
    assert analysis.weekday([])["n_events"] == 0


def test_routes_envelope_and_area(data):
    body = return_period_route(year=2021, month=3, h3=CELL)
    assert body["attribution"] == "NASA FIRMS"
    assert body["data_cutoff"] == "2023-04-30"
    assert body["area"]["cells"] == 1
    with pytest.raises(HTTPException) as exc:
        analogs_route(date_=date(2024, 3, 31), h3=CELL)
    assert exc.value.status_code == 422


def test_router_and_significant_statistics(data, monkeypatch):
    assert {r.path for r in router.routes} == {"/season", "/analogs", "/return-period", "/weekday", "/night"}
    assert analysis._trend([(y, y * 5) for y in range(2001, 2011)])["p_value"] < 0.01
    # 60 events starting on Mondays vs 1 on each other day: a genuine weekday effect in independent events
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE ev (start_date DATE, n_hotspots_harm DOUBLE, cells VARCHAR[], estimated BOOLEAN)")
    mondays = [date(2022, 1, 3) + timedelta(days=7 * i) for i in range(60)]
    others = [date(2022, 1, 4) + timedelta(days=i) for i in range(6)]
    con.executemany("INSERT INTO ev VALUES (?, 5.0, ?, false)", [(d, [CELL]) for d in mondays + others])
    p = analysis.db.processed_root() / "events" / "Mexico" / "year=2022" / "part-0.parquet"
    p.parent.mkdir(parents=True)
    con.execute(f"COPY ev TO '{p}' (FORMAT PARQUET)")
    result = analysis.weekday([CELL])
    assert result["p_value"] < 0.01
    assert "significativamente" in result["summary_es"]
