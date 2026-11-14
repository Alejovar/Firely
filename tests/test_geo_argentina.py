import numpy as np
import pandas as pd
import pytest
from shapely import Point, box, to_wkb

from pipeline.geo_argentina import cell_frames, locality_metrics, parent_codes, point_codes


def test_admin_assignment_and_locality_metrics():
    province = [{"level": "adm1", "code": "LR", "name": "La Rioja",
                 "geometry": box(-69, -31, -66, -27)}]
    departments = [{"level": "adm2", "code": "CH", "name": "Chilecito",
                    "geometry": box(-68, -30, -67, -29)}]
    parent_codes(province, departments)
    assert departments[0]["parent_code"] == "LR"
    assert point_codes(np.array([Point(-67.5, -29.16)], dtype=object), departments) == ["CH"]

    places = pd.DataFrame({"name": ["Chilecito", "Tiny", "Far"],
                           "pop": [42248, 99, 500], "lat": [-29.16163, -29.16, -31],
                           "lon": [-67.49934, -67.5, -68]})
    distance, population, name = locality_metrics(np.array([-29.16]), np.array([-67.5]), places)
    assert distance[0] < 0.3
    assert population.tolist() == [42347]
    assert name == ["Chilecito"]


def test_cell_spatial_join_and_protected_flag():
    h3 = pytest.importorskip("h3")
    cell = h3.latlng_to_cell(-29.16, -67.5, 6)
    province = [{"level": "adm1", "code": "LR", "geometry": box(-69, -31, -66, -27)}]
    department = [{"level": "adm2", "code": "CH", "geometry": box(-68, -30, -67, -29)}]
    places = pd.DataFrame({"name": ["Chilecito"], "pop": [42248],
                           "lat": [-29.16163], "lon": [-67.49934]})
    protected = pd.DataFrame({"geometry_wkb": [to_wkb(box(-67.6, -29.3, -67.4, -29.0))]})
    admin_cells, cell_geo = cell_frames([cell], province, department, places, protected)
    assert set(zip(admin_cells.level, admin_cells.code)) == {("adm1", "LR"), ("adm2", "CH")}
    assert cell_geo.loc[0, "in_protected_area"]
    assert cell_geo.loc[0, "pop_10km"] == 42248
