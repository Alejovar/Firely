import struct

import numpy as np

from pipeline.events import cluster_points, connected_components, hull_wkb


def test_connected_components():
    r = connected_components(5, np.array([0, 3]), np.array([1, 4]))
    assert r[0] == r[1] and r[3] == r[4] and len({r[0], r[2], r[3]}) == 3


def test_space_time_clustering():
    lat = np.array([20.0, 20.005, 20.010, 20.0, 25.0, 25.0])
    lon = np.array([-100.0] * 6)
    day = np.array([100, 101, 103, 110, 100, 100])
    lab = cluster_points(lat, lon, day, dist_km=1.5, days=3)
    assert lab[0] == lab[1] == lab[2]      # chain in space/time (gaps <= 3 days, <1.5 km)
    assert lab[3] != lab[0]                # same place, 7 days later
    assert lab[4] == lab[5] != lab[0]      # far away, same day, together
    assert len(set(lab)) == 3


def test_distance_threshold():
    lab = cluster_points([20.0, 20.1], [-100.0, -100.0], [5, 5], dist_km=1.5, days=3)  # ~11 km apart
    assert lab[0] != lab[1]


def test_hull_wkb():
    w = hull_wkb(np.array([0, 1, 1, 0, 0.5]), np.array([0, 0, 1, 1, 0.5]))
    assert struct.unpack("<BI", w[:5]) == (1, 3)
    assert struct.unpack("<I", w[9:13])[0] == 5  # 4 corners + closing point
    assert struct.unpack("<BI", hull_wkb(np.array([1.0]), np.array([2.0]))[:5]) == (1, 1)
