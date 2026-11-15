"""Download formats built on the harmonized hotspot layer (KML for GIS / Google Earth)."""
from __future__ import annotations

from datetime import date
from xml.sax.saxutils import escape

from fastapi import APIRouter, Query, Response

from .extra_routes import hotspots_geojson
from .real import ATTRIBUTION, VERSION

router = APIRouter()
NOTE = f"Fuente: {ATTRIBUTION}. Metodología Firely {VERSION}."
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre"]
PLATFORMS = {"Terra": ("MODIS a bordo de Terra (NASA)", "1 km"), "Aqua": ("MODIS a bordo de Aqua (NASA)", "1 km"),
             "SNPP": ("VIIRS a bordo de Suomi NPP (NASA/NOAA)", "375 m"), "NOAA20": ("VIIRS a bordo de NOAA-20", "375 m"),
             "NOAA21": ("VIIRS a bordo de NOAA-21", "375 m")}
# same FRP classes and colours as the web map legend (web/src/lib/dataviz.ts FRP_CLASSES); KML colour is aabbggrr
FRP_STYLES = (("bajo", "ff787b7c", 0.6), ("medio", "ff6fafbc", 0.8), ("alto", "ff4ae3fd", 1.0))


def _frp_class(frp) -> str:
    frp = frp or 0
    return "bajo" if frp < 15 else ("medio" if frp < 40 else "alto")


def _long_date(iso: str) -> str:
    y, m, d = (int(v) for v in iso[:10].split("-"))
    return f"{d} de {MONTHS[m - 1]} de {y}"


@router.get("/export.kml")
def export_kml(h3: str | None = None, bbox: str | None = None, lat: float | None = None,
               lon: float | None = None, radius_km: float | None = None,
               admin: str | None = None, geometry: str | None = None,
               from_: date | None = Query(None, alias="from"), to: date | None = None,
               limit: int = Query(5000, ge=1, le=20000)):
    data = hotspots_geojson(h3=h3, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km, admin=admin,
                            geometry=geometry, from_=from_, to=to, limit=limit)
    cutoff = data.get("data_cutoff")
    period = f" ({from_} a {to})" if from_ and to else ""
    truncated = (f" Este archivo trae los {len(data['features'])} puntos de mayor FRP de {data.get('n_total')}; "
                 "acota el periodo para tenerlos todos.") if data.get("truncated") else ""
    intro = (
        "<p><b>Qué contiene.</b> Cada punto es una detección de calor de un satélite: un píxel (375 m en VIIRS, 1 km en "
        "MODIS) donde el sensor midió una temperatura anómala al pasar. No es el contorno de un incendio: un mismo incendio "
        "produce muchos puntos, y varios satélites pueden ver el mismo fuego el mismo día.</p>"
        "<p><b>Color.</b> Potencia radiativa del fuego (FRP): gris = baja (&lt; 15 MW), ocre = media (15 a 40 MW), "
        "amarillo = alta (40 MW o más).</p>"
        "<p><b>Organización.</b> Una carpeta por día; usa la barra de tiempo de Google Earth para recorrerlos.</p>"
        "<p><b>Nota.</b> Son detecciones individuales de NASA FIRMS con confianza nominal o alta. Las cifras del calendario "
        "de Firely son la serie armonizada MODIS/VIIRS, por eso no coinciden con el número de puntos." + truncated + "</p>"
        f"<p>{escape(NOTE)} Corte de datos: {escape(str(cutoff))}.</p>")
    styles = "".join(
        f'<Style id="frp-{cid}"><IconStyle><color>{color}</color><scale>{scale}</scale><Icon><href>'
        'http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle>'
        '<LabelStyle><scale>0</scale></LabelStyle></Style>'
        for cid, color, scale in FRP_STYLES)
    by_day: dict[str, list] = {}
    for f in data["features"]:
        by_day.setdefault(str(f["properties"]["date"])[:10], []).append(f)
    folders = []
    for day in sorted(by_day):
        marks = []
        for f in by_day[day]:
            p, (x, y) = f["properties"], f["geometry"]["coordinates"]
            cls = _frp_class(p.get("frp_mw"))
            sat, pixel = PLATFORMS.get(p["platform"], (f"{p['sensor']} {p['platform']}", "1 km" if p["sensor"] == "MODIS" else "375 m"))
            frp = "sin dato" if p.get("frp_mw") is None else f"{p['frp_mw']:.1f} MW ({cls})"
            when = "De noche" if p.get("daynight") == "N" else "De día"
            rows = [("Qué es", "Detección de calor por satélite (posible fuego activo)"), ("Fecha", _long_date(day)),
                    ("Paso del satélite", when), ("Satélite", sat), ("Tamaño del píxel", pixel),
                    ("Potencia del fuego (FRP)", frp), ("Confianza", "Alta" if p.get("confidence_h") == "alta" else "Nominal"),
                    ("Coordenadas", f"{y:.4f}, {x:.4f}")]
            card = ("<table>" + "".join(f"<tr><td><b>{k}</b></td><td>{escape(str(v))}</td></tr>" for k, v in rows)
                    + f"</table><p>Fuente: NASA FIRMS. Firely {escape(VERSION)}.</p>")
            extended = "".join(f'<Data name="{k}"><value>{escape(str(v if v is not None else ""))}</value></Data>'
                               for k, v in (("fecha", p["date"]), ("sensor", p["sensor"]), ("satelite", p["platform"]),
                                            ("frp_mw", p.get("frp_mw")), ("confianza", p.get("confidence_h")),
                                            ("dia_noche", p.get("daynight"))))
            marks.append(f"<Placemark><name>{escape(p['sensor'] + ' ' + p['platform'] + ', ' + frp)}</name>"
                         f'<Snippet maxLines="1">{escape(_long_date(day) + ", " + when.lower())}</Snippet>'
                         f"<description><![CDATA[{card}]]></description><styleUrl>#frp-{cls}</styleUrl>"
                         f"<TimeStamp><when>{day}</when></TimeStamp><ExtendedData>{extended}</ExtendedData>"
                         f"<Point><coordinates>{x},{y},0</coordinates></Point></Placemark>")
        n = len(by_day[day])
        folders.append(f"<Folder><name>{escape(_long_date(day))}: {n} {'punto' if n == 1 else 'puntos'}</name>"
                       f"<open>0</open>{''.join(marks)}</Folder>")
    kml = ('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
           f"<name>Firely: detecciones de calor{escape(period)}</name><open>1</open>"
           f"<description><![CDATA[{intro}]]></description>{styles}" + "".join(folders) + "</Document></kml>")
    return Response(kml, media_type="application/vnd.google-earth.kml+xml",
                    headers={"Content-Disposition": 'attachment; filename="firely.kml"'})
