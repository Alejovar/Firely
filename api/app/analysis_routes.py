"""Real-data analysis routes; include `router` in the application."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from pipeline import analysis
from .real import _cells, _envelope

router = APIRouter()


def _area(h3, bbox, lat, lon, radius_km, geometry, admin):
    return _cells(h3, bbox, lat, lon, radius_km, geometry, admin)


def _wrap(result, area):
    cutoff = result.pop("data_cutoff", None)
    return _envelope(cutoff, area=area, **result)


@router.get("/season")
def season(h3: Optional[str] = None, bbox: Optional[str] = None,
           lat: Optional[float] = None, lon: Optional[float] = None,
           radius_km: Optional[float] = None, geometry: Optional[str] = None,
           admin: Optional[str] = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, geometry, admin)
    return _wrap(analysis.season(cells), area)


@router.get("/analogs")
def analogs(date_: Optional[date] = Query(None, alias="date"),
            h3: Optional[str] = None, bbox: Optional[str] = None,
            lat: Optional[float] = None, lon: Optional[float] = None,
            radius_km: Optional[float] = None, geometry: Optional[str] = None,
            admin: Optional[str] = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, geometry, admin)
    # Analogs use only the harmonized (SP) series. The calendar may already show provisional NRT
    # months, so a date past the harmonized cutoff is clamped to it instead of failing; the
    # response says which date was used and which one was asked for.
    cutoff = analysis._cutoff(analysis._monthly(cells))
    requested = date_
    if date_ is None or (cutoff is not None and date_ > cutoff):
        date_ = cutoff or date.today()
    try:
        out = analysis.analogs(cells, date_)
        if requested is not None and requested != date_:
            out["date_requested"] = requested.isoformat()
        return _wrap(out, area)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/return-period")
def return_period(year: int, month: int = Query(ge=1, le=12),
                  h3: Optional[str] = None, bbox: Optional[str] = None,
                  lat: Optional[float] = None, lon: Optional[float] = None,
                  radius_km: Optional[float] = None, geometry: Optional[str] = None,
                  admin: Optional[str] = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, geometry, admin)
    return _wrap(analysis.return_period(cells, year, month), area)


@router.get("/weekday")
def weekday(h3: Optional[str] = None, bbox: Optional[str] = None,
            lat: Optional[float] = None, lon: Optional[float] = None,
            radius_km: Optional[float] = None, geometry: Optional[str] = None,
            admin: Optional[str] = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, geometry, admin)
    result = analysis.weekday(cells)
    return _wrap(result, area)


@router.get("/night")
def night(h3: Optional[str] = None, bbox: Optional[str] = None,
          lat: Optional[float] = None, lon: Optional[float] = None,
          radius_km: Optional[float] = None, geometry: Optional[str] = None,
          admin: Optional[str] = None):
    cells, area = _area(h3, bbox, lat, lon, radius_km, geometry, admin)
    result = analysis.night_ratio(cells)
    return _wrap(result, area)
