"""Anti-leakage checks of the forecast panel (docs/plan-modelo-predictivo.md §6, lista anti-fuga)."""
import numpy as np

from pipeline.forecast_features import _check_no_leak, _expanding, _lead, _rolling_sum


def test_features_do_not_read_the_future():
    _check_no_leak()


def test_expanding_climatology_uses_previous_years_only():
    a = np.arange(48, dtype=np.float32).reshape(1, 48)  # 4 years, value = month index
    mean, _ = _expanding(a, min_years=1)
    # January of year 3 (index 24) = mean of January of years 1 and 2 (indices 0 and 12)
    assert mean[0, 24] == 6.0
    assert np.isnan(mean[0, 5])  # no previous year
    # clim of the target month t+h read at issue t never includes month t+h itself
    assert _lead(mean, 1)[0, 23] == mean[0, 24]


def test_rolling_sum_keeps_missing_climate_as_missing():
    a = np.array([[1, 1, np.nan, 1, 1, 1]], dtype=np.float32)
    s = _rolling_sum(a, 3)
    assert np.isnan(s[0, 2]) and np.isnan(s[0, 4]) and s[0, 5] == 3
