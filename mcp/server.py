"""Firely MCP server. Every tool calls the Firely HTTP API; numbers always come from the API.

Local (stdio):        FIRELY_API_URL=http://127.0.0.1:8000 .venv/bin/python mcp/server.py
Public (HTTP, Docker): python mcp/server.py --transport streamable-http --host 0.0.0.0 --port 8001
                       -> streamable HTTP at /mcp (stateless, one JSON-RPC exchange per request) and GET /healthz
"""
from __future__ import annotations

import os

import httpx
try:  # mcp 2.x
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP

ATTRIBUTION = "NASA FIRMS"
mcp = FastMCP("firely")


def _base() -> str:
    return os.environ.get("FIRELY_API_URL", "http://127.0.0.1:8000").rstrip("/")


def _call(method: str, path: str, params: dict | None = None, json: dict | None = None) -> dict:
    clean = {k: v for k, v in (params or {}).items() if v is not None}
    try:
        r = httpx.request(method, _base() + path, params=clean, json=json, timeout=60)
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPStatusError as exc:
        return {"error": f"API {exc.response.status_code}: {exc.response.text[:300]}", "attribution": ATTRIBUTION}
    except (httpx.HTTPError, ValueError) as exc:
        return {"error": f"API unreachable or invalid response: {type(exc).__name__}", "attribution": ATTRIBUTION}
    if isinstance(data, dict):
        data.setdefault("attribution", ATTRIBUTION)
    return data


def _area(h3, bbox, lat, lon, radius_km, admin) -> dict:
    return {"h3": h3, "bbox": bbox, "lat": lat, "lon": lon, "radius_km": radius_km, "admin": admin}


@mcp.tool()
def resolve_area(text: str, lang: str | None = None) -> dict:
    """Resolve a place description (e.g. 'Sierra de Arteaga') to candidate areas (bbox/admin). Use it before the other tools."""
    return _call("POST", "/resolve-area", json={"text": text, "lang": lang})


@mcp.tool()
def calendar(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
             radius_km: float | None = None, admin: str | None = None, from_date: str | None = None,
             to_date: str | None = None, metric: str = "count", reference: str = "median") -> dict:
    """Fire-activity calendar (years x months) of harmonized hotspots. bbox is 'west,south,east,north'; metric is count|frp; dates are YYYY-MM-DD."""
    return _call("GET", "/calendar", {**_area(h3, bbox, lat, lon, radius_km, admin), "from": from_date,
                                      "to": to_date, "metric": metric, "reference": reference})


@mcp.tool()
def season(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
           radius_km: float | None = None, admin: str | None = None) -> dict:
    """Fire season start, peak and end per year plus trends (trend uses observed VIIRS years only)."""
    return _call("GET", "/season", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def analogs(date: str | None = None, h3: str | None = None, bbox: str | None = None, lat: float | None = None,
            lon: float | None = None, radius_km: float | None = None, admin: str | None = None) -> dict:
    """Historical analog years most similar to a date (YYYY-MM-DD; default: latest data)."""
    return _call("GET", "/analogs", {**_area(h3, bbox, lat, lon, radius_km, admin), "date": date})


@mcp.tool()
def return_period(year: int, month: int, h3: str | None = None, bbox: str | None = None, lat: float | None = None,
                  lon: float | None = None, radius_km: float | None = None, admin: str | None = None) -> dict:
    """Empirical percentile and return period (years) of a given month's activity versus the historical series."""
    return _call("GET", "/return-period", {**_area(h3, bbox, lat, lon, radius_km, admin), "year": year, "month": month})


@mcp.tool()
def risk(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
         radius_km: float | None = None, admin: str | None = None) -> dict:
    """Prevention priority index (0-100) with its components (anomaly, recurrence, exposure, season, FWI) for an area."""
    return _call("GET", "/risk", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def outlook(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None, horizon: int | None = None,
            kind: str = "forecast", issue: str | None = None) -> dict:
    """1-3 month fire-activity outlook: expected harmonized detections vs normal for the next months, with
    below/near/above-normal probabilities per cell and the back-test skill. If `show` is 'climatology', the model did
    not beat climatology there: say so and report the normal. kind is forecast|backtest; issue is YYYY-MM."""
    return _call("GET", "/forecast", {**_area(h3, bbox, lat, lon, radius_km, admin), "horizon": horizon,
                                      "kind": kind, "issue": issue})


@mcp.tool()
def events(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
           radius_km: float | None = None, admin: str | None = None, from_date: str | None = None,
           to_date: str | None = None, min_hotspots: int = 3) -> dict:
    """Fire events (clustered hotspots) with duration, harmonized size, FRP, night ratio and their rank in the area."""
    return _call("GET", "/events", {**_area(h3, bbox, lat, lon, radius_km, admin), "from": from_date, "to": to_date,
                                    "min_hotspots": min_hotspots})


@mcp.tool()
def context(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None, from_date: str | None = None,
            to_date: str | None = None) -> dict:
    """ENSO phase (ONI) and fire-weather index (GFWED FWI) anomalies per month."""
    return _call("GET", "/context", {**_area(h3, bbox, lat, lon, radius_km, admin), "from": from_date, "to": to_date})


@mcp.tool()
def weather(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None, year: int | None = None,
            month: int | None = None) -> dict:
    """NASA POWER precipitation/temperature/humidity/wind anomalies next to the fire anomaly. Pass year+month for a one-sentence summary. Context, not causation."""
    return _call("GET", "/weather", {**_area(h3, bbox, lat, lon, radius_km, admin), "year": year, "month": month})


@mcp.tool()
def weekday(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None) -> dict:
    """Day-of-week distribution of fire events with a chi-square test (human signature of fire)."""
    return _call("GET", "/weekday", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def night(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
          radius_km: float | None = None, admin: str | None = None) -> dict:
    """Share of night-time detections per year (fire persistence)."""
    return _call("GET", "/night", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def recent_hotspots(hours: int = 24, h3: str | None = None, bbox: str | None = None, lat: float | None = None,
                    lon: float | None = None, radius_km: float | None = None) -> dict:
    """Near-real-time FIRMS detections of the last 24 or 48 hours (needs the server's FIRMS key)."""
    return _call("GET", "/recent", {"hours": hours, "h3": h3, "bbox": bbox, "lat": lat, "lon": lon, "radius_km": radius_km})


@mcp.tool()
def spread(event_id: str | None = None, lat: float | None = None, lon: float | None = None, bbox: str | None = None,
           hours: int = 24) -> dict:
    """Indicative spread cone from the wind forecast. NOT an official forecast nor a fire-behaviour model."""
    return _call("GET", "/spread", {"event_id": event_id, "lat": lat, "lon": lon, "bbox": bbox, "hours": hours})


@mcp.tool()
def wind_localities(event_id: str | None = None, lat: float | None = None, lon: float | None = None,
                    bbox: str | None = None, hours: int = 24) -> dict:
    """Localities downwind (possible smoke) of an event or point, with population. Indicative only."""
    return _call("GET", "/wind-localities", {"event_id": event_id, "lat": lat, "lon": lon, "bbox": bbox, "hours": hours})


@mcp.tool()
def reported(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
             radius_km: float | None = None, admin: str | None = None, from_date: str | None = None,
             to_date: str | None = None) -> dict:
    """Officially reported fires (CONAFOR, Mexico) next to detected hotspots for the state of the area."""
    return _call("GET", "/reported", {**_area(h3, bbox, lat, lon, radius_km, admin), "from": from_date, "to": to_date})


@mcp.tool()
def regimes(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
            radius_km: float | None = None, admin: str | None = None) -> dict:
    """Fire regime class per H3 cell and cells whose regime changed between 2001-2012 and 2013-2026."""
    return _call("GET", "/regimes", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def bulletin(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
             radius_km: float | None = None, admin: str | None = None) -> dict:
    """Weekly watch bulletin for an area (template from the harmonized series; not an official alert)."""
    return _call("GET", "/bulletin", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def drill_scenario(h3: str | None = None, bbox: str | None = None, lat: float | None = None, lon: float | None = None,
                   radius_km: float | None = None, admin: str | None = None, pick: str = "largest") -> dict:
    """Staged training scenario built from a real historical event of the area (pick: largest|longest|recent)."""
    return _call("GET", "/drill", {**_area(h3, bbox, lat, lon, radius_km, admin), "pick": pick})


@mcp.tool()
def watch(level: str = "mun", country: str = "Mexico", top: int = 10) -> dict:
    """Early-warning watchlist: admin units (level mun|ent|adm1|adm2) whose current month is unusual versus history."""
    return _call("GET", "/watch", {"level": level, "country": country, "top": top})


def http_app(path: str = "/mcp"):
    """Starlette app for the streamable-HTTP transport (stateless: no per-client session kept on the server).

    DNS-rebinding protection always checks the Host header. Set FIRELY_MCP_ALLOWED_HOSTS to
    the public domain or IP plus localhost hosts when deploying behind nginx."""
    from mcp.server.transport_security import TransportSecuritySettings
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    split = lambda name: [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]
    hosts = split("FIRELY_MCP_ALLOWED_HOSTS") or ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "54.80.16.144",
                                                       "firely.lat", "www.firely.lat"]
    security = TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=hosts,
                                         allowed_origins=split("FIRELY_MCP_ALLOWED_ORIGINS"))
    app = mcp.streamable_http_app(streamable_http_path=path, stateless_http=True, transport_security=security,
                                  host="0.0.0.0")

    async def healthz(request):
        return JSONResponse({"ok": True, "transport": "streamable-http", "path": path, "attribution": ATTRIBUTION})

    app.router.routes.append(Route("/healthz", healthz))
    return app


def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Firely MCP server")
    parser.add_argument("--transport", choices=("stdio", "streamable-http"),
                        default=os.environ.get("FIRELY_MCP_TRANSPORT", "stdio"))
    parser.add_argument("--host", default=os.environ.get("FIRELY_MCP_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("FIRELY_MCP_PORT", "8001")))
    parser.add_argument("--path", default="/mcp")
    args = parser.parse_args(argv)
    if args.transport == "stdio":
        mcp.run()
        return 0
    import uvicorn
    uvicorn.run(http_app(args.path), host=args.host, port=args.port, proxy_headers=False,
                log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
