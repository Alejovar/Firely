import numpy as np
import pandas as pd

from pipeline.context import episode_flags, grid_index, monthly_grid_stats, read_oni


def test_oni_central_month_and_five_season_episode(tmp_path):
    source = tmp_path / "oni.txt"
    source.write_text("SEAS YR TOTAL ANOM\n"
                      "DJF 2000 25 -0.6\nJFM 2000 25 -0.7\nFMA 2000 25 -0.8\n"
                      "MAM 2000 25 -0.9\nAMJ 2000 25 -1.0\nMJJ 2000 25 0.0\n"
                      "NDJ 2000 25 0.6\n", encoding="ascii")
    frame = read_oni(source)
    assert frame.month.tolist() == [1, 2, 3, 4, 5, 6, 12]
    assert frame.episode.tolist() == [True] * 5 + [False, False]
    assert frame.phase.tolist() == ["nina"] * 5 + ["neutral", "nino"]
    assert episode_flags(np.array(["nino"] * 4)).tolist() == [False] * 4


def test_grid_edges_and_monthly_daily_stats():
    assert grid_index(np.array([-1.0, -0.5, 0.49, 0.5, 1.5]), np.array([0.0, 1.0])).tolist() == [-1, 0, 0, 1, -1]
    values = np.array([[[1.0, np.nan]], [[3.0, 5.0]], [[9.0, 7.0]]])
    mean, maximum, p90 = monthly_grid_stats(values, np.array([1, 1, 2]), 1)
    assert np.allclose(mean[0, 0], 2.0)
    assert np.allclose(maximum[0, 0], 3.0)
    assert np.allclose(p90[0, 0], 2.8)
    assert np.allclose(mean[0, 1], 5.0)
