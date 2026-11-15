"""GET /forecast (1-3 month outlook) on tiny synthetic forecast tables."""
import json

import duckdb
import h3
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.app import outlook_routes

CELL = h3.latlng_to_cell(25.4, -100.5, 6)
OTHER = h3.latlng_to_cell(-29.2, -67.5, 6)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_DATA_PROCESSED", str(tmp_path))
    fc = tmp_path / "forecast"
    fc.mkdir()
    con = duckdb.connect()
    con.execute("""CREATE TABLE c AS SELECT * FROM (VALUES
        (?, 'Mexico', 'forecast', 2025, 12, 2026, 1, 1, 12.0, 4.0, 30.0, 8.0, 10.0, 0.1, 0.3, 0.6, 2.0, 9.0),
        (?, 'Mexico', 'forecast', 2025, 12, 2026, 2, 2, 20.0, 6.0, 40.0, 15.0, NULL, 0.2, 0.4, 0.4, 5.0, 20.0),
        (?, 'Mexico', 'backtest', 2023, 1, 2023, 2, 1, 5.0, 1.0, 9.0, 4.0, 3.0, 0.3, 0.4, 0.3, 1.0, 6.0),
        (?, 'Argentina', 'forecast', 2025, 12, 2026, 1, 1, 7.0, 2.0, 15.0, 9.0, 6.0, 0.4, 0.4, 0.2, 3.0, 12.0))
        t(h3_r6, country, kind, issue_year, issue_month, target_year, target_month, horizon, pred, pred_lo, pred_hi,
          clim, obs, p_below, p_near, p_above, q33, q67)""", [CELL, CELL, CELL, OTHER])
    con.execute(f"COPY (SELECT *, 'forecast-1.0' AS model_version FROM c) TO '{fc / 'forecast_cell.parquet'}' (FORMAT PARQUET)")
    con.execute(f"""COPY (SELECT 'country' AS level, country AS code, country, kind, issue_year, issue_month, target_year,
                         target_month, horizon, sum(pred) AS pred, sum(clim) AS clim, sum(obs) AS obs
                         FROM c GROUP BY ALL) TO '{fc / 'forecast_area.parquet'}' (FORMAT PARQUET)""")
    summary = {"methodology_version": "forecast-1.0", "split": {"train": [2012, 2021], "validation": 2022, "test": [2023, 2025]},
               "beats_climatology": {"Mexico": {"1": True, "2": True}, "Argentina": {"1": False}},
               "totals_beat_climatology": {"Mexico": {"1": False, "2": True}, "Argentina": {"1": False}},
               "by_country": [{"country": "Mexico", "horizon": 1, "skill_vs_b0": 0.13, "rpss_vs_clim": 0.1,
                               "capture10_model": 0.44, "capture10_b0": 0.39}]}
    (fc / "forecast_summary.json").write_text(json.dumps(summary))
    app = FastAPI()
    app.include_router(outlook_routes.router)
    return TestClient(app)


def test_single_cell_has_probabilities_and_skill(client):
    r = client.get("/forecast", params={"h3": CELL})
    assert r.status_code == 200
    body = r.json()
    assert body["methodology_version"] == "forecast-1.0" and "NASA FIRMS" in body["attribution"]
    first = body["forecasts"][0]
    assert first["target"] == "2026-01" and first["horizon"] == 1 and first["show"] == "forecast"
    assert first["probabilities"] == {"below": 0.1, "near": 0.3, "above": 0.6} and first["most_likely"] == "above"
    assert first["interval_10_90"] == [4.0, 30.0] and first["ratio_to_normal"] == 1.5
    assert first["skill"]["skill_vs_climatology"] == 0.13
    assert len(body["forecasts"]) == 2  # backtest rows excluded by default


def test_country_totals_and_golden_rule(client):
    body = client.get("/forecast").json()
    arg = next(f for f in body["forecasts"] if f["country"] == "Argentina")
    assert arg["show"] == "climatology"  # did not beat climatology in the back-test
    mx = {f["horizon"]: f for f in body["forecasts"] if f["country"] == "Mexico"}
    assert mx[1]["show"] == "climatology" and mx[1]["skill"]["judged_on"] == "national_total"  # totals verdict
    assert mx[2]["show"] == "forecast"


def test_backtest_and_empty_area(client):
    body = client.get("/forecast", params={"h3": CELL, "kind": "backtest"}).json()
    assert [f["target"] for f in body["forecasts"]] == ["2023-02"] and body["forecasts"][0]["observed_detections"] == 3.0
    quiet = h3.latlng_to_cell(19.0, -99.0, 6)
    body = client.get("/forecast", params={"h3": quiet}).json()
    assert body["forecasts"] == [] and body["empty_reason"]
