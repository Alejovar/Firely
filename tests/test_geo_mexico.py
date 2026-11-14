import numpy as np
import pandas as pd
from shapely.geometry import Point, box

from pipeline.geo_mexico import assign_units, locality_metrics, parse_coordinate


def test_dms_coordinates_and_censored_values():
    assert abs(parse_coordinate('102°17\'45.768" W') + 102.2960467) < 1e-6
    assert abs(parse_coordinate('21°52\'47.362" N') - 21.8798228) < 1e-6
    assert parse_coordinate("") is None
    assert parse_coordinate("*") is None
    assert parse_coordinate("21°61'00\" N") is None


def test_spatial_assignment_and_locality_metrics():
    points = [Point(0, 0), Point(1, 0), Point(3, 0)]
    assert assign_units(points, [box(-1, -1, 1, 1), box(1, -1, 2, 1)], ["02", "01"]) == ["02", "01", None]
    places = pd.DataFrame({"name": ["Small", "Town", "Far"], "lat": [0, 0, 0],
                           "lon": [0, 0.05, 1], "pop": [20, 200, 300]})
    distance, population, names = locality_metrics(np.array([0.0]), np.array([0.0]), places)
    assert names == ["Town"]
    assert 5 < distance[0] < 6
    assert population.tolist() == [220]
