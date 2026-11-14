import json
from datetime import date

import duckdb
import h3
import pytest
from fastapi import HTTPException

from api.app import main


@pytest.fixture
def data(tmp_path, monkeypatch):
    cell = h3.latlng_to_cell(25.4, -100.5, 6)
    con = duckdb.connect()

    def write(rel, sql):
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY ({sql}) TO '{path}' (FORMAT PARQUET)")

    con.execute("CREATE TABLE units(level VARCHAR, code VARCHAR, name VARCHAR, parent_code VARCHAR, bbox_west DOUBLE, bbox_south DOUBLE, bbox_east DOUBLE, bbox_north DOUBLE)")
    con.executemany("INSERT INTO units VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
        ("ent", "05", "Coahuila", None, -101, 25, -100, 26),
        ("mun", "05004", "Arteaga", "05", -101, 25, -100, 26),
        ("mun", "16010", "Arteaga", "16", -102, 18, -101, 19),
    ])
    write("geo/Mexico/admin_units.parquet", "SELECT * FROM units")
    con.execute("CREATE TABLE ac(level VARCHAR, code VARCHAR, h3_r6 VARCHAR)")
    con.executemany("INSERT INTO ac VALUES (?, ?, ?)", [("ent", "05", cell), ("mun", "05004", cell)])
    write("geo/Mexico/admin_cells.parquet", "SELECT * FROM ac")
    con.execute("CREATE TABLE monthly(h3_r6 VARCHAR, year INTEGER, month INTEGER, count_harm DOUBLE, count_harm_lo DOUBLE, count_harm_hi DOUBLE, frp_harm DOUBLE, clear_frac DOUBLE, is_estimated BOOLEAN)")
    con.executemany("INSERT INTO monthly VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [(cell, 2021, 3, 4, 3, 5, 20, None, False), (cell, 2021, 4, 2, 1, 3, 10, None, False), (cell, 2022, 3, 1, 1, 1, 5, None, False)])
    write("cell_month_harmonized/Mexico/year=2021/part.parquet", "SELECT * EXCLUDE (year) FROM monthly WHERE year=2021")
    write("cell_month_harmonized/Mexico/year=2022/part.parquet", "SELECT * EXCLUDE (year) FROM monthly WHERE year=2022")
    con.execute("CREATE TABLE clear(h3_r6 VARCHAR, year INTEGER, month INTEGER, clear_frac DOUBLE)")
    con.execute("INSERT INTO clear VALUES (?, 2021, 3, 0.7)", [cell])
    write("context/clear_frac_coahuila.parquet", "SELECT * FROM clear")
    con.execute("CREATE TABLE oni(year INTEGER, month INTEGER, oni DOUBLE, phase VARCHAR)")
    con.execute("INSERT INTO oni VALUES (2021, 3, -0.8, 'nina')")
    write("context/oni.parquet", "SELECT * FROM oni")
    con.execute("CREATE TABLE fwi(h3_r6 VARCHAR, year INTEGER, month INTEGER, fwi_mean DOUBLE, fwi_anom DOUBLE, dc_anom DOUBLE, dmc_anom DOUBLE)")
    con.execute("INSERT INTO fwi VALUES (?, 2021, 3, 10, 2, 3, 4)", [cell])
    write("context/fwi_coahuila_month.parquet", "SELECT * FROM fwi")
    con.execute("CREATE TABLE ev(event_id VARCHAR, start_date DATE, end_date DATE, duration_days INTEGER, n_hotspots_harm DOUBLE, frp_total DOUBLE, area_approx_km2 DOUBLE, night_ratio DOUBLE, burn_type VARCHAR, centroid_lat DOUBLE, centroid_lon DOUBLE, geometry BLOB, cells VARCHAR[], rank INTEGER, estimated BOOLEAN)")
    con.executemany("INSERT INTO ev VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        ("a", date(2021, 3, 1), date(2021, 3, 2), 2, 5, 30, 1, 0.2, "forestal", 25.4, -100.5, b"ab", [cell], 2, False),
        ("b", date(2021, 4, 1), date(2021, 4, 1), 1, 4, 10, 0.5, 0, None, 25.4, -100.5, b"cd", [cell], 3, False),
    ])
    write("events/Mexico/year=2021/part.parquet", "SELECT * FROM ev")
    con.execute("CREATE TABLE rep(cve_ent VARCHAR, cve_mun VARCHAR, year INTEGER, month INTEGER, n_fires INTEGER, area_ha DOUBLE)")
    con.execute("INSERT INTO rep VALUES ('05','004',2021,3,2,8)")
    write("reported/reported_fires.parquet", "SELECT * FROM rep")
    con.close()
    meta = tmp_path / "metadata"
    meta.mkdir()
    (meta / "harmonization_summary.json").write_text(json.dumps({"countries": {"Mexico": {"last_ym": 202203}}}))
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    monkeypatch.setenv("FIRELY_API_MODE", "real")
    return cell


def test_admin_search_resolution_and_ambiguity(data):
    candidates = main.admin_search("ARTEAGA")["candidates"]
    assert len(candidates) == 2 and all("bbox" in x for x in candidates)
    with pytest.raises(HTTPException) as exc:
        main.calendar(admin="arteaga", from_=date(2021, 3, 1))
    assert exc.value.status_code == 300 and len(exc.value.detail["candidates"]) == 2
    row = main.calendar(admin="coahuila", from_=date(2021, 3, 1), to=date(2021, 3, 31))["rows"][0]
    assert (row["count_harm"], row["clear_frac"], row["enso_phase"]) == (4, 0.7, "nina")
    assert main.calendar(admin="05", from_=date(2021, 3, 1))["area"]["code"] == "05"


def test_context_events_reported(data):
    cell = data
    params = {"h3": cell, "from_": date(2021, 3, 1), "to": date(2021, 3, 31)}
    context = main.context(**params)
    assert context["rows"] == [{"year": 2021, "month": 3, "oni": -0.8, "enso_phase": "nina", "fwi_mean": 10, "fwi_anom": 2, "dc_anom": 3, "dmc_anom": 4}]
    events = main.events(**{**params, "min_hotspots": 3})["rows"]
    assert len(events) == 1 and events[0]["event_id"] == "a" and events[0]["area_rank"] == 1
    assert main.events(**{**params, "min_hotspots": 6})["rows"] == []
    reported = main.reported(admin="05004", from_=date(2021, 3, 1), to=date(2021, 4, 30))["rows"]
    assert reported[0]["reported_fires"] == 2 and reported[0]["detected_hotspots_state_year"] == 6
    assert reported[1]["reported_fires"] is None and reported[1]["state_year_reported_data"] is True
    missing = main.reported(admin="05", from_=date(2022, 3, 1), to=date(2022, 3, 31))["rows"][0]
    assert missing["reported_fires"] is None and missing["state_year_reported_data"] is False
