"""Download formats built on the harmonized hotspot layer (KML for GIS / Google Earth)."""
from __future__ import annotations

from datetime import date
from xml.sax.saxutils import escape

from fastapi import APIRouter, Query, Response

from .extra_routes import hotspots_geojson
from .real import ATTRIBUTION, VERSION

router = APIRouter()
NOTE = f"Fuente: {ATTRIBUTION}. Metodologia Firely {VERSION}."


@router.get("/export.kml")
def export_kml(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
               lon: float | None = None, radius_km: float | None = None,
               admin: str | None = None, geometry: str | None = None,
               from_: date | None = Query(None, alias="from"), to: date | None = None,
               limit: int = Query(5000, ge=1, le=20000)):
    data = hotspots_geojson(h3=h3, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km, admin=admin,
                            geometry=geometry, from_=from_, to=to, limit=limit)
    cutoff = data.get("data_cutoff")
    doc_desc = (f"{NOTE} Corte de datos: {cutoff}. Puntos de calor armonizados MODIS/VIIRS"
                f"{' (truncado a los de mayor FRP)' if data.get('truncated') else ''}.")
    marks = []
    for f in data["features"]:
        p, (x, y) = f["properties"], f["geometry"]["coordinates"]
        desc = (f"Sensor: {p['sensor']} {p['platform']}; FRP: {p['frp_mw']} MW; confianza: {p['confidence_h']}; "
                f"dia/noche: {p['daynight']}. {NOTE}")
        marks.append(f"<Placemark><name>{escape(str(p['date']))}</name><description>{escape(desc)}</description>"
                     f"<TimeStamp><when>{escape(str(p['date']))}</when></TimeStamp>"
                     f"<Point><coordinates>{x},{y},0</coordinates></Point></Placemark>")
    kml = ('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
           f"<name>Firely - puntos de calor armonizados</name><description>{escape(doc_desc)}</description>"
           + "".join(marks) + "</Document></kml>")
    return Response(kml, media_type="application/vnd.google-earth.kml+xml",
                    headers={"Content-Disposition": 'attachment; filename="firely.kml"'})
