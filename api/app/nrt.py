"""API adapter for the FIRMS near-real-time layer."""

from __future__ import annotations

import h3 as h3lib
from fastapi import HTTPException

from pipeline import nrt as client
from . import geo
from .real import ATTRIBUTION, VERSION, _cells


def _bounds(cells):
    vertices = [vertex for cell in cells for vertex in h3lib.cell_to_boundary(cell)]
    if not vertices:
        return None
    return (min(lon for lat, lon in vertices), min(lat for lat, lon in vertices),
            max(lon for lat, lon in vertices), max(lat for lat, lon in vertices))


def _country_bounds():
    for country in geo.COUNTRIES:
        boxes = [unit["bbox"] for unit in geo.units() if unit["country"] == country]
        if boxes:
            yield (min(b[0] for b in boxes), min(b[1] for b in boxes),
                   max(b[2] for b in boxes), max(b[3] for b in boxes))


def recent(*, hours=48, bbox=None, h3=None, lat=None, lon=None, radius_km=None,
           geometry=None, getter=None, now=None):
    if hours not in (24, 48):
        raise HTTPException(422, detail="hours must be 24 or 48")
    if not client.map_key():
        raise HTTPException(503, detail={"code": "firms_map_key_missing",
                                         "message": "FIRMS NRT is unavailable: set FIRMS_MAP_KEY in the environment or repo-root .env"})
    cells, area = _cells(h3_list=h3, bbox=bbox, lat=lat, lon=lon,
                         radius_km=radius_km, geometry=geometry)
    if bbox is not None:
        bounds = [tuple(map(float, bbox.split(",")))]
    elif cells is not None:
        bounds = [_bounds(cells)] if cells else []
    else:
        bounds = list(_country_bounds())
        if not bounds:
            raise HTTPException(503, detail={"code": "area_data_missing", "message": "Country bounds are unavailable"})
    features = []
    try:
        for box in bounds:
            collection = client.fetch_recent(bbox=box, hours=hours, getter=getter, now=now)
            features.extend(collection["features"])
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(503, detail={"code": "nrt_unavailable", "message": str(exc)}) from exc
    if cells is not None:
        allowed = set(cells)
        features = [feature for feature in features if h3lib.cell_to_parent(feature["properties"]["h3_r7"], 6) in allowed]
    unique = {(feature["properties"]["platform"], feature["properties"]["ts_utc"],
               tuple(feature["geometry"]["coordinates"])): feature for feature in features}
    features = sorted(unique.values(), key=lambda feature: feature["properties"]["ts_utc"])
    cutoff = max((feature["properties"]["ts_utc"] for feature in features), default=None)
    return {"methodology_version": VERSION, "data_cutoff": cutoff,
            "attribution": ATTRIBUTION, "source": "FIRMS NRT", "area": area,
            "type": "FeatureCollection", "features": features}
