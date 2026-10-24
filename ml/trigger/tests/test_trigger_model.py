"""Test harness for ``trigger_model`` — skeleton and synthetic fixtures.

This module establishes the pytest + hypothesis test harness for the
Trigger_Model pipeline. It provides reusable fixtures so the pipeline can be
exercised without the real raw KW51 dataset:

- ``synthetic_mat`` / ``synthetic_mat_path`` build a tiny ``.mat`` via
  ``scipy.io.savemat`` carrying a ``modes`` struct with ``sdn``, ``f``, and
  ``env``, mirroring exactly what ``load_modes`` extracts
  (``pd.to_datetime(sdn - 719529, unit="D")``, ``f[:, 5]``, ``env[:, 0]``).
- ``readings_df`` and friends supply in-memory DataFrames of synthetic
  readings (``timestamp`` / ``temperature_c`` / ``frequency_hz``) for
  pipeline-stage tests.

Actual property and unit tests are added by later tasks; this file intentionally
contains only the harness and fixtures.

``pytest`` and ``hypothesis`` are dev-only tools and are NOT listed in the
runtime ``ml/trigger/requirements.txt``.
"""

import numpy as np
import pandas as pd
import pytest
from scipy.io import savemat

# Importable because ml/trigger/conftest.py puts ml/trigger/ on sys.path.
import trigger_model


# MATLAB datenum epoch offset: datenum(1970,1,1) == 719529. Subtracting it
# turns a MATLAB serial date number into days since the Unix epoch, which
# pandas reads with unit="D". load_modes relies on exactly this convention.
MATLAB_DATENUM_UNIX_EPOCH = 719529


# --------------------------------------------------------------------------- #
# Synthetic .mat fixtures (exercise load_modes without the real raw dataset)
# --------------------------------------------------------------------------- #

def _datenum(timestamp):
    """Convert a pandas Timestamp to a MATLAB serial date number (sdn)."""
    days_since_epoch = (pd.Timestamp(timestamp) - pd.Timestamp("1970-01-01")) / pd.Timedelta(days=1)
    return days_since_epoch + MATLAB_DATENUM_UNIX_EPOCH


@pytest.fixture
def synthetic_modes():
    """Return the raw arrays backing a synthetic ``modes`` struct.

    Shapes mirror ``load_modes`` expectations:

    - ``sdn``: 1-D MATLAB datenum values (one per reading).
    - ``f``:   2-D array with >= 6 columns; mode-6 frequency is column index 5.
    - ``env``: 2-D array with >= 1 column; steel temperature is column index 0.

    The three arrays share the same row count (one row per reading) and encode
    a few readings spread across the healthy / retrofit / after periods so that
    downstream extraction and segmentation have something to work with.
    """
    timestamps = [
        "2019-04-01 00:00:00",  # healthy (before HEALTHY_END)
        "2019-05-01 12:00:00",  # healthy
        "2019-07-01 00:00:00",  # retrofit (within the retrofit span)
        "2019-10-01 00:00:00",  # after (past RETROFIT_END)
    ]
    sdn = np.array([_datenum(ts) for ts in timestamps], dtype=float)

    n = len(timestamps)
    # f has 6 columns; only column 5 (mode-6) is read by load_modes. Fill the
    # other columns with distinct values so a wrong-column extraction is caught.
    f = np.zeros((n, 6), dtype=float)
    for col in range(6):
        f[:, col] = np.arange(n, dtype=float) + (col * 100.0)
    # Known mode-6 frequencies (column index 5).
    f[:, 5] = np.array([10.0, 10.2, 9.8, 9.5], dtype=float)

    # env has >= 1 column; only column 0 (steel temperature °C) is read.
    env = np.zeros((n, 2), dtype=float)
    env[:, 0] = np.array([5.0, 18.0, 25.0, 8.0], dtype=float)  # temperature_c
    env[:, 1] = np.array([40.0, 55.0, 60.0, 45.0], dtype=float)  # unused extra column

    return {"sdn": sdn, "f": f, "env": env, "timestamps": timestamps}


@pytest.fixture
def synthetic_mat_path(tmp_path, synthetic_modes):
    """Write a tiny synthetic ``.mat`` and return its path.

    The file contains a single ``modes`` struct (as a dict, which
    ``scipy.io.savemat`` stores as a MATLAB struct) with the ``sdn``, ``f``, and
    ``env`` fields, so ``load_modes`` can read it just like the real dataset.
    """
    path = tmp_path / "trackedmodes.mat"
    modes = {
        "sdn": synthetic_modes["sdn"],
        "f": synthetic_modes["f"],
        "env": synthetic_modes["env"],
    }
    savemat(str(path), {"modes": modes})
    return path


@pytest.fixture
def struct_less_mat_path(tmp_path):
    """Write a ``.mat`` that lacks a ``modes`` struct (for abort-path tests)."""
    path = tmp_path / "no_modes.mat"
    savemat(str(path), {"something_else": np.array([1.0, 2.0, 3.0])})
    return path


@pytest.fixture
def missing_mat_path(tmp_path):
    """Return a path to a ``.mat`` that does not exist (for abort-path tests)."""
    return tmp_path / "does_not_exist.mat"


# --------------------------------------------------------------------------- #
# In-memory readings DataFrame fixtures (pipeline-stage tests)
# --------------------------------------------------------------------------- #

def _make_readings(timestamps, temperature_c, frequency_hz):
    """Build a tidy readings DataFrame with the pipeline's working columns."""
    return pd.DataFrame(
        {
            "timestamp": pd.to_datetime(list(timestamps)),
            "temperature_c": np.asarray(temperature_c, dtype=float),
            "frequency_hz": np.asarray(frequency_hz, dtype=float),
        }
    )


@pytest.fixture
def readings_df():
    """A small tidy readings DataFrame spanning all three periods.

    Columns match the pipeline's internal working frame:
    ``timestamp`` (datetime64), ``temperature_c`` (float), ``frequency_hz``
    (float). Timestamps straddle both the ``HEALTHY_END`` and ``RETROFIT_END``
    boundaries so segmentation and later stages have readings in each period.
    """
    return _make_readings(
        timestamps=[
            "2019-03-01 00:00:00",  # healthy
            "2019-05-14 23:59:59",  # healthy (just before HEALTHY_END)
            "2019-05-15 00:00:00",  # retrofit (at HEALTHY_END boundary)
            "2019-09-27 23:59:59",  # retrofit (last retrofit instant)
            "2019-09-28 00:00:00",  # after (just past RETROFIT_END)
            "2019-11-01 00:00:00",  # after
        ],
        temperature_c=[4.0, 17.0, 18.0, 22.0, 9.0, 3.0],
        frequency_hz=[10.00, 10.15, 10.18, 10.25, 9.60, 9.40],
    )


@pytest.fixture
def healthy_readings_df():
    """A healthy-only readings frame whose points lie on a known line.

    ``frequency_hz = slope * temperature_c + intercept`` with ``slope = 0.01``
    and ``intercept = 9.95`` exactly, so a fit test can recover known values.
    """
    temperature_c = [0.0, 5.0, 10.0, 15.0, 20.0, 25.0]
    slope, intercept = 0.01, 9.95
    frequency_hz = [slope * t + intercept for t in temperature_c]
    timestamps = [
        "2019-03-01 00:00:00",
        "2019-03-08 00:00:00",
        "2019-03-15 00:00:00",
        "2019-03-22 00:00:00",
        "2019-04-01 00:00:00",
        "2019-04-10 00:00:00",
    ]
    return _make_readings(timestamps, temperature_c, frequency_hz)


@pytest.fixture
def readings_with_nans_df():
    """A readings frame with injected NaNs in required fields (cleaning tests).

    Rows 0 and 3 are fully present and must survive cleaning; rows 1, 2, and 4
    each carry a NaN in one required field and must be dropped.
    """
    df = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [
                    "2019-03-01 00:00:00",
                    None,                     # null timestamp -> drop
                    "2019-03-15 00:00:00",
                    "2019-03-22 00:00:00",
                    "2019-04-01 00:00:00",
                ]
            ),
            "temperature_c": [4.0, 10.0, np.nan, 12.0, 15.0],  # NaN on row 2 -> drop
            "frequency_hz": [10.0, 10.1, 10.2, 10.3, np.nan],  # NaN on row 4 -> drop
        }
    )
    return df
