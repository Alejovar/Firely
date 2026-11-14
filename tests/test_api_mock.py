from fastapi.testclient import TestClient
from api.app.main import app

c = TestClient(app)


def test_calendar_envelope_and_demo_case():
    r = c.get("/calendar", params={"from": "2019-01-01", "to": "2021-12-31"}).json()
    assert r["attribution"] == "NASA FIRMS" and r["methodology_version"]
    row = next(x for x in r["rows"] if (x["year"], x["month"]) == (2021, 3))
    assert row["anomaly_ratio"] > 3


def test_all_endpoints_respond():
    for p in ["/calendar/daily?year=2021&month=3", "/events", "/analogs", "/season", "/context",
              "/risk", "/recent?hours=48", "/alerts/cap", "/hotspots.csv"]:
        assert c.get(p).status_code == 200, p
    assert c.post("/resolve-area", json={"text": "arteaga"}).json()["ambiguous"]
