"""Synthetic checks for year selection, dates, IDs, codes, and monthly totals."""

import geopandas as gpd
import pytest
from shapely.geometry import Point, Polygon

from pipeline import reported


def test_mixed_source_date_encodings():
    dates = reported.parse_dates(["2022-05-14", "2022/05/14", "14-05-2022", "14/05/2022"])
    assert dates.dt.strftime("%Y-%m-%d").tolist() == ["2022-05-14"] * 4


def test_harmonize_synthetic_sources(monkeypatch):
    square = Polygon([(-102, 22), (-101, 22), (-101, 23), (-102, 23)])
    sinasic = gpd.GeoDataFrame({
        "Ano_incen": ["2013-0", "2015-2019", "2018-0"],
        "Sup_ha": [3.0, 7.0, 8.0], "OBJECTID_1": [1, 2, 3],
    }, geometry=[square] * 3, crs="EPSG:4326")
    info = gpd.GeoDataFrame({
        "anio": [2018], "inicio": ["04-05-2018"], "termino": ["06-05-2018"],
        "edo": ["MÃ©xico"], "mun": ["Toluca"], "clv_mun": [106.0],
        "lat": [19.3], "lon": [-99.7], "tot_ha": [2.5],
        "tipo_veg": ["Pastizal"], "causa": ["Fogatas"], "incendio_c": ["18-15-1"],
    }, geometry=[Point(-99.7, 19.3)], crs="EPSG:4326")
    annual = gpd.GeoDataFrame({
        "FECHAINIC": ["2021-04-01", None], "FECHALIQ": ["2021-04-02", None],
        "ESTADO": ["Coahuila"] * 2, "MUNICIPIO": ["Arteaga"] * 2,
        "CLAVEMUN": [4] * 2, "AREA_HA": [5.0] * 2,
        "TIPVEG": ["Bosque"] * 2, "CAUSA": ["Rayo"] * 2,
        "CLAVEINC": ["21-05-1"] * 2,
    }, geometry=[square] * 2, crs="EPSG:4326")
    frames = {"incendios_sinasic_v2_4326.zip": sinasic,
              "info_estadistica.zip": info,
              **{name: annual for name in reported.ANNUAL_FILES.values()}}

    def fake_read(_raw, filename):
        frame = frames[filename]
        return frame, {"file": filename, "features": len(frame), "crs": "EPSG:4326",
                       "encoding": "ISO-8859-1", "fields": list(frame.columns)}

    monkeypatch.setattr(reported, "read_zip", fake_read)
    events, monthly, summary = reported.build(None)
    assert len(events) == 6  # 2013, 2018, and one dated record per annual archive
    assert events.loc[events.source.eq("sinasic_v2"), "year"].tolist() == [2013]
    point = events.loc[events.source.eq("info_estadistica")].iloc[0]
    assert str(point.start_date.date()) == "2018-05-04"
    assert (point.cve_ent, point.cve_mun, point.state) == ("15", "106", "MÃ©xico")
    assert events.loc[events.source.eq("conafor_2021"), "lat"].iloc[0] == pytest.approx(22.5, abs=0.01)
    assert monthly.n_fires.sum() == len(events)
    assert monthly.loc[monthly.year.eq(2013), "month"].isna().all()
    assert summary["anomalies"]["sinasic_multi_year_polygons_excluded"] == 1
    assert summary["anomalies"]["conafor_2021_duplicate_ids"] == 1
