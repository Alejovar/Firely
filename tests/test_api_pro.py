"""Tests for api/app/pro_routes.py: read-only SQL, bulletin, CAP drafts, spread, wind localities, regimes."""
import duckdb
import h3
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api.app import pro_routes

CELL = h3.latlng_to_cell(25.4, -100.5, 6)
BBOX = "-100.6,25.3,-100.4,25.5"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    monkeypatch.setenv("FIRELY_API_MODE", "real")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    con = duckdb.connect()

    def write(rel, sql):
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY ({sql}) TO '{path}' (FORMAT PARQUET)")

    con.execute("CREATE TABLE m(h3_r6 VARCHAR, year INTEGER, month INTEGER, count_harm DOUBLE, count_harm_lo DOUBLE, count_harm_hi DOUBLE, frp_harm DOUBLE, clear_frac DOUBLE, is_estimated BOOLEAN)")
    rows = []
    for y in range(2001, 2024):
        early = y <= 2012
        rows.append((CELL, y, 3 if early else 8, 4.0 if early else 20.0, 1, 1, 5, None, early))  # peak and level shift
        rows.append((CELL, y, 5, 2.0, 1, 1, 5, None, early))
    con.executemany("INSERT INTO m VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    for y in range(2001, 2024):
        write(f"cell_month_harmonized/Mexico/year={y}/part.parquet", f"SELECT * EXCLUDE (year) FROM m WHERE year={y}")
    con.execute("CREATE TABLE e(event_id VARCHAR, start_date DATE, centroid_lat DOUBLE, centroid_lon DOUBLE, n_hotspots_harm DOUBLE)")
    con.execute("INSERT INTO e VALUES ('ev1', '2021-03-05', 25.4, -100.5, 12.0)")
    write("events/Mexico/year=2021/part.parquet", "SELECT * FROM e")
    con.execute("CREATE TABLE b(h3_r6 VARCHAR, igbp INTEGER, biome INTEGER)")
    con.execute("INSERT INTO b VALUES (?, 12, 4)", [CELL])
    write("cell_biome/Mexico.parquet", "SELECT * FROM b")
    con.execute("CREATE TABLE c(h3_r6 VARCHAR, fire_regime_class INTEGER)")
    con.execute("INSERT INTO c VALUES (?, 3)", [CELL])
    write("cell_class/Mexico.parquet", "SELECT * FROM c")
    con.execute("CREATE TABLE l(cvegeo VARCHAR, name VARCHAR, cve_ent VARCHAR, cve_mun VARCHAR, pop BIGINT, lat DOUBLE, lon DOUBLE)")
    con.execute("INSERT INTO l VALUES ('1','Este grande','05','001',5000,25.4,-100.3), ('2','Este chico','05','001',100,25.41,-100.35), ('3','Oeste','05','001',9000,25.4,-100.7), ('4','Lejos','05','001',99999,25.4,-99.0)")
    write("geo/Mexico/localities.parquet", "SELECT * FROM l")
    monkeypatch.setattr(pro_routes, "_fetch_wind", lambda lat, lon, hours: {"speed_kmh": 20.0, "from_deg": 270.0, "hours": hours})
    app = FastAPI()
    app.include_router(pro_routes.router)
    return TestClient(app)


# ---- /sql
def test_sql_select_returns_columns_rows_and_query(client):
    body = client.post("/sql", json={"query": "SELECT year, sum(count_harm) AS n FROM cell_month_harmonized GROUP BY year ORDER BY year"}).json()
    assert body["columns"] == ["year", "n"] and body["rows"][0] == [2001, 6.0] and body["attribution"] == "NASA FIRMS"
    assert "FROM cell_month_harmonized" in body["query"] and "methodology_version" in body and "data_cutoff" in body
    assert "events" in body["views"]


def test_sql_row_limit(client):
    body = client.post("/sql", json={"query": "SELECT * FROM range(5000)"}).json()
    assert body["n_rows"] == 1000 and body["truncated"] is True


def test_sql_with_cte_allowed(client):
    assert client.post("/sql", json={"query": "WITH a AS (SELECT 1 AS x) SELECT x FROM a"}).status_code == 200


@pytest.mark.parametrize("query", [
    "SELECT 1; DROP TABLE x",
    "SELECT 1;",
    "DROP TABLE events",
    "COPY (SELECT 1) TO '/tmp/x.csv'",
    "ATTACH '/tmp/x.db'",
    "INSTALL httpfs",
    "LOAD httpfs",
    "PRAGMA database_list",
    "SET enable_external_access=true",
    "SELECT * FROM read_csv('/etc/passwd')",
    "SELECT * FROM READ_PARQUET('/etc/passwd')",
    "SELECT * FROM '/etc/passwd'",
    "SELECT * FROM glob('/etc/*')",
    "SELECT * FROM read_text('/etc/passwd')",
    "SELECT 1 /* x */ FROM events",
    "SELECT 1 -- x",
    'SELECT * FROM "read_csv"(\'/etc/passwd\')',
    "SELECT * FROM events WHERE 1=1 UNION SELECT * FROM duckdb_settings()",
    "SELECT getenv('HOME')",
    "INSERT INTO events VALUES (1)",
    "DESCRIBE events",
    "EXPLAIN SELECT 1",
    "",
])
def test_sql_rejects_injections(client, query):
    r = client.post("/sql", json={"query": query})
    assert r.status_code in (400, 422), query


def test_engine_blocks_file_access_even_if_guard_missed(client):
    # bypass the text guard: the engine itself must refuse files outside data/processed
    with pytest.raises(HTTPException) as e:
        pro_routes.run_sql.__wrapped__ if False else None
        monkey = pro_routes.validate_sql
        pro_routes.validate_sql = lambda q: q
        try:
            pro_routes.run_sql("SELECT * FROM read_csv('/etc/passwd')")
        finally:
            pro_routes.validate_sql = monkey
    assert e.value.status_code == 400


# ---- /bulletin
def test_bulletin_template(client):
    body = client.get("/bulletin", params={"bbox": BBOX}).json()
    assert body["title"] and body["sources"] and body["generated_by"] == "template"
    assert body["attribution"] == "NASA FIRMS" and "methodology_version" in body and "data_cutoff" in body
    heads = [s["heading"] for s in body["sections"]]
    assert "Semáforo de prioridad" in heads and "Aviso" in heads
    assert any("detecciones equivalentes" in s["text"] for s in body["sections"])


def test_bulletin_requires_area(client):
    assert client.get("/bulletin").status_code == 422


# ---- /cap
def test_cap_draft_approve_never_actual(client, tmp_path):
    d = client.post("/cap/draft", json={"area": {"bbox": BBOX}, "text": "Prueba <&> de ejercicio", "severity": "Severe"}).json()
    draft = d["draft"]
    assert draft["status"] == "Exercise" and draft["approval"] == "borrador" and d["published"] is False
    assert "<status>Exercise</status>" in draft["xml"] and "Actual" not in draft["xml"] and "&lt;&amp;&gt;" in draft["xml"]
    assert "<polygon>" in draft["xml"]
    a = client.post(f"/cap/approve/{draft['id']}").json()["draft"]
    assert a["approval"] == "aprobado_para_ejercicio" and a["status"] == "Exercise" and "<status>Exercise</status>" in a["xml"]
    listed = client.get("/cap/drafts").json()["drafts"]
    assert len(listed) == 1 and listed[0]["approval"] == "aprobado_para_ejercicio"
    assert (tmp_path / "cap_drafts" / f"{draft['id']}.json").is_file()


def test_cap_rejects_bad_severity_and_bad_ids(client):
    assert client.post("/cap/draft", json={"area": "x", "text": "t", "severity": "Catastrophic"}).status_code == 422
    assert client.post("/cap/approve/..%2F..%2Fetc").status_code in (404, 422)
    assert client.post("/cap/approve/" + "0" * 32).status_code == 404


# ---- /spread and /wind-localities
def test_spread_cone_west_wind_points_east(client):
    body = client.get("/spread", params={"lat": 25.4, "lon": -100.5, "hours": 10}).json()
    assert body["indicative"] is True and body["official_forecast"] is False and "orientativa" in body["warning"]
    assert body["direction"]["toward_compass"] == "E" and body["reach_km"] == 10.0  # 20 km/h * 0.05 * 10 h
    ring = body["cone"]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1] and all(p[0] >= -100.5 - 1e-6 for p in ring)
    assert body["wind"]["source"] == "Open-Meteo" and body["attribution"] == "NASA FIRMS"


def test_spread_from_event_and_area(client):
    assert client.get("/spread", params={"event_id": "ev1"}).json()["origin"]["lat"] == 25.4
    assert client.get("/spread", params={"bbox": BBOX}).status_code == 200
    assert client.get("/spread", params={"event_id": "nope"}).status_code == 404


def test_spread_503_when_wind_fails(client, monkeypatch):
    def boom(lat, lon, hours):
        raise HTTPException(503, detail={"code": "wind_unavailable", "message": "x"})
    monkeypatch.setattr(pro_routes, "_fetch_wind", boom)
    r = client.get("/spread", params={"lat": 25.4, "lon": -100.5})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "wind_unavailable"


def test_fetch_wind_wraps_network_errors(monkeypatch):
    import requests

    def boom(*a, **k):
        raise requests.ConnectionError("down")
    monkeypatch.setattr(pro_routes.requests, "get", boom)
    with pytest.raises(HTTPException) as e:
        pro_routes._fetch_wind(25.0, -100.0, 24)
    assert e.value.status_code == 503 and e.value.detail["code"] == "wind_unavailable"


def test_wind_localities_downwind_sorted_by_population(client):
    body = client.get("/wind-localities", params={"lat": 25.4, "lon": -100.5, "hours": 10}).json()
    names = [x["name"] for x in body["localities"]]
    assert names == ["Este grande", "Este chico"]  # Oeste is upwind, Lejos is beyond the 100 km cap
    first = body["localities"][0]
    assert first["compass"] == "E" and 15 < first["distance_km"] < 25 and body["indicative"] is True


# ---- /regimes
def test_regimes_class_and_change(client):
    body = client.get("/regimes", params={"bbox": BBOX}).json()
    assert body["type"] == "FeatureCollection" and body["regime_counts"]["3"] == 1
    f = next(x for x in body["features"] if x["properties"]["h3"] == CELL)
    ch = f["properties"]["change"]
    assert f["properties"]["regime_class"] == 3 and f["properties"]["changed"] is True
    assert ch["annual_early"] == 6.0 and ch["annual_late"] == 22.0 and ch["peak_month_early"] == 3 and ch["peak_month_late"] == 8
    assert body["change"]["n_cells_changed"] == 1 and body["attribution"] == "NASA FIRMS"
    ring = f["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]
