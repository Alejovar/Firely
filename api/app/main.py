from datetime import date
import os
from typing import Literal, Optional

from fastapi import FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import mock, real

_real_mode = os.environ.get("FIRELY_API_MODE") == "real"
_citation = ("Cita sugerida: Equipo Firely (2026). *Firely: serie armonizada de puntos de calor "
             "MODIS–VIIRS* (método 1.2.0-hybrid-biome). Fuente original: NASA FIRMS. "
             "El DOI se añadirá tras publicar el dataset.")
# Behind nginx the API lives under /api (the proxy strips the prefix). FIRELY_API_PREFIX tells the docs page where
# the schema is and lets "Try it out" call the right URL; unset (local runs, tests) it is the root.
_prefix = os.environ.get("FIRELY_API_PREFIX", "").rstrip("/")
app = FastAPI(title=f"Firely API ({'real' if _real_mode else 'mock'})", version="0.1.0",
              description=(("Datos procesados. " if _real_mode else
                            "Respuestas SIMULADAS siguiendo api/openapi.yaml. ") + _citation),
              docs_url=None, servers=[{"url": _prefix}] if _prefix else None)


@app.get("/docs", include_in_schema=False)
def swagger_docs():
    from fastapi.openapi.docs import get_swagger_ui_html
    return get_swagger_ui_html(openapi_url=f"{_prefix}{app.openapi_url}", title="Firely API, documentación")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

if _real_mode:  # registered before the mock routes so /season, /analogs... resolve to the real analyses
    from .extra_routes import router as _extra_router
    from .ai_routes import router as _ai_router
    from .analysis_routes import router as _analysis_router
    from .pro_routes import router as _pro_router
    from .ogc_routes import router as _ogc_router
    from .export_routes import router as _export_router
    from .weather_routes import router as _weather_router
    from .reports_routes import router as _reports_router
    from .drill_routes import router as _drill_router
    from .animation_routes import router as _animation_router
    app.include_router(_extra_router)     # /hotspots.geojson, /recurrence, /territory, /risk, /watch
    app.include_router(_ai_router)        # POST /resolve-area, /describe
    app.include_router(_analysis_router)  # /season, /analogs, /return-period, /weekday, /night
    app.include_router(_pro_router)       # /sql, /bulletin, /cap/*, /alerts/cap (feed), /spread, /wind-localities, /regimes
    app.include_router(_ogc_router)       # /ogc/... (OGC API Features)
    app.include_router(_export_router)    # /export.kml
    app.include_router(_weather_router)   # /weather (NASA POWER, §8.10)
    app.include_router(_reports_router)   # POST /reports/extract (§11.2)
    app.include_router(_drill_router)     # /drill (escenarios de simulacro, §11.2)
    app.include_router(_animation_router) # /animation/frames (monthly H3 r4 fire animation)
    from .forecast_routes import router as _forecast_router
    from .priority_routes import router as _priority_router
    from .subscriptions_routes import router as _subscriptions_router
    app.include_router(_forecast_router)       # /risk/forecast (pronóstico GFWED GEOS-5, §8.11)
    app.include_router(_priority_router)       # /priority/cells (índice por celda, §8.16)
    app.include_router(_subscriptions_router)  # /subscriptions (alertas por suscripción, §10.1)
    from .outlook_routes import router as _outlook_router
    app.include_router(_outlook_router)        # /forecast (perspectiva de actividad 1-3 meses por celda)
    from .tts_routes import router as _tts_router
    app.include_router(_tts_router)            # /tts (narración de Historia con Piper, sin depender de voces del sistema)


def envelope(**extra):
    return {"methodology_version": mock.METHODOLOGY_VERSION, "data_cutoff": mock.DATA_CUTOFF,
            "attribution": mock.ATTRIBUTION, "harmonization_uncertainty": mock.UNCERTAINTY,
            "mock": True, **extra}


def area(h3, bbox, lat, lon, radius_km, admin):
    if h3:
        return {"type": "h3", "cells": len(h3.split(","))}
    if bbox:
        return {"type": "bbox", "bbox": bbox, "cells": 42}
    if lat is not None and lon is not None:
        return {"type": "radius", "lat": lat, "lon": lon, "radius_km": radius_km or 25, "cells": 42}
    if admin:
        return {"type": "admin", "admin": admin, "cells": 42}
    return {"type": "h3", "cells": 42}


@app.get("/calendar")
def calendar(h3: Optional[str] = None, bbox: Optional[str] = None, lat: Optional[float] = None,
             lon: Optional[float] = None, radius_km: Optional[float] = None, admin: Optional[str] = None,
             from_: date = Query(date(2001, 1, 1), alias="from"), to: Optional[date] = None,
             metric: Literal["count", "frp"] = "count", reference: Literal["median", "mean"] = "median",
             burn_type: Optional[Literal["agricola", "forestal", "otro"]] = None,
             geometry: Optional[str] = None, cloud_corrected: bool = False):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.calendar(h3_list=h3, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km,
                             admin=admin, geometry=geometry, from_=from_, to=to, metric=metric,
                             reference=reference, burn_type=burn_type, cloud_corrected=cloud_corrected)
    return envelope(area=area(h3, bbox, lat, lon, radius_km, admin), reference=reference, metric=metric,
                    rows=mock.calendar_rows(from_.year, (to or date(2026, 10, 31)).year, metric, reference))


@app.get("/calendar/daily")
def calendar_daily(year: int, month: int = Query(ge=1, le=12), h3: Optional[str] = None,
                   bbox: Optional[str] = None, lat: Optional[float] = None, lon: Optional[float] = None,
                   radius_km: Optional[float] = None, admin: Optional[str] = None,
                   geometry: Optional[str] = None):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.daily(year=year, month=month, h3_list=h3, bbox=bbox, lat=lat, lon=lon,
                          radius_km=radius_km, admin=admin, geometry=geometry)
    return envelope(year=year, month=month, rows=mock.daily_rows(year, month))


@app.get("/hotspots.csv")
def hotspots_csv(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None,
                 burn_type: Optional[str] = None, min_confidence: Optional[Literal["baja", "nominal", "alta"]] = None,
                 h3: Optional[str] = None, bbox: Optional[str] = None, lat: Optional[float] = None,
                 lon: Optional[float] = None, radius_km: Optional[float] = None,
                 admin: Optional[str] = None, geometry: Optional[str] = None):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.hotspots_csv(from_=from_, to=to, burn_type=burn_type,
                                 min_confidence=min_confidence, h3_list=h3, bbox=bbox,
                                 lat=lat, lon=lon, radius_km=radius_km, admin=admin,
                                 geometry=geometry)
    body = ("# Fuente: NASA FIRMS (datos simulados)\n"
            f"# methodology_version={mock.METHODOLOGY_VERSION} data_cutoff={mock.DATA_CUTOFF}\n"
            "ts_utc,lat,lon,sensor,platform,confidence_h,frp_mw\n"
            "2021-03-09T19:42:00Z,25.35,-100.55,VIIRS,SNPP,nominal,12.4\n")
    return Response(body, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=hotspots.csv"})


@app.get("/admin/search")
def admin_search(q: str):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.admin_search(q)
    return envelope(candidates=[])


@app.get("/events")
def events(active_only: bool = False, min_hotspots: int = Query(3, ge=0),
           from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None,
           h3: Optional[str] = None, bbox: Optional[str] = None, lat: Optional[float] = None,
           lon: Optional[float] = None, radius_km: Optional[float] = None,
           admin: Optional[str] = None, geometry: Optional[str] = None):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.events(active_only=active_only, min_hotspots=min_hotspots, from_=from_, to=to,
                           h3_list=h3, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km,
                           admin=admin, geometry=geometry)
    return envelope(rows=mock.events())


@app.get("/analogs")
def analogs(date_: Optional[date] = Query(None, alias="date")):
    return envelope(date=(date_ or date.today()).isoformat(),
                    analogs=[{"year": 2011, "similarity": 0.91}, {"year": 2019, "similarity": 0.87},
                             {"year": 2021, "similarity": 0.84}],
                    projection={"p10": 900, "p50": 1400, "p90": 2100})


@app.get("/season")
def season():
    return envelope(rows=[{"year": y, "onset": f"{y}-02-{20 - (y - 2001) // 5:02d}", "peak": f"{y}-04-25",
                           "end": f"{y}-06-30"} for y in range(2001, 2026)],
                    trend={"onset_days_per_decade": -3.1, "p_value": 0.04})


@app.get("/context")
def context(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None,
            h3: Optional[str] = None, bbox: Optional[str] = None, lat: Optional[float] = None,
            lon: Optional[float] = None, radius_km: Optional[float] = None,
            admin: Optional[str] = None, geometry: Optional[str] = None):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.context(from_=from_, to=to, h3_list=h3, bbox=bbox, lat=lat, lon=lon,
                            radius_km=radius_km, admin=admin, geometry=geometry)
    return envelope(rows=[{"year": 2021, "month": 3, "precip_anom_mm": -22.0, "temp_anom_c": 1.4, "oni": -0.8,
                           "phase": "nina"}])


@app.get("/reported")
def reported(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None,
             h3: Optional[str] = None, bbox: Optional[str] = None, lat: Optional[float] = None,
             lon: Optional[float] = None, radius_km: Optional[float] = None,
             admin: Optional[str] = None, geometry: Optional[str] = None):
    if os.environ.get("FIRELY_API_MODE") == "real":
        return real.reported(from_=from_, to=to, h3_list=h3, bbox=bbox, lat=lat, lon=lon,
                             radius_km=radius_km, admin=admin, geometry=geometry)
    return envelope(rows=[])


@app.get("/risk")
def risk():
    return envelope(next_week={"level": "alto", "fwi_percentile": 0.91},
                    exposure={"pct_near_localities": 0.37, "pct_in_protected_areas": 0.12},
                    priority_top10=[{"h3_r6": "mock", "score": 0.9 - i * 0.05} for i in range(10)])


@app.get("/recent")
def recent(hours: int = Query(24, ge=1, le=48), h3: Optional[str] = None, bbox: Optional[str] = None,
           lat: Optional[float] = None, lon: Optional[float] = None, radius_km: Optional[float] = None,
           geometry: Optional[str] = None):
    if _real_mode:
        from . import nrt  # needs FIRMS_MAP_KEY; answers 503 with a clear message when it is missing
        return nrt.recent(hours=hours, bbox=bbox, h3=h3, lat=lat, lon=lon, radius_km=radius_km, geometry=geometry)
    return envelope(hours=hours, type="FeatureCollection", features=[
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-100.55, 25.35]},
         "properties": {"platform": "NOAA20", "frp_mw": 9.8, "confidence_h": "alta"}}])


@app.get("/alerts/cap")
def alerts_cap():
    xml = ('<?xml version="1.0" encoding="UTF-8"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">'
           "<identifier>firely-mock-1</identifier><sender>firely.example</sender>"
           f"<sent>{mock.DATA_CUTOFF}T00:00:00-00:00</sent><status>Exercise</status>"
           "<msgType>Alert</msgType><scope>Public</scope><note>Simulacro. Fuente: NASA FIRMS</note></alert>")
    return Response(xml, media_type="application/xml")


class ResolveReq(BaseModel):
    text: str
    lang: Optional[str] = None


@app.post("/resolve-area")
def resolve_area(req: ResolveReq):
    # Mock: siempre la frase de la demo. La resolución real (LLM + geocodificador) va en Nivel 1.
    return envelope(intent={"text": req.text, "from": "2021-03-01", "to": "2021-03-31"},
                    candidates=[
                        {"label": "Arteaga, Coahuila", "bbox": "-100.9,25.2,-100.2,25.7", "score": 0.9},
                        {"label": "Arteaga, Michoacán", "bbox": "-102.4,18.2,-102.0,18.5", "score": 0.4}],
                    ambiguous=True)



if _real_mode:
    # The real routers are registered first and win at request time; hide the shadowed mock duplicates from
    # the OpenAPI schema so /docs documents the real endpoint once (and not the mock one by accident).
    _real_keys = set()
    for _route in app.router.routes:
        _router = getattr(_route, "original_router", None)
        for _r in (getattr(_router, "routes", None) or []):
            for _m in getattr(_r, "methods", None) or ():
                _real_keys.add((_r.path, _m))
    for _route in app.router.routes:
        if getattr(_route, "original_router", None) is None and hasattr(_route, "include_in_schema"):
            if any((getattr(_route, "path", None), _m) in _real_keys for _m in getattr(_route, "methods", None) or ()):
                _route.include_in_schema = False
    app.openapi_schema = None
