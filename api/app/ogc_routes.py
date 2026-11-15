"""Minimal OGC API - Features (Part 1, core + GeoJSON) over the Firely tables.

Collections: `events` (clustered fire events, n_hotspots_harm >= 3) and
`cell_activity` (H3 res-6 cells as polygons with harmonized count over a period).
"""
from __future__ import annotations

from datetime import date, datetime

import h3
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from shapely import wkb
from shapely.geometry import mapping

from . import db
from .real import ATTRIBUTION, VERSION, _cutoff

router = APIRouter()
GEOJSON = "application/geo+json"
MIN_HOTSPOTS = 3
COLLECTIONS = {
    "events": {"title": "Eventos de fuego", "description": "Eventos agrupados de puntos de calor armonizados (n_hotspots_harm >= 3). Extension aproximada, no area quemada."},
    "cell_activity": {"title": "Actividad por celda H3 (res. 6)", "description": "Celdas H3 de resolucion 6 con conteo armonizado (count_harm) del periodo pedido; por defecto el ultimo anio con datos."},
}


def _meta() -> dict:
    return {"attribution": ATTRIBUTION, "methodology_version": VERSION, "data_cutoff": _cutoff()}


def _json(body: dict, media: str = "application/json") -> JSONResponse:
    return JSONResponse({**body, **_meta()}, media_type=media)


def _url(request: Request, path: str) -> str:
    return str(request.base_url).rstrip("/") + path


def _link(request, path, rel, type_="application/json", title=None):
    link = {"href": _url(request, path), "rel": rel, "type": type_}
    if title:
        link["title"] = title
    return link


def _bbox(value: str | None):
    if value is None:
        return None
    try:
        w, s, e, n = (float(x) for x in value.split(","))
    except ValueError:
        raise HTTPException(400, "bbox must be west,south,east,north")
    if not (-180 <= w <= e <= 180 and -90 <= s <= n <= 90):
        raise HTTPException(400, "invalid bbox")
    return w, s, e, n


def _datetime(value: str | None):
    """RFC 3339 instant or interval ('a/b', '../b', 'a/..') -> (start date, end date)."""
    if value is None:
        return None, None

    def one(text):
        if text in ("", ".."):
            return None
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        except ValueError:
            raise HTTPException(400, f"invalid datetime: {text}")

    parts = value.split("/")
    if len(parts) > 2:
        raise HTTPException(400, "invalid datetime")
    start = one(parts[0])
    end = start if len(parts) == 1 else one(parts[1])
    if start and end and start > end:
        raise HTTPException(400, "datetime start must precede end")
    return start, end


def _collection_doc(request, cid):
    info = COLLECTIONS[cid]
    return {"id": cid, "title": info["title"], "description": info["description"],
            "itemType": "feature", "crs": ["http://www.opengis.net/def/crs/OGC/1.3/CRS84"],
            "links": [_link(request, f"/ogc/collections/{cid}", "self", title="Esta coleccion"),
                      _link(request, f"/ogc/collections/{cid}/items", "items", GEOJSON, "Items")]}


@router.get("/ogc")
def landing(request: Request):
    return _json({"title": "Firely OGC API - Features",
                  "description": "Puntos de calor armonizados MODIS/VIIRS. Fuente: NASA FIRMS.",
                  "links": [_link(request, "/ogc", "self"),
                            _link(request, "/ogc/conformance", "conformance"),
                            _link(request, "/ogc/collections", "data"),
                            _link(request, "/openapi.json", "service-desc", "application/vnd.oai.openapi+json;version=3.0")]})


@router.get("/ogc/conformance")
def conformance():
    base = "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf"
    return _json({"conformsTo": [f"{base}/core", f"{base}/geojson"]})


@router.get("/ogc/collections")
def collections(request: Request):
    return _json({"links": [_link(request, "/ogc/collections", "self")],
                  "collections": [_collection_doc(request, c) for c in COLLECTIONS]})


@router.get("/ogc/collections/{collection_id}")
def collection(collection_id: str, request: Request):
    if collection_id not in COLLECTIONS:
        raise HTTPException(404, "collection not found")
    return _json(_collection_doc(request, collection_id))


def _geometry(blob, lon, lat):
    try:
        if blob:
            return mapping(wkb.loads(bytes(blob)))
    except Exception:
        pass
    return {"type": "Point", "coordinates": [lon, lat]}


def _events(bbox, start, end, limit, offset):
    files = db.parquet_files("events")
    if not files:
        return [], 0
    where, params = ["n_hotspots_harm >= ?"], [files, MIN_HOTSPOTS]
    if bbox:
        where.append("centroid_lon BETWEEN ? AND ? AND centroid_lat BETWEEN ? AND ?")
        params += [bbox[0], bbox[2], bbox[1], bbox[3]]
    if start:
        where.append("end_date >= ?")
        params.append(start)
    if end:
        where.append("start_date <= ?")
        params.append(end)
    sql = f"""SELECT event_id, start_date, end_date, duration_days, n_hotspots_harm, frp_total,
        area_approx_km2, night_ratio, burn_type, centroid_lat, centroid_lon, geometry, estimated,
        count(*) OVER () FROM {db.table_sql(files)} WHERE {' AND '.join(where)}
        ORDER BY start_date, event_id LIMIT ? OFFSET ?"""
    with db.connection() as con:
        rows = con.execute(sql, params + [limit, offset]).fetchall()
    feats = [{"type": "Feature", "id": r[0], "geometry": _geometry(r[11], r[10], r[9]),
              "properties": {"event_id": r[0], "start_date": r[1].isoformat(), "end_date": r[2].isoformat(),
                             "duration_days": r[3], "n_hotspots_harm": r[4], "frp_total": r[5],
                             "area_approx_km2": r[6], "night_ratio": r[7], "burn_type": r[8],
                             "centroid_lat": r[9], "centroid_lon": r[10], "estimated": r[12]}}
             for r in rows]
    return feats, rows[0][13] if rows else 0


def _cell_activity(bbox, start, end, limit, offset):
    root = db.processed_root() / "cell_month_harmonized"
    all_years = sorted({int(p.name.split("=")[1]) for p in root.glob("*/year=*")})
    if not all_years:
        return [], 0
    if not start and not end:
        start, end = date(all_years[-1], 1, 1), date(all_years[-1], 12, 31)
    start = start or date(all_years[0], 1, 1)
    end = end or date(all_years[-1], 12, 31)
    files = [str(p) for y in range(start.year, end.year + 1) for p in root.glob(f"*/year={y}/*.parquet")]
    if not files:
        return [], 0
    where = ["make_date(year, month, 1) <= ?", "last_day(make_date(year, month, 1)) >= ?"]
    params = [files, end, start]
    sql = f"""SELECT h3_r6, sum(count_harm) AS n, bool_or(is_estimated) FROM {db.table_sql(files)}
        WHERE {' AND '.join(where)} GROUP BY 1 HAVING sum(count_harm) > 0 ORDER BY 1"""
    with db.connection() as con:
        data = con.execute(sql, params).fetchall()
    feats = []
    for cell, n, est in data:
        lat, lon = h3.cell_to_latlng(cell)
        if bbox and not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]):
            continue
        ring = [[lng, la] for la, lng in h3.cell_to_boundary(cell)]
        ring.append(ring[0])
        feats.append({"type": "Feature", "id": cell, "geometry": {"type": "Polygon", "coordinates": [ring]},
                      "properties": {"h3_r6": cell, "count_harm": round(n, 3), "includes_estimated": bool(est),
                                     "period_start": start.isoformat(), "period_end": end.isoformat()}})
    return feats[offset:offset + limit], len(feats)


@router.get("/ogc/collections/{collection_id}/items")
def items(collection_id: str, request: Request, limit: int = Query(100, ge=1, le=1000),
          offset: int = Query(0, ge=0), bbox: str | None = None, datetime: str | None = None):
    if collection_id not in COLLECTIONS:
        raise HTTPException(404, "collection not found")
    box, (start, end) = _bbox(bbox), _datetime(datetime)
    fn = _events if collection_id == "events" else _cell_activity
    feats, matched = fn(box, start, end, limit, offset)
    path = f"/ogc/collections/{collection_id}/items"
    qs = "".join(f"&{k}={v}" for k, v in (("bbox", bbox), ("datetime", datetime)) if v)
    links = [_link(request, f"{path}?limit={limit}&offset={offset}{qs}", "self", GEOJSON)]
    if offset + limit < matched:
        links.append(_link(request, f"{path}?limit={limit}&offset={offset + limit}{qs}", "next", GEOJSON))
    return _json({"type": "FeatureCollection", "features": feats, "numberMatched": matched,
                  "numberReturned": len(feats), "links": links}, GEOJSON)
