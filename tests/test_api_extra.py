"""Smoke and behaviour tests for the map-layer, territory, risk and watch endpoints (api/app/extra_routes.py)."""
import duckdb
import h3
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.app import extra_routes

CELL = h3.latlng_to_cell(25.4, -100.5, 6)
BBOX = "-100.6,25.3,-100.4,25.5"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    con = duckdb.connect()

    def write(rel, sql):
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY ({sql}) TO '{path}' (FORMAT PARQUET)")

    con.execute("CREATE TABLE hs(h3_r6 VARCHAR, date_local DATE, lat DOUBLE, lon DOUBLE, sensor VARCHAR, platform VARCHAR, confidence_h VARCHAR, frp_mw DOUBLE, daynight VARCHAR)")
    con.executemany("INSERT INTO hs VALUES (?, ?, 25.4, -100.5, 'VIIRS', 'SNPP', 'alta', ?, 'D')",
                    [(CELL, "2021-03-05", 10.0), (CELL, "2021-03-06", 55.0), (CELL, "2021-04-01", 3.0)])
    write("hotspots/Mexico/year=2021/part-0.parquet", "SELECT * FROM hs")
    con.execute("CREATE TABLE m(h3_r6 VARCHAR, year INTEGER, month INTEGER, count_harm DOUBLE, count_harm_lo DOUBLE, count_harm_hi DOUBLE, frp_harm DOUBLE, clear_frac DOUBLE, is_estimated BOOLEAN)")
    rows = [(CELL, y, 3, 30.0 if y == 2023 else 1.0, 1, 1, 5, None, False) for y in range(2019, 2024)]
    rows += [(CELL, 2020, 8, 0.3, 0, 0, 0, None, False), (CELL, 2023, 8, 45.0, 0, 0, 0, None, False)]
    con.executemany("INSERT INTO m VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    for y in range(2019, 2024):
        write(f"cell_month_harmonized/Mexico/year={y}/part.parquet", f"SELECT * EXCLUDE (year) FROM m WHERE year={y}")
    con.execute("CREATE TABLE b(h3_r6 VARCHAR, igbp INTEGER, biome INTEGER)")
    con.execute("INSERT INTO b VALUES (?, 12, 4)", [CELL])
    write("cell_biome/Mexico.parquet", "SELECT * FROM b")
    app = FastAPI()
    app.include_router(extra_routes.router)
    return TestClient(app)


def test_hotspots_geojson_filters_dates_and_truncates(client):
    full = client.get("/hotspots.geojson", params={"bbox": BBOX, "from": "2021-03-01", "to": "2021-03-31"}).json()
    assert full["type"] == "FeatureCollection" and len(full["features"]) == 2
    assert full["n_total"] == 2 and full["truncated"] is False
    assert full["attribution"] == "NASA FIRMS"
    top = client.get("/hotspots.geojson", params={"bbox": BBOX, "from": "2021-03-01", "to": "2021-04-30", "limit": 1}).json()
    assert top["truncated"] is True and top["n_total"] == 3
    assert top["features"][0]["properties"]["frp_mw"] == 55.0  # the strongest FRP survives truncation


def test_recurrence_counts_years_with_activity(client):
    body = client.get("/recurrence", params={"bbox": BBOX, "from": "2019-01-01", "to": "2023-12-31"}).json()
    cell = next(f for f in body["features"] if f["properties"]["h3"] == CELL)
    assert cell["properties"]["years_burned"] == 5 and body["n_years"] == 5
    assert cell["geometry"]["type"] == "Polygon" and cell["geometry"]["coordinates"][0][0] == cell["geometry"]["coordinates"][0][-1]


def test_burn_type_uses_land_cover_and_rejects_unknown(client):
    # the only cell is cropland (biome 4): agricola keeps it, forestal (natural vegetation) drops it
    from datetime import date
    from fastapi import HTTPException
    import api.app.real as real
    args = dict(bbox=BBOX, from_=date(2019, 1, 1), to=date(2023, 12, 31), metric="count", reference="median")
    agri = real.calendar(burn_type="agricola", **args)
    forest = real.calendar(burn_type="forestal", **args)
    assert any(r["count_harm"] for r in agri["rows"]) and not any(r["count_harm"] for r in forest["rows"])
    assert "cobertura del suelo" in agri["burn_type_basis"]
    with pytest.raises(HTTPException) as exc:
        real.calendar(burn_type="otro", **args)
    assert exc.value.status_code == 422


def test_points_csv_accepts_burn_type_like_the_calendar(client):
    # regression: the explorer sends burn_type with the points download; it used to answer 422
    from datetime import date
    import api.app.real as real
    args = dict(bbox=BBOX, from_=date(2019, 1, 1), to=date(2023, 12, 31))
    agri = real.hotspots_csv(burn_type="agricola", **args).body.decode()
    forest = real.hotspots_csv(burn_type="forestal", **args).body.decode()
    assert "# burn_type=agricola" in agri
    assert len(agri.strip().splitlines()) > len(forest.strip().splitlines())


def test_watch_floors_the_reference_so_tiny_medians_do_not_explode(client, monkeypatch):
    # August: median of the other years is 0.3 detections; 45 now would be 150x without the floor
    import json
    (extra_routes.db.processed_root() / "metadata").mkdir(parents=True, exist_ok=True)
    (extra_routes.db.processed_root() / "metadata" / "harmonization_summary.json").write_text(json.dumps({"countries": {"Mexico": {"last_ym": 202308}}}))
    con = duckdb.connect()
    root = extra_routes.db.processed_root()
    con.execute("CREATE TABLE u(level VARCHAR, code VARCHAR, name VARCHAR, parent_code VARCHAR, bbox_west DOUBLE, bbox_south DOUBLE, bbox_east DOUBLE, bbox_north DOUBLE)")
    con.execute("INSERT INTO u VALUES ('mun', '05004', 'Arteaga', '05', -101, 25, -100, 26)")
    (root / "geo" / "Mexico").mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY u TO '{root / 'geo' / 'Mexico' / 'admin_units.parquet'}' (FORMAT PARQUET)")
    con.execute("CREATE TABLE a(level VARCHAR, code VARCHAR, h3_r6 VARCHAR)")
    con.execute("INSERT INTO a VALUES ('mun', '05004', ?)", [CELL])
    con.execute(f"COPY a TO '{root / 'geo' / 'Mexico' / 'admin_cells.parquet'}' (FORMAT PARQUET)")
    body = client.get("/watch", params={"level": "mun", "country": "Mexico", "top": 5}).json()
    assert body["period"] == "2023-08"
    row = body["rows"][0]
    assert row["count"] == 45.0 and row["ratio"] == pytest.approx(9.0)  # 45 / max(0.3, 5)


def test_territory_and_risk_degrade_without_geo_tables(client):
    t = client.get("/territory", params={"bbox": BBOX}).json()
    assert t["cells"] >= 1 and t["admin"] is None and t["localities"] == []
    r = client.get("/risk", params={"bbox": BBOX})
    assert r.status_code == 200 and 0 <= r.json()["index"] <= 100
