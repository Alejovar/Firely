"""Firely MCP server (stdio). Every tool calls the Firely HTTP API; numbers always come from the API.

Run: FIRELY_API_URL=http://127.0.0.1:8000 .venv/bin/python mcp/server.py
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
    """Fire risk summary and exposure (localities, protected areas) for an area."""
    return _call("GET", "/risk", _area(h3, bbox, lat, lon, radius_km, admin))


@mcp.tool()
def watch(level: str = "mun", country: str = "Mexico", top: int = 10) -> dict:
    """Early-warning watchlist: admin units (level mun|ent|adm1|adm2) whose current month is unusual versus history."""
    return _call("GET", "/watch", {"level": level, "country": country, "top": top})


if __name__ == "__main__":
    mcp.run()
