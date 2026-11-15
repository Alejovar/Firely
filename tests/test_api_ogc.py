"""OGC API Features, KML export and MCP tool listing."""
import asyncio
import importlib.util
import json
from pathlib import Path

import duckdb
import h3
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.app import export_routes, ogc_routes

CELL = h3.latlng_to_cell(25.4, -100.5, 6)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    monkeypatch.setenv("FIRELY_API_MODE", "real")
    con = duckdb.connect()

    def write(rel, sql):
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY ({sql}) TO '{path}' (FORMAT PARQUET)")

    con.execute("CREATE TABLE ev(event_id VARCHAR, start_date DATE, end_date DATE, duration_days INTEGER, n_hotspots_harm DOUBLE, frp_total DOUBLE, area_approx_km2 DOUBLE, night_ratio DOUBLE, burn_type VARCHAR, centroid_lat DOUBLE, centroid_lon DOUBLE, geometry BLOB, estimated BOOLEAN)")
    con.executemany("INSERT INTO ev VALUES (?, ?, ?, 2, ?, 10, 1.5, 0.2, 'forestal', 25.4, -100.5, NULL, false)",
                    [("big", "2021-03-05", "2021-03-07", 5.0), ("single", "2021-03-05", "2021-03-05", 1.0),
                     ("far", "2021-03-05", "2021-03-07", 9.0)])
    con.execute("UPDATE ev SET centroid_lon=-90 WHERE event_id='far'")
    write("events/Mexico/year=2021/part-0.parquet", "SELECT * FROM ev")
    con.execute("CREATE TABLE m(h3_r6 VARCHAR, month INTEGER, count_harm DOUBLE, is_estimated BOOLEAN)")
    con.executemany("INSERT INTO m VALUES (?, ?, ?, false)", [(CELL, 3, 4.0), (CELL, 4, 6.0)])
    write("cell_month_harmonized/Mexico/year=2021/part.parquet", "SELECT * FROM m")
    (tmp_path / "metadata").mkdir()
    (tmp_path / "metadata" / "harmonization_summary.json").write_text(json.dumps({"countries": {"Mexico": {"last_ym": 202112}}}))
    app = FastAPI()
    app.include_router(ogc_routes.router)
    app.include_router(export_routes.router)
    return TestClient(app)


def test_landing_conformance_collections(client):
    for path in ("/ogc", "/ogc/conformance", "/ogc/collections", "/ogc/collections/events"):
        body = client.get(path).json()
        assert body["attribution"] == "NASA FIRMS" and body["methodology_version"] and body["data_cutoff"] == "2021-12-31"
    assert {c["id"] for c in client.get("/ogc/collections").json()["collections"]} == {"events", "cell_activity"}
    assert "conformsTo" in client.get("/ogc/conformance").json()
    assert client.get("/ogc/collections/nope").status_code == 404


def test_events_items_filters_single_points_and_bbox(client):
    r = client.get("/ogc/collections/events/items")
    assert r.headers["content-type"].startswith("application/geo+json")
    body = r.json()
    assert {f["id"] for f in body["features"]} == {"big", "far"} and body["numberMatched"] == 2
    near = client.get("/ogc/collections/events/items", params={"bbox": "-101,25,-100,26"}).json()
    assert [f["id"] for f in near["features"]] == ["big"]
    assert near["features"][0]["geometry"]["type"] == "Point"
    assert client.get("/ogc/collections/events/items", params={"datetime": "2022-01-01/.."}).json()["numberReturned"] == 0
    page = client.get("/ogc/collections/events/items", params={"limit": 1}).json()
    assert page["numberReturned"] == 1 and any(link["rel"] == "next" for link in page["links"])
    assert client.get("/ogc/collections/events/items", params={"bbox": "x"}).status_code == 400


def test_cell_activity_polygons_for_period(client):
    body = client.get("/ogc/collections/cell_activity/items", params={"datetime": "2021-03-01/2021-03-31"}).json()
    feat = body["features"][0]
    assert feat["geometry"]["type"] == "Polygon" and feat["properties"]["count_harm"] == 4.0
    default = client.get("/ogc/collections/cell_activity/items").json()["features"][0]
    assert default["properties"]["count_harm"] == 10.0  # latest year
    assert default["properties"]["h3_r6"] == CELL


def test_export_kml_has_attribution(client, tmp_path):
    con = duckdb.connect()
    path = tmp_path / "hotspots/Mexico/year=2021/p.parquet"
    path.parent.mkdir(parents=True)
    con.execute(f"COPY (SELECT '{CELL}' h3_r6, DATE '2021-03-05' date_local, 25.4 lat, -100.5 lon, 'VIIRS' sensor, 'SNPP' platform, 'alta' confidence_h, 12.0 frp_mw, 'D' daynight) TO '{path}' (FORMAT PARQUET)")
    r = client.get("/export.kml", params={"bbox": "-100.6,25.3,-100.4,25.5", "from": "2021-03-01", "to": "2021-03-31"})
    assert r.status_code == 200 and "kml" in r.headers["content-type"]
    assert "NASA FIRMS" in r.text and "<coordinates>-100.5,25.4,0</coordinates>" in r.text


def test_mcp_lists_tools():
    spec = importlib.util.spec_from_file_location("firely_mcp_server", Path(__file__).parents[1] / "mcp" / "server.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    names = {t.name for t in asyncio.run(mod.mcp.list_tools())}
    assert {"calendar", "season", "analogs", "return_period", "risk", "watch", "resolve_area"} <= names


def test_kml_explains_each_point(client, monkeypatch):
    from api.app import export_routes
    fake = {"type": "FeatureCollection", "truncated": False, "n_total": 2, "data_cutoff": "2026-08-31",
            "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [-100.3, 25.4]},
                          "properties": {"date": "2021-03-17", "sensor": "VIIRS", "platform": "SNPP", "frp_mw": 52.4,
                                         "confidence_h": "alta", "daynight": "N"}},
                         {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-100.2, 25.5]},
                          "properties": {"date": "2021-03-18", "sensor": "MODIS", "platform": "Aqua", "frp_mw": 3,
                                         "confidence_h": "nominal", "daynight": "D"}}]}
    monkeypatch.setattr(export_routes, "hotspots_geojson", lambda **kw: fake)
    r = client.get("/export.kml", params={"bbox": "-100.9,25.2,-100.2,25.7", "from": "2021-03-01", "to": "2021-03-31", "limit": 50})
    assert r.status_code == 200
    body = r.text
    assert "No es el contorno de un incendio" in body and "<Folder>" in body
    assert "Potencia del fuego (FRP)" in body and "#frp-alto" in body and "#frp-bajo" in body
    assert "17 de marzo de 2021: 1 punto" in body and "VIIRS a bordo de Suomi NPP" in body
