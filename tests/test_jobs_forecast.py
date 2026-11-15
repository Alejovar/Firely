"""Tests for §17.2 pending items: GFWED 8-day forecast (/risk/forecast), priority per cell (/priority/cells),
subscriptions + daily alerts job, and the daily FIRMS NRT ingestion. The network is always mocked."""
import csv
import io
import json
from datetime import date, datetime, timedelta, timezone

import duckdb
import h3
import pytest
import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.app import forecast_routes, priority_routes, subscriptions_routes
from pipeline import alerts_job, nrt

CELL = h3.latlng_to_cell(25.4, -100.5, 6)
QUIET = h3.latlng_to_cell(25.9, -101.2, 6)
BBOX = "-100.6,25.3,-100.4,25.5"


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path / "processed"))
    monkeypatch.setenv("FIRELY_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("FIRELY_API_MODE", "real")
    root = tmp_path / "processed"
    con = duckdb.connect()

    def write(rel, sql, params=None):
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY ({sql}) TO '{path}' (FORMAT PARQUET)", params or [])

    con.execute("CREATE TABLE m(h3_r6 VARCHAR, year INTEGER, month INTEGER, count_harm DOUBLE, is_estimated BOOLEAN)")
    rows = []
    for y in range(2001, 2024):
        for m in range(1, 13):
            hot = 30.0 if (y, m) == (2023, 3) else 10.0 if m == 3 else 0.5
            rows.append((CELL, y, m, hot, y <= 2011))
            rows.append((QUIET, y, m, 0.0, y <= 2011))
    rows = [r for r in rows if (r[1], r[2]) <= (2023, 3)]
    con.executemany("INSERT INTO m VALUES (?, ?, ?, ?, ?)", rows)
    for y in range(2001, 2024):
        write(f"cell_month_harmonized/Mexico/year={y}/part.parquet", f"SELECT * EXCLUDE (year) FROM m WHERE year={y}")
    con.execute("CREATE TABLE l(cvegeo VARCHAR, name VARCHAR, pop BIGINT, lat DOUBLE, lon DOUBLE)")
    con.execute("INSERT INTO l VALUES ('1','Cerca',5000,25.4,-100.5)")
    write("geo/Mexico/localities.parquet", "SELECT * FROM l")
    con.execute("CREATE TABLE ltm(lat DOUBLE, lon DOUBLE, month INTEGER, fwi_ltm DOUBLE)")
    con.executemany("INSERT INTO ltm VALUES (?, ?, ?, 10.0)", [(25.5, -100.625, m) for m in range(1, 13)])
    write("context/fwi_longterm_month.parquet", "SELECT * FROM ltm")
    return tmp_path


def _client(*routers):
    app = FastAPI()
    for r in routers:
        app.include_router(r)
    return TestClient(app)


# ---------------------------------------------------------------- GFWED forecast
def _nc_bytes(tmp_path, value):
    """Small classic NetCDF (CDF-2) shaped like the GEOS-5 files: (time, lat, lon) float32 + other variables."""
    from scipy.io import netcdf_file
    path = tmp_path / f"f_{value}.nc"
    f = netcdf_file(str(path), "w", version=2)
    f.title = b"fake GFWED"
    f.createDimension("lat", 5)
    f.createDimension("lon", 6)
    f.createDimension("time", 1)
    lat = f.createVariable("lat", "d", ("lat",))
    lat[:] = [24.5, 25.0, 25.5, 26.0, 26.5]
    lon = f.createVariable("lon", "d", ("lon",))
    lon[:] = [-101.25, -100.9375, -100.625, -100.3125, -100.0, -99.6875]
    for name in ("GEOS-5_DC", "GEOS-5_FWI"):
        v = f.createVariable(name, "f", ("time", "lat", "lon"))
        v.units = b""
        v[:] = value if name == "GEOS-5_FWI" else 999.0
    f.close()
    return path.read_bytes()


class FakeResp:
    def __init__(self, status, content=b""):
        self.status_code, self.content = status, content


def fake_server(files, calls):
    def get(url, headers=None, timeout=None):
        calls.append(url)
        if url not in files:
            return FakeResp(404)
        start, end = map(int, headers["Range"].split("=")[1].split("-"))
        return FakeResp(206, files[url][start:end + 1])
    return get


def test_parse_header_matches_scipy(tmp_path):
    blob = _nc_bytes(tmp_path, 7.0)
    header = forecast_routes.parse_header(blob)
    assert header["dims"] == {"lat": 5, "lon": 6, "time": 1}
    fwi = header["vars"]["GEOS-5_FWI"]
    assert fwi["shape"] == [1, 5, 6] and fwi["type"] == 5
    import struct
    assert struct.unpack(">f", blob[fwi["begin"]:fwi["begin"] + 4])[0] == 7.0
    with pytest.raises(EOFError):
        forecast_routes.parse_header(blob[:40])


def test_forecast_longterm_cache_and_stale(data, monkeypatch):
    today = date.today()
    run = today - timedelta(days=1)  # today's folder missing: the route goes back one day
    files = {forecast_routes._url(run, run + timedelta(days=k)): _nc_bytes(data, 20.0 + k) for k in range(1, 9)}
    calls = []
    monkeypatch.setattr(forecast_routes, "_get", fake_server(files, calls))
    client = _client(forecast_routes.router)
    body = client.get("/risk/forecast", params={"bbox": BBOX}).json()
    assert body["forecast_run"] == run.isoformat() and body["stale"] is False
    assert len(body["days"]) == 8 and body["days"][0]["fwi_mean"] == 21.0
    assert body["climatology"]["basis"] == "longterm_mean" and body["climatology"]["fwi_ltm"] == 10.0
    assert body["level"] == "muy alto"  # 24.5 / 10 = 2.45x
    assert body["summary_es"].startswith("Esta semana el peligro meteorológico es muy alto")
    assert body["attribution"] == "NASA FIRMS" and body["methodology_version"]
    n = len(calls)
    assert client.get("/risk/forecast", params={"bbox": BBOX}).json()["days"] == body["days"]
    assert len(calls) == n  # served from the disk cache

    # NASA down and no marker for "tomorrow": a recent cached run is served as stale.
    def down(*a, **k):
        raise requests.ConnectionError("down")
    monkeypatch.setattr(forecast_routes, "_get", down)
    for marker in (data / "state" / "cache" / "gfwed_forecast").glob("latest_*"):
        marker.unlink()
    stale = client.get("/risk/forecast", params={"bbox": BBOX}).json()
    assert stale["stale"] is True and stale["days"] == body["days"]


def test_forecast_unavailable_503_and_fallbacks(data, monkeypatch):
    def down(*a, **k):
        raise requests.ConnectionError("down")
    monkeypatch.setattr(forecast_routes, "_get", down)
    r = _client(forecast_routes.router).get("/risk/forecast", params={"bbox": BBOX})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "gfwed_forecast_unavailable"
    # Without long-term mean nor history: absolute EFFIS class.
    (data / "processed" / "context" / "fwi_longterm_month.parquet").unlink()
    days = [{"date": f"2026-03-{d:02d}", "fwi_mean": 40.0, "fwi_max": 41.0, "n_grid": 1} for d in range(1, 9)]
    out = forecast_routes.assess(days, [CELL], (-100.6, 25.3, -100.4, 25.5))
    assert out["climatology"]["basis"] == "effis_absolute" and out["level"] == "muy alto" == out["effis_class"]
    # With the area's monthly FWI history: percentile.
    con = duckdb.connect()
    con.execute("CREATE TABLE f AS SELECT ? h3_r6, range::INTEGER AS year, 3 AS month, (10 + range - 2015)::DOUBLE AS fwi_mean "
                "FROM range(2015, 2024)", [CELL])
    con.execute(f"COPY f TO '{data / 'processed' / 'context' / 'fwi_coahuila_month.parquet'}' (FORMAT PARQUET)")
    out = forecast_routes.assess(days, [CELL], (-100.6, 25.3, -100.4, 25.5))
    assert out["climatology"]["basis"] == "history_percentile" and out["climatology"]["percentile"] == 1.0
    assert out["level"] == "muy alto"


# ---------------------------------------------------------------- priority per cell
def test_priority_cells_geojson_and_top10(data):
    client = _client(priority_routes.router)
    unknown = h3.latlng_to_cell(10.0, -60.0, 6)
    body = client.get("/priority/cells", params={"h3": f"{CELL},{QUIET},{unknown}"}).json()
    assert body["type"] == "FeatureCollection" and body["period"] == "2023-03"
    props = {f["properties"]["h3"]: f["properties"] for f in body["features"]}
    hot, quiet = props[CELL], props[QUIET]
    assert 0 <= quiet["index"] < hot["index"] <= 100
    assert hot["components"]["anomaly"] == 1.0 and hot["components"]["recurrence"] == 1.0
    assert hot["components"]["season"] == 1 and hot["population_10km"] == 5000
    assert props[unknown]["index"] is None and props[unknown]["level"] == "sin datos"
    assert [t["h3"] for t in body["top10"]] == [CELL, QUIET]
    assert body["features"][0]["geometry"]["type"] == "Polygon"
    # Weights are the same validated weights as /risk.
    only = client.get("/priority/cells", params={"h3": CELL, "w_anomaly": 1, "w_recurrence": 0, "w_exposure": 0,
                                                 "w_season": 0, "w_fwi": 0}).json()
    assert only["features"][0]["properties"]["index"] == 100.0
    assert client.get("/priority/cells", params={"h3": CELL, "w_anomaly": -1}).status_code == 422
    assert client.get("/priority/cells").status_code == 422


# ---------------------------------------------------------------- subscriptions + daily job
class FakeTelegram:
    def __init__(self):
        self.sent = []

    def send_message(self, chat_id, text):
        self.sent.append((chat_id, text))


def test_subscriptions_crud_and_alerts_job(data):
    client = _client(subscriptions_routes.router)
    r = client.post("/subscriptions", json={"name": "Arteaga", "area": {"h3": CELL}, "chat_id": 123456789, "min_index": 10})
    assert r.status_code == 201
    sub = r.json()["subscription"]
    assert sub["approved"] is False and sub["chat_id_masked"] == "…789" and "chat_id" not in sub
    low = client.post("/subscriptions", json={"name": "Alto umbral", "area": {"h3": CELL}, "chat_id": 5, "min_index": 100}).json()
    assert client.post("/subscriptions", json={"name": "x", "area": {}, "chat_id": 1}).status_code == 422
    assert len(client.get("/subscriptions").json()["rows"]) == 2

    # Preview: evaluates now with the real data and returns the message, never sends
    prev = client.get(f"/subscriptions/{sub['id']}/preview").json()
    assert prev["sent"] is False and prev["evaluation"]["triggered"] is True and prev["status"] == "pending_approval"
    assert prev["message"].startswith("[EJERCICIO / PRUEBA]") and "123456789" not in str(prev)
    assert client.get(f"/subscriptions/{low['subscription']['id']}/preview").json()["status"] == "below_threshold"
    assert client.get("/subscriptions/nope/preview").status_code == 404
    demo = client.post("/subscriptions", json={"name": "Solo prueba", "area": {"h3": CELL}, "min_index": 10}).json()["subscription"]
    assert demo["chat_id_masked"] is None
    assert client.get(f"/subscriptions/{demo['id']}/preview").json()["status"] == "no_chat"
    assert {e["subscription"]: e for e in alerts_job.run(telegram=FakeTelegram())}[demo["id"]]["status"] == "no_chat"
    client.delete(f"/subscriptions/{demo['id']}")

    tg = FakeTelegram()
    first = {e["subscription"]: e for e in alerts_job.run(telegram=tg)}
    assert first[sub["id"]]["status"] == "pending_approval" and tg.sent == []
    assert first[low["subscription"]["id"]]["status"] == "below_threshold"

    assert alerts_job.approve(sub["id"])
    dry = {e["subscription"]: e for e in alerts_job.run(dry_run=True, telegram=tg)}
    assert dry[sub["id"]]["status"] == "dry_run" and "EJERCICIO" in dry[sub["id"]]["message"] and tg.sent == []

    sent = {e["subscription"]: e for e in alerts_job.run(telegram=tg)}
    assert sent[sub["id"]]["status"] == "sent" and len(tg.sent) == 1
    chat, text = tg.sent[0]
    assert chat == 123456789 and text.startswith("[EJERCICIO / PRUEBA]") and "NASA FIRMS" in text
    assert "3.0× la mediana" in text  # 30 vs median 10 in March
    again = {e["subscription"]: e for e in alerts_job.run(telegram=tg)}
    assert again[sub["id"]]["status"] == "already_sent" and len(tg.sent) == 1  # idempotent

    # No token and no injected client: dry run, nothing sent.
    no_token = {e["subscription"]: e for e in alerts_job.run(token="")}
    assert no_token[low["subscription"]["id"]]["status"] == "below_threshold"
    log = (data / "state" / "alerts_log.jsonl").read_text().splitlines()
    assert log and all("123456789" not in line for line in log)

    assert client.delete(f"/subscriptions/{sub['id']}").json() == {"deleted": sub["id"]}
    assert client.delete(f"/subscriptions/{sub['id']}").status_code == 404


# ---------------------------------------------------------------- NRT daily ingestion
class CsvResp:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


def test_nrt_daily_ingest_dedupes(tmp_path, monkeypatch):
    monkeypatch.setattr(nrt.time, "sleep", lambda _: None)
    processed = tmp_path / "processed"
    inside, outside = (19.4, -99.1), (32.0, -110.0)  # Mexico City; Arizona (inside the bbox, outside Mexico)
    (processed / "geo" / "Mexico").mkdir(parents=True)
    with duckdb.connect() as con:
        con.execute(f"COPY (SELECT 'mun' AS level, '1' AS code, '{h3.latlng_to_cell(*inside, 6)}' AS h3_r6) "
                    f"TO '{processed / 'geo' / 'Mexico' / 'admin_cells.parquet'}' (FORMAT PARQUET)")
    batches = [[[*inside, "2026-11-14", "1200", "N", "h", 12, "D"], [*outside, "2026-11-14", "1200", "N", "h", 3, "D"]],
               [[*inside, "2026-11-14", "1200", "N", "h", 12, "D"], [*inside, "2026-11-13", "0800", "N", "n", 4, "N"]]]
    state = {"batch": 0}

    def getter(url, timeout):
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight"])
        if url.split("/")[7] == "VIIRS_SNPP_NRT":
            writer.writerows(batches[state["batch"]])
        return CsvResp(stream.getvalue())

    now = datetime(2026, 11, 14, 13, tzinfo=timezone.utc)
    monkeypatch.setenv("FIRELY_DATA_INTERIM", str(tmp_path / "interim"))
    out = tmp_path / "nrt"
    kw = dict(out=out, processed=processed, countries=("Mexico",), getter=getter, now=now, key="k", mask=set())
    first = nrt.ingest(**kw)
    assert first["countries"]["Mexico"] == {"fetched": 2, "in_country": 1, "new_rows": 1}
    state["batch"] = 1
    for cached in (tmp_path / "interim" / "nrt_cache").glob("*.csv"):
        cached.unlink()
    second = nrt.ingest(**kw)
    assert second["countries"]["Mexico"]["new_rows"] == 1  # only the 2026-11-13 detection is new
    assert nrt.ingest(**kw)["countries"]["Mexico"]["new_rows"] == 0
    with duckdb.connect() as con:
        rows = con.execute("SELECT date_utc, platform, frp_mw, source FROM read_parquet(?, hive_partitioning=false) ORDER BY 1",
                           [str(out / "Mexico" / "*" / "part.parquet")]).fetchall()
    assert [(str(d), p) for d, p, _, _ in rows] == [("2026-11-13", "SNPP"), ("2026-11-14", "SNPP")]
    assert all(src == "FIRMS NRT" for *_, src in rows)


def test_nrt_job_without_key_exits_clearly(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    monkeypatch.setattr(nrt, "map_key", lambda *a, **k: None)
    monkeypatch.setattr("sys.argv", ["nrt", "--processed", str(tmp_path)])
    assert nrt.main() == 2
    assert "FIRMS_MAP_KEY" in capsys.readouterr().err
    assert not (tmp_path / "nrt").exists()
