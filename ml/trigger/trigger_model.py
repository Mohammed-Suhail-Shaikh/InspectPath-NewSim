"""Trigger_Model — temperature-compensated structural trigger detection.

Single, explainable pipeline over the KW51 tracked-modes dataset. Runs end to
end with ``python ml/trigger/trigger_model.py`` and produces five artifacts:

- ``ml/trigger/plots/naive_vs_corrected.png`` — two-panel time-series comparison
- ``ml/trigger/plots/freq_vs_temp.png``       — healthy-period scatter + fit line
- ``ml/trigger/results.md``                    — measured-numbers report
- ``data/trigger/replay_kw51.json``            — full replay feed (contract format)
- ``data/trigger/replay_kw51_demo.json``       — short demo window crossing into alert

The pipeline fits a linear frequency-vs-temperature model on the healthy period,
classifies temperature-corrected residuals against named thresholds, compares
against a naive baseline, and emits plots, a report, and contract-format replay
JSON. All writable paths stay within ``ml/trigger/``, ``data/trigger/``, and the
repo-root ``.gitignore``.
"""

import json
import os
import sys

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")  # headless rendering; safe for CI / scripted runs
import matplotlib.pyplot as plt

from scipy.io import loadmat
from scipy.stats import linregress


# --- Alert thresholds (WORKING ASSUMPTION, see Requirement 15 / open-decision note) ---
WATCH_THRESHOLD = 0.75     # |metric| >= this -> watch
WARNING_THRESHOLD = 1.5    # |metric| >= this -> warning
ALARM_THRESHOLD = 2.0      # |metric| >= this -> alarm

# --- Period boundaries ---
HEALTHY_END = "2019-05-15"    # readings strictly before -> healthy
RETROFIT_END = "2019-09-27"   # readings through 23:59:59 this day -> retrofit; after -> after

# --- Fixed replay field values (shared contract section 2) ---
NODE_ID = "node-1"
QUALITY = "ok"
SOURCE = "KW51 replay"        # WORKING ASSUMPTION vs contract "Z24 replay"

# --- Paths (all within owned directories) ---
RAW_PATH = "ml/trigger/raw/trackedmodes.mat"
PLOTS_DIR = "ml/trigger/plots"
RESULTS_PATH = "ml/trigger/results.md"
REPLAY_PATH = "data/trigger/replay_kw51.json"
DEMO_PATH = "data/trigger/replay_kw51_demo.json"
GITIGNORE_PATH = ".gitignore"
GITIGNORE_ENTRIES = ["ml/trigger/raw/", "__pycache__/", ".venv/"]


def ensure_gitignore(path, entries):
    """Create ``.gitignore`` with the entries, or append only missing full-line entries.

    When ``path`` is absent, write a new file containing exactly ``entries``,
    each on its own newline-terminated line (Requirement 1.1). When ``path``
    exists, append only those entries not already present as exact full-line
    matches, leaving every pre-existing line unchanged (Requirement 1.2); if the
    existing content lacks a trailing newline, insert one before the first
    appended entry so nothing joins an existing line (Requirement 1.3). If all
    entries are already present, make no change (Requirement 1.4). If the target
    cannot be written, abort without clobbering the existing file and raise an
    error identifying the target (Requirement 1.6).
    """
    try:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                content = handle.read()
        except FileNotFoundError:
            content = None

        if content is None:
            # File absent: create it containing exactly the entries (1.1).
            new_content = "".join(entry + "\n" for entry in entries)
            with open(path, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(new_content)
            return

        # File present: find entries missing as exact full-line matches (1.2).
        existing_lines = {line.rstrip("\n") for line in content.splitlines()}
        missing = [entry for entry in entries if entry not in existing_lines]

        if not missing:
            # All entries already present -> no change (1.4).
            return

        # Insert a leading newline if the file lacks a trailing one (1.3).
        prefix = "" if (content == "" or content.endswith("\n")) else "\n"
        appended = prefix + "".join(entry + "\n" for entry in missing)
        with open(path, "a", encoding="utf-8", newline="\n") as handle:
            handle.write(appended)
    except OSError as exc:
        # Abort preserving existing state; report the target (1.6).
        raise OSError(f"Failed to write ignore file target: {path} ({exc})") from exc


# MATLAB serial datenum epoch offset: days from 0000-00-00 (MATLAB) to the Unix
# epoch 1970-01-01 (`pd.to_datetime` origin). `sdn - 719529` yields days since
# 1970-01-01, which `unit="D"` interprets directly (Requirement 3.2).
MATLAB_DATENUM_EPOCH_OFFSET = 719529

# Column indices into the MATLAB struct's 2-D arrays (Requirements 3.3, 3.4).
FREQUENCY_COL = 5  # modes.f[:, 5] -> mode-6 natural frequency (Hz)
TEMPERATURE_COL = 0  # modes.env[:, 0] -> steel temperature (deg C)

# Required columns that must be fully present for a reading to be usable.
REQUIRED_COLUMNS = ["timestamp", "temperature_c", "frequency_hz"]


def load_modes(path):
    """Load the ``.mat`` dataset and build a tidy readings DataFrame.

    Read the MATLAB file at ``path`` via
    ``loadmat(path, squeeze_me=True, struct_as_record=False)["modes"]`` and build
    a tidy DataFrame with columns ``timestamp`` (datetime64), ``temperature_c``
    (float), and ``frequency_hz`` (float). The MATLAB datenum field ``sdn`` is
    converted to timestamps with ``pd.to_datetime(sdn - 719529, unit="D")``
    (Requirement 3.2); mode-6 natural frequency is taken from ``f[:, 5]``
    (Requirement 3.3) and steel temperature from ``env[:, 0]`` (Requirement 3.4).

    Abort with an error identifying the problem if the file is missing or
    unreadable, or if it contains no ``modes`` struct exposing the expected
    ``sdn`` / ``f`` / ``env`` fields (Requirement 3.6).
    """
    # Abort on a missing or unreadable dataset file (Requirement 3.6).
    try:
        mat = loadmat(path, squeeze_me=True, struct_as_record=False)
    except (FileNotFoundError, OSError) as exc:
        raise OSError(f"Dataset file is missing or unreadable: {path} ({exc})") from exc
    except Exception as exc:  # malformed / non-.mat content
        raise ValueError(f"Dataset file could not be parsed as a .mat file: {path} ({exc})") from exc

    # Abort when the file has no `modes` struct (Requirement 3.6).
    if "modes" not in mat:
        raise ValueError(f"Dataset file has no 'modes' struct: {path}")
    modes = mat["modes"]

    # The `modes` struct must expose the fields the pipeline extracts from.
    for field in ("sdn", "f", "env"):
        if not hasattr(modes, field):
            raise ValueError(f"'modes' struct is missing the '{field}' field: {path}")

    sdn = np.atleast_1d(np.asarray(modes.sdn))
    freq_array = np.asarray(modes.f)
    env_array = np.asarray(modes.env)

    # `squeeze_me=True` collapses singleton dimensions, so a single-column field
    # arrives as a 1-D array. Extract each target column, treating a 1-D array as
    # the sole (column-0) series and requiring the needed column otherwise.
    frequency_hz = _extract_column(
        freq_array, FREQUENCY_COL, "modes.f", "mode-6 frequency", path
    )
    temperature_c = _extract_column(
        env_array, TEMPERATURE_COL, "modes.env", "steel temperature", path
    )

    # Convert MATLAB datenum to timestamps (Requirement 3.2).
    timestamps = pd.to_datetime(sdn - MATLAB_DATENUM_EPOCH_OFFSET, unit="D")

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "temperature_c": temperature_c.astype(float),
            "frequency_hz": frequency_hz.astype(float),
        }
    )


def _extract_column(array, col, field_name, meaning, path):
    """Return column ``col`` of a loaded MATLAB array as a 1-D series.

    Handles the ``squeeze_me=True`` case where a single-column field arrives as
    a 1-D array: column 0 of such an array is the array itself. Raise a clear
    error identifying the dataset when the requested column is absent
    (Requirement 3.6).
    """
    if array.ndim == 1:
        if col == 0:
            return array
        raise ValueError(f"'{field_name}' lacks column {col} for {meaning}: {path}")
    if array.ndim >= 2 and array.shape[1] > col:
        return array[:, col]
    raise ValueError(f"'{field_name}' lacks column {col} for {meaning}: {path}")


def clean(df):
    """Drop readings with null/NaN timestamp, temperature, or frequency.

    Retain every reading whose ``timestamp``, ``temperature_c``, and
    ``frequency_hz`` are all present, dropping only those with a null/NaN value
    in any required field (Requirement 3.5). Abort with a "no usable data" error
    if no readings remain after cleaning (Requirement 3.7).
    """
    cleaned = df.dropna(subset=REQUIRED_COLUMNS).reset_index(drop=True)

    # Abort when cleaning leaves nothing to analyze (Requirement 3.7).
    if cleaned.empty:
        raise ValueError("No usable data: no readings remain after dropping incomplete rows.")

    return cleaned


def segment(df):
    """Add a ``period`` column labeling each reading by date boundary.

    Return a copy of ``df`` with a ``period`` column that assigns every retained
    reading to exactly one of three mutually exclusive, jointly exhaustive
    periods based on its ``timestamp``:

    - ``healthy``: timestamp strictly before ``HEALTHY_END`` 00:00:00
      (Requirement 4.1).
    - ``retrofit``: timestamp at or after ``HEALTHY_END`` 00:00:00 and at or
      before ``RETROFIT_END`` 23:59:59 inclusive (Requirement 4.2).
    - ``after``: timestamp strictly after ``RETROFIT_END`` 23:59:59
      (Requirement 4.3).

    The ``retrofit`` upper bound "through 23:59:59" is handled as "strictly
    before the day after ``RETROFIT_END`` at 00:00:00", so sub-second timestamps
    on ``RETROFIT_END`` (e.g. 23:59:59.5) still fall in ``retrofit``. Because the
    three conditions tile the timeline without overlap or gap, every retained
    reading receives exactly one label (Requirement 4.4).
    """
    healthy_start = pd.Timestamp(HEALTHY_END)          # 2019-05-15 00:00:00
    retrofit_end_exclusive = pd.Timestamp(RETROFIT_END) + pd.Timedelta(days=1)  # 2019-09-28 00:00:00

    result = df.copy()
    timestamp = result["timestamp"]

    # Default to retrofit, then override the two open-ended tails. The three
    # branches are mutually exclusive and jointly exhaustive (Requirement 4.4).
    period = np.where(
        timestamp < healthy_start,
        "healthy",
        np.where(timestamp < retrofit_end_exclusive, "retrofit", "after"),
    )
    result["period"] = period
    return result


def fit_compensation(healthy_df):
    """OLS fit of frequency on temperature over healthy readings -> (slope, intercept, r_squared).

    Fit the Compensation_Model as an ordinary-least-squares linear regression of
    ``frequency_hz`` (dependent) on ``temperature_c`` (independent) using only the
    Healthy_Period readings in ``healthy_df`` (Requirement 5.1), via
    ``scipy.stats.linregress(temperature_c, frequency_hz)``. Return the fitted
    ``slope``, ``intercept``, and ``r_squared = result.rvalue ** 2`` (Requirement
    11.2). Abort before fitting if the healthy period has fewer than 2 readings,
    reporting that there are insufficient healthy readings to fit the model
    (Requirement 5.2).
    """
    # Stop before fitting when the healthy period is too small to regress (5.2).
    if len(healthy_df) < 2:
        raise ValueError(
            "Insufficient healthy readings to fit model: "
            f"the healthy period has {len(healthy_df)} reading(s), at least 2 required."
        )

    result = linregress(healthy_df["temperature_c"], healthy_df["frequency_hz"])
    r_squared = result.rvalue ** 2
    return result.slope, result.intercept, r_squared


def predict(df, slope, intercept):
    """Compute predicted frequency per reading from the fitted line.

    Apply the fitted Compensation_Model to every reading in ``df`` (all periods),
    returning ``slope * temperature_c + intercept`` per reading as a Series
    aligned to ``df`` (Requirement 5.3).
    """
    return slope * df["temperature_c"] + intercept


def compute_residual_pct(df):
    """Compute signed percent residual per reading; undefined (NaN) where predicted == 0.

    For every reading in ``df``, compute the signed Residual_Pct as
    ``(actual - predicted) / predicted * 100``, where ``actual`` is the measured
    ``frequency_hz`` and ``predicted`` is the ``predicted_frequency_hz`` produced
    by :func:`predict` (Requirement 5.4). The result keeps its sign so a measured
    frequency above the prediction yields a positive residual and one below
    yields a negative residual. Where a reading's predicted frequency equals 0,
    the ratio is undefined, so mark that reading ``NaN`` rather than dividing by
    zero (Requirement 5.5); such readings are later excluded from alert
    assignment. Return a Series aligned to ``df``.
    """
    actual = df["frequency_hz"]
    predicted = df["predicted_frequency_hz"]

    # Guard the division: where predicted == 0 the ratio is undefined, so emit
    # NaN for those readings instead of dividing by zero (Requirement 5.5).
    residual_pct = np.where(
        predicted == 0,
        np.nan,
        (actual - predicted) / predicted.where(predicted != 0, other=1.0) * 100,
    )
    return pd.Series(residual_pct, index=df.index, name="residual_pct")


def compute_naive(df, healthy_mean):
    """Compute the naive percent-deviation-from-healthy-mean metric per reading.

    For every reading in ``df``, compute the Naive_Baseline metric as
    ``(frequency_hz - healthy_mean) / healthy_mean * 100``, where ``healthy_mean``
    is the mean Mode_6_Frequency over Healthy_Period readings (Requirement 7.1).
    Unlike the temperature-corrected residual this metric ignores temperature
    entirely; it is later classified with the same :func:`classify` function and
    thresholds, which is what makes the two methods directly comparable
    (Requirement 7.3). Return a Series aligned to ``df``.

    Abort before computing the metric when the healthy-period mean frequency is
    unavailable: the "0 healthy readings" condition surfaces as a NaN/None mean
    passed in, and a zero mean would make the ratio undefined. Guard against
    ``healthy_mean`` being ``None``, NaN, or 0 and raise a ``ValueError`` whose
    message indicates the healthy-period mean frequency is unavailable
    (Requirement 7.2), following the abort pattern used by
    :func:`fit_compensation`.
    """
    # Abort before computing when the healthy mean is unavailable (7.2):
    # None / NaN arise from 0 healthy readings; 0 would divide by zero.
    if healthy_mean is None:
        raise ValueError(
            "Healthy period mean frequency unavailable: no healthy readings to "
            "compute the mean Mode_6_Frequency for the naive baseline."
        )
    if healthy_mean != healthy_mean:  # NaN is the only value unequal to itself
        raise ValueError(
            "Healthy period mean frequency unavailable: the healthy-period mean "
            "Mode_6_Frequency is NaN (no usable healthy readings)."
        )
    if healthy_mean == 0:
        raise ValueError(
            "Healthy period mean frequency unavailable: the healthy-period mean "
            "Mode_6_Frequency is 0, so the naive percent deviation is undefined."
        )

    naive_pct = (df["frequency_hz"] - healthy_mean) / healthy_mean * 100
    return pd.Series(naive_pct, index=df.index, name="naive_pct")


def classify(abs_metric):
    """Map an absolute metric to ``normal`` / ``watch`` / ``warning`` / ``alarm``.

    Classify a metric's magnitude against the top-of-file thresholds using
    half-open intervals (Requirements 6.1–6.5, 7.3):

    - ``[0, WATCH_THRESHOLD)``   -> ``normal``
    - ``[WATCH_THRESHOLD, WARNING_THRESHOLD)`` -> ``watch``
    - ``[WARNING_THRESHOLD, ALARM_THRESHOLD)`` -> ``warning``
    - ``[ALARM_THRESHOLD, inf)`` -> ``alarm``

    Each boundary value belongs to the higher level (the lower bound is
    inclusive, the upper bound exclusive), so exactly ``0.75`` is ``watch``,
    ``1.5`` is ``warning``, and ``2.0`` is ``alarm``. Severity never decreases as
    the magnitude grows.

    Callers pass an already-absolute metric (``abs(metric)``); the magnitude is
    taken again here defensively so a stray sign cannot flip the level. A
    ``None`` or NaN input has no defined metric and is excluded from
    classification: return ``None`` (no level) rather than defaulting to
    ``normal`` (Requirement 6.6).
    """
    # None / NaN input is excluded: no level is assigned (Requirement 6.6).
    if abs_metric is None:
        return None
    magnitude = abs(abs_metric)
    if magnitude != magnitude:  # NaN is the only value unequal to itself
        return None

    if magnitude < WATCH_THRESHOLD:
        return "normal"
    if magnitude < WARNING_THRESHOLD:
        return "watch"
    if magnitude < ALARM_THRESHOLD:
        return "warning"
    return "alarm"


# Alert levels that count as "above normal" for comparison metrics. Readings
# with no level (None/NaN/excluded) are never members of this set and so are
# never counted (Requirements 8.1, 8.3).
ABOVE_NORMAL_LEVELS = {"watch", "warning", "alarm"}

# Map the ``method`` selector to the alert column it scores (Requirement 8.2).
METHOD_ALERT_COLUMNS = {
    "naive": "naive_alert_level",
    "corrected": "alert_level",
}


def _count_above_normal(levels):
    """Count entries in ``levels`` that are above ``normal``.

    Count only values in :data:`ABOVE_NORMAL_LEVELS`; ``None``/NaN (excluded,
    undefined-residual readings) and ``normal`` contribute nothing. An empty
    input yields 0, so a period with 0 readings reports 0 rather than crashing
    (Requirement 8.4). Return a plain Python ``int``.
    """
    count = sum(1 for level in levels if level in ABOVE_NORMAL_LEVELS)
    return int(count)


def count_false_alarms(df, method):
    """Count healthy-period readings above ``normal`` for the given method.

    Restrict ``df`` to the Healthy_Period (``period == "healthy"``) and count how
    many of those readings were assigned an alert level above ``normal`` (one of
    ``watch``/``warning``/``alarm``) under ``method`` (Requirement 8.1). The
    ``method`` selector chooses the alert column scored: ``"naive"`` reads
    ``naive_alert_level`` and ``"corrected"`` reads ``alert_level`` (Requirement
    8.2); any other value raises a ``ValueError`` naming the unrecognized method.
    Readings with no level (``None``/NaN, i.e. excluded undefined-residual
    readings) are not counted. The healthy period having 0 readings yields 0
    rather than an error (Requirement 8.4). Return a non-negative Python ``int``.
    """
    try:
        column = METHOD_ALERT_COLUMNS[method]
    except KeyError:
        raise ValueError(
            f"Unrecognized method {method!r}: expected one of "
            f"{sorted(METHOD_ALERT_COLUMNS)}."
        ) from None

    healthy = df[df["period"] == "healthy"]
    return _count_above_normal(healthy[column])


def count_detections(df):
    """Count after-period readings above ``normal`` under the corrected model.

    Restrict ``df`` to the After_Period (``period == "after"``) and count how
    many of those readings were assigned a corrected ``alert_level`` above
    ``normal`` (one of ``watch``/``warning``/``alarm``) (Requirement 8.3).
    Readings with no level (``None``/NaN, i.e. excluded undefined-residual
    readings) are not counted. The after period having 0 readings yields 0 rather
    than an error (Requirement 8.4). Return a non-negative Python ``int``.
    """
    after = df[df["period"] == "after"]
    return _count_above_normal(after["alert_level"])


# Threshold magnitudes drawn as symmetric (±) reference lines on each panel
# (Requirement 9.3). Ordered to match the named severity constants.
THRESHOLD_LINES = (WATCH_THRESHOLD, WARNING_THRESHOLD, ALARM_THRESHOLD)


def _save_figure_preserving(fig, path):
    """Write ``fig`` to ``path``, aborting without clobbering an existing file.

    Render first to a sibling temporary file in the same directory, then
    atomically replace the target only once the write fully succeeds. If any
    part of the write fails, the temporary file is removed and the original
    ``path`` is left untouched; an ``OSError`` is raised identifying the target
    (Requirements 9.5, 10.4, 1.6). The figure is always closed to release
    resources.
    """
    directory = os.path.dirname(path) or "."
    tmp_path = None
    try:
        # Ensure the plots directory exists before rendering into it.
        os.makedirs(directory, exist_ok=True)
        # Keep the target's extension so matplotlib infers the right format;
        # the ".tmp" marker sits before it (e.g. "plot.tmp.png").
        root, ext = os.path.splitext(path)
        tmp_path = f"{root}.tmp{ext}"
        fig.savefig(tmp_path)
        # Atomic replace: the existing target is only touched once the new
        # image has been written in full, so a failure preserves it (1.6).
        os.replace(tmp_path, path)
        tmp_path = None
    except OSError as exc:
        raise OSError(f"Failed to write plot file target: {path} ({exc})") from exc
    finally:
        # Drop a partial temp file if the replace never happened.
        if tmp_path is not None:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        plt.close(fig)


def make_comparison_plot(df, path):
    """Render the two-panel naive-vs-corrected time-series comparison plot.

    Draw two vertically stacked panels sharing a common time axis (Requirement
    9.2): the upper panel plots the Naive_Baseline deviation (``naive_pct``) over
    ``timestamp`` and the lower panel plots the temperature-corrected
    Residual_Pct (``residual_pct``). On each panel draw the alert thresholds as
    symmetric horizontal reference lines at the positive and negative values
    0.75, 1.5, and 2.0, taken from :data:`WATCH_THRESHOLD`,
    :data:`WARNING_THRESHOLD`, and :data:`ALARM_THRESHOLD` (Requirement 9.3). The
    Retrofit_Period span (``HEALTHY_END`` 2019-05-15 through ``RETROFIT_END``
    2019-09-27) is shaded gray across both panels (Requirement 9.4). The figure
    is written to ``path`` (``PLOTS_DIR/naive_vs_corrected.png``; Requirement
    9.1); if it cannot be written, abort with an error identifying the plot file
    while preserving any existing file (Requirement 9.5).
    """
    timestamp = df["timestamp"]
    retrofit_start = pd.Timestamp(HEALTHY_END)   # 2019-05-15 00:00:00
    # Shade "through 2019-09-27 23:59:59 inclusive" as the full retrofit day
    # (end of RETROFIT_END), matching the segmentation upper bound.
    retrofit_end = pd.Timestamp(RETROFIT_END) + pd.Timedelta(days=1)

    fig, (ax_naive, ax_corrected) = plt.subplots(
        2, 1, figsize=(12, 8), sharex=True
    )

    panels = (
        (ax_naive, "naive_pct", "Naive baseline deviation (%)", "Naive baseline"),
        (ax_corrected, "residual_pct", "Corrected residual (%)", "Corrected (temp-compensated)"),
    )
    for axis, column, ylabel, title in panels:
        axis.plot(timestamp, df[column], color="tab:blue", linewidth=1.0, label=column)

        # Shade the retrofit span in gray on each panel (9.4).
        axis.axvspan(retrofit_start, retrofit_end, color="gray", alpha=0.25,
                     label="Retrofit period")

        # Symmetric ± threshold reference lines at 0.75 / 1.5 / 2.0 (9.3).
        for level in THRESHOLD_LINES:
            axis.axhline(level, color="tab:red", linestyle="--", linewidth=0.8)
            axis.axhline(-level, color="tab:red", linestyle="--", linewidth=0.8)

        axis.set_ylabel(ylabel)
        axis.set_title(title)
        axis.grid(True, alpha=0.3)

    ax_corrected.set_xlabel("Time")
    fig.suptitle("Naive baseline vs temperature-corrected residual")
    fig.autofmt_xdate()
    fig.tight_layout()

    _save_figure_preserving(fig, path)


def make_fit_plot(healthy_df, slope, intercept, path):
    """Render the healthy-period frequency-vs-temperature scatter with the fitted line.

    Draw a scatter of Mode_6_Frequency on the vertical axis against
    Steel_Temperature on the horizontal axis for the Healthy_Period readings in
    ``healthy_df`` (Requirement 10.2), then overlay the fitted Compensation_Model
    line ``slope * temperature_c + intercept`` across the healthy-period
    temperature range (min to max observed temperature) using the passed
    ``slope`` and ``intercept`` (Requirement 10.3). The figure is written to
    ``path`` (``PLOTS_DIR/freq_vs_temp.png``; Requirement 10.1); if it cannot be
    written, abort with an error identifying the plot file while preserving any
    existing file (Requirement 10.4).
    """
    temperature_c = healthy_df["temperature_c"]
    frequency_hz = healthy_df["frequency_hz"]

    fig, axis = plt.subplots(figsize=(10, 7))

    # Scatter of measured healthy readings: frequency (y) vs temperature (x) (10.2).
    axis.scatter(
        temperature_c,
        frequency_hz,
        s=12,
        alpha=0.5,
        color="tab:blue",
        label="Healthy readings",
    )

    # Overlay the fitted line across the healthy temperature range (10.3). Two
    # endpoints (min -> max) are enough to draw the straight regression line.
    x_line = np.array([temperature_c.min(), temperature_c.max()], dtype=float)
    y_line = slope * x_line + intercept
    axis.plot(
        x_line,
        y_line,
        color="tab:red",
        linewidth=1.5,
        label=f"Fitted line (slope={slope:.3f}, intercept={intercept:.3f})",
    )

    axis.set_xlabel("Steel temperature (deg C)")
    axis.set_ylabel("Mode-6 frequency (Hz)")
    axis.set_title("Healthy-period frequency vs temperature with fitted compensation model")
    axis.grid(True, alpha=0.3)
    axis.legend()
    fig.tight_layout()

    _save_figure_preserving(fig, path)


# Keys expected in the ``stats`` and ``counts`` mappings passed to
# :func:`write_results`. Documented here (and in the docstring) so ``main``
# (task 14.1) has a stable, self-consistent contract to populate.
STATS_KEYS = ("slope", "intercept", "r_squared")
COUNTS_KEYS = (
    "naive_healthy_false_alarms",
    "corrected_healthy_false_alarms",
    "corrected_after_detections",
)


def _write_text_preserving(text, path):
    """Write ``text`` to ``path`` atomically, preserving the target on failure.

    Render first to a sibling temporary file in the same directory, then
    atomically ``os.replace`` it onto the target only once the write fully
    succeeds. If any part of the write fails, drop the temporary file and leave
    the original ``path`` untouched, raising an ``OSError`` that identifies the
    target (Requirement 1.6), mirroring :func:`_save_figure_preserving`.
    """
    directory = os.path.dirname(path) or "."
    tmp_path = None
    try:
        os.makedirs(directory, exist_ok=True)
        root, ext = os.path.splitext(path)
        tmp_path = f"{root}.tmp{ext}"
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        # Atomic replace: the existing target is only touched once the new
        # content is written in full, so a failure preserves it (1.6).
        os.replace(tmp_path, path)
        tmp_path = None
    except OSError as exc:
        raise OSError(f"Failed to write results file target: {path} ({exc})") from exc
    finally:
        # Drop a partial temp file if the replace never happened.
        if tmp_path is not None:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def write_results(stats, counts, path):
    """Write ``results.md`` with measured stats, counts, and the open-decision note.

    Render the measured-numbers Results_Report to ``path``
    (``RESULTS_PATH = "ml/trigger/results.md"``; Requirement 11.1) from values
    computed during the current run and passed in via ``stats`` and ``counts``.
    No magnitude in the report is templated, hardcoded, or a stand-in: every
    number is formatted directly from these arguments (Requirement 11.5).

    ``stats`` and ``counts`` are mappings (dicts). The chosen, self-consistent
    key structure — easy for :func:`main` (task 14.1) to populate from
    :func:`fit_compensation`, :func:`count_false_alarms`, and
    :func:`count_detections` — is:

    ``stats`` (from :func:`fit_compensation`):

    - ``"slope"`` — Compensation_Model slope.
    - ``"intercept"`` — Compensation_Model intercept.
    - ``"r_squared"`` — Compensation_Model R² (``rvalue ** 2``).

    Each is written rounded to 3 decimal places (Requirement 11.2).

    ``counts`` (from the comparison-metric functions):

    - ``"naive_healthy_false_alarms"`` — Healthy_Period false alarms under the
      Naive_Baseline (``count_false_alarms(df, "naive")``).
    - ``"corrected_healthy_false_alarms"`` — Healthy_Period false alarms under
      the Compensation_Model (``count_false_alarms(df, "corrected")``).
    - ``"corrected_after_detections"`` — After_Period detections under the
      Compensation_Model (``count_detections(df)``).

    The two false-alarm counts (Requirement 11.3) and the detection count
    (Requirement 11.4) are written as non-negative integers.

    The report also carries an **Open Decisions** section with the Requirement
    15 note: Data_Contract section 2 specifies absolute-residual thresholds of
    2.0 watch / 5.0 warning / 8.0 alarm while this feature uses 0.75 watch /
    1.5 warning / 2.0 alarm (Requirement 15.2); the contract shows the example
    source label ``"Z24 replay"`` while this feature uses ``"KW51 replay"``
    (Requirement 15.3); and both are a working assumption pending team
    confirmation, with the shared contract left unchanged (Requirement 15.4).
    This function only ever writes to ``path``; it never touches
    ``docs/contract.md`` or any path outside the owned set (Requirements 15.4,
    15.5). If ``path`` cannot be written, abort with an error identifying the
    target and preserve its existing state (Requirement 1.6).
    """
    slope = stats["slope"]
    intercept = stats["intercept"]
    r_squared = stats["r_squared"]

    naive_false_alarms = int(counts["naive_healthy_false_alarms"])
    corrected_false_alarms = int(counts["corrected_healthy_false_alarms"])
    after_detections = int(counts["corrected_after_detections"])

    lines = [
        "# Trigger_Model results",
        "",
        "All values below are measured from the current analysis run.",
        "",
        "## Compensation model",
        "",
        f"- Slope: {slope:.3f}",
        f"- Intercept: {intercept:.3f}",
        f"- R-squared: {r_squared:.3f}",
        "",
        "## Alert counts",
        "",
        f"- Healthy-period false alarms (naive baseline): {naive_false_alarms}",
        f"- Healthy-period false alarms (compensation model): {corrected_false_alarms}",
        f"- After-period detections (compensation model): {after_detections}",
        "",
        "## Open Decisions",
        "",
        "The following discrepancies with the shared data contract "
        "(`docs/contract.md` section 2) are recorded here as an open decision; "
        "the shared contract is left unchanged.",
        "",
        "- Alert thresholds: the data contract section 2 specifies absolute-residual "
        "thresholds of 2.0 watch / 5.0 warning / 8.0 alarm, while this feature uses "
        "0.75 watch / 1.5 warning / 2.0 alarm.",
        '- Source label: the data contract section 2 shows the example source label '
        '"Z24 replay", while this feature uses "KW51 replay".',
        "- These feature values (thresholds 0.75 / 1.5 / 2.0 and source "
        '"KW51 replay") are a working assumption pending team confirmation; the '
        "shared contract (`docs/contract.md`) is not modified until the team "
        "confirms the change.",
        "",
    ]

    _write_text_preserving("\n".join(lines), path)


# Alert levels valid for a replay record's ``alert_level`` field (Requirement
# 12.6). Analyzed readings (defined residual) always carry one of these.
ALERT_LEVEL_ENUM = ("normal", "watch", "warning", "alarm")


def _format_timestamp_utc_z(timestamp):
    """Format a pandas/naive timestamp as an ISO-8601 UTC string with trailing ``Z``.

    Produce strings like ``2019-01-17T10:00:00Z`` (Requirement 12.5). A
    timezone-aware timestamp is converted to UTC; a naive timestamp is treated
    as already UTC. Seconds are always shown; sub-second precision is included
    only when the reading carries a nonzero fractional component, keeping the
    common whole-second case matching the contract example exactly.
    """
    ts = pd.Timestamp(timestamp)
    # Normalize to UTC: convert if tz-aware, drop the tzinfo so the ``Z`` suffix
    # is the single, unambiguous UTC marker.
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)

    if ts.nanosecond or ts.microsecond:
        # Preserve sub-second detail (microsecond resolution) when present.
        base = ts.strftime("%Y-%m-%dT%H:%M:%S.%f").rstrip("0").rstrip(".")
    else:
        base = ts.strftime("%Y-%m-%dT%H:%M:%S")
    return base + "Z"


def _round3(value):
    """Round a numeric value to 3 decimals as a plain Python ``float``.

    Used for ``temperature_c``, ``frequency_hz``, ``predicted_frequency_hz``, and
    the signed ``residual_pct`` (Requirement 12.7). ``round`` preserves the sign,
    so a negative residual stays negative. Returning ``float`` keeps the JSON
    output numeric rather than carrying numpy scalar types.
    """
    return round(float(value), 3)


def build_replay_records(df):
    """Build one nine-field replay record per analyzed reading, ascending timestamp.

    Produce the Replay_File record list from the fully analyzed DataFrame ``df``.
    Only *analyzed* readings are emitted: a reading whose ``residual_pct`` is
    undefined (NaN, i.e. predicted frequency was 0) is excluded, since such
    readings received no corrected alert level (Requirements 12.1, 5.5). The
    surviving readings are ordered by ascending ``timestamp`` (Requirement 12.1),
    and each becomes an ordered dict holding exactly the nine contract fields in
    order — no missing and no extra keys (Requirement 12.3):

    ``node_id``, ``timestamp``, ``temperature_c``, ``frequency_hz``,
    ``predicted_frequency_hz``, ``residual_pct``, ``alert_level``, ``quality``,
    ``source``.

    Fixed fields take their constant values: ``node_id = NODE_ID`` (``"node-1"``),
    ``quality = QUALITY`` (``"ok"``), ``source = SOURCE`` (``"KW51 replay"``)
    (Requirement 12.4). ``timestamp`` is an ISO-8601 UTC string with a trailing
    ``Z`` (Requirement 12.5). ``alert_level`` is the reading's corrected
    ``alert_level`` string, always one of the four enum values for an analyzed
    reading (Requirement 12.6). The four numeric fields are rounded to at most 3
    decimals, with ``residual_pct`` keeping its sign (Requirement 12.7).

    Returning an empty list when no readings are analyzed is intentional and lets
    :func:`write_json` emit ``[]`` for the no-data case (Requirement 12.2).
    """
    # Exclude undefined-residual readings, then order by ascending timestamp
    # (Requirements 12.1, 5.5). A stable sort keeps same-instant readings in
    # their original relative order.
    analyzed = df[df["residual_pct"].notna()].sort_values(
        "timestamp", kind="stable"
    )

    records = []
    for row in analyzed.itertuples(index=False):
        records.append(
            {
                "node_id": NODE_ID,
                "timestamp": _format_timestamp_utc_z(row.timestamp),
                "temperature_c": _round3(row.temperature_c),
                "frequency_hz": _round3(row.frequency_hz),
                "predicted_frequency_hz": _round3(row.predicted_frequency_hz),
                "residual_pct": _round3(row.residual_pct),
                "alert_level": str(row.alert_level),
                "quality": QUALITY,
                "source": SOURCE,
            }
        )
    return records


# Window span bounds, measured by the time difference between the first and last
# reading in the window (Requirement 13.2).
DEMO_WINDOW_MIN_SPAN = pd.Timedelta(days=1)
DEMO_WINDOW_MAX_SPAN = pd.Timedelta(days=7)

# Alert levels that count as the "crossed into alert" endpoint of a demo window
# (Requirement 13.3). The earlier endpoint must be "normal".
DEMO_WINDOW_ALERT_LEVELS = {"warning", "alarm"}


def select_demo_window(records):
    """Select a contiguous 1-7 day window transitioning normal -> warning/alarm.

    Pick, from the ascending-timestamp ``records`` produced by
    :func:`build_replay_records`, a Demo_Replay_File window that is a contiguous
    run of consecutive readings with no interior reading omitted (Requirement
    13.2). Because ``records`` is already ordered and holds exactly one entry per
    analyzed reading, "contiguous run with nothing omitted" means a slice
    ``records[i:j + 1]`` -- taking a slice of the already-complete series keeps
    every reading between its endpoints.

    The window must span at least 1 day and at most 7 days inclusive, measured as
    the time difference between the window's first and last reading (Requirement
    13.2), and must transition from an earlier reading at ``alert_level ==
    "normal"`` to a later reading at ``alert_level`` in ``{"warning", "alarm"}``
    (Requirement 13.3).

    The search walks each possible start index ``i`` that sits at a ``normal``
    reading, extends the end ``j`` forward while the span stays within 7 days,
    and returns the first slice whose span is also at least 1 day and that
    reaches a ``warning``/``alarm`` reading after the ``normal`` start. Returning
    the first qualifying window keeps the result deterministic and the shortest
    qualifying window for the earliest eligible start, which suits a short demo.

    If no contiguous window satisfies both the span and the transition criteria,
    abort with a ``ValueError`` indicating that no qualifying demo window was
    found (Requirement 13.4), following the fail-fast ``ValueError`` abort
    pattern used elsewhere in the pipeline.
    """
    # Parse each timestamp once so span checks are cheap. The records carry
    # ISO-8601 UTC strings ending in "Z"; pandas parses them back to the instant.
    timestamps = [pd.Timestamp(record["timestamp"]) for record in records]

    for i, start_record in enumerate(records):
        # A qualifying window opens at an earlier "normal" reading (13.3).
        if start_record["alert_level"] != "normal":
            continue

        start_time = timestamps[i]
        for j in range(i + 1, len(records)):
            span = timestamps[j] - start_time

            # Once the span exceeds 7 days, no later end for this start can
            # satisfy the upper bound either, so stop extending (13.2).
            if span > DEMO_WINDOW_MAX_SPAN:
                break

            # The later reading must cross into warning/alarm (13.3) and the
            # window must be at least 1 day wide (13.2).
            if (
                span >= DEMO_WINDOW_MIN_SPAN
                and records[j]["alert_level"] in DEMO_WINDOW_ALERT_LEVELS
            ):
                return records[i:j + 1]

    # No contiguous 1-7 day normal -> warning/alarm window exists (13.4).
    raise ValueError(
        "No qualifying demo window found: no contiguous run of readings spanning "
        "1 to 7 days transitions from an earlier 'normal' to a later "
        "'warning'/'alarm' alert level."
    )


def write_json(records, path):
    """Serialize a record list to a JSON array, preserving the target on failure.

    Write ``records`` to ``path`` as a JSON array (Requirements 12.1, 12.2,
    13.1). An empty list serializes to ``[]`` so the no-analyzed-readings case
    produces a valid empty JSON array rather than a missing or malformed file
    (Requirement 12.2). Each record's keys are written in insertion order, so the
    nine contract fields appear in the order :func:`build_replay_records`
    emits them.

    The write is atomic and preserving: content is rendered to a sibling
    temporary file and only ``os.replace``d onto the target once the write fully
    succeeds, so a failure leaves any existing file untouched and raises an
    ``OSError`` identifying the target (Requirement 1.6), mirroring
    :func:`_write_text_preserving`.
    """
    payload = json.dumps(list(records), indent=2)
    directory = os.path.dirname(path) or "."
    tmp_path = None
    try:
        os.makedirs(directory, exist_ok=True)
        root, ext = os.path.splitext(path)
        tmp_path = f"{root}.tmp{ext}"
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
        os.replace(tmp_path, path)
        tmp_path = None
    except OSError as exc:
        raise OSError(f"Failed to write JSON file target: {path} ({exc})") from exc
    finally:
        if tmp_path is not None:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


# Filename for the full replay-feed plot and the fit plot inside PLOTS_DIR.
COMPARISON_PLOT_PATH = os.path.join(PLOTS_DIR, "naive_vs_corrected.png")
FIT_PLOT_PATH = os.path.join(PLOTS_DIR, "freq_vs_temp.png")


def main():
    """Orchestrate the full pipeline; return 0 on success, non-zero on any abort.

    Runs the stages in dependency order (Requirement 14.1):
    ``ensure_gitignore`` -> ``load_modes`` -> ``clean`` -> ``segment`` ->
    ``fit_compensation`` -> ``predict`` -> ``compute_residual_pct`` ->
    ``compute_naive`` -> ``classify`` (corrected + naive) ->
    ``count_false_alarms``/``count_detections`` -> ``make_comparison_plot`` +
    ``make_fit_plot`` -> ``write_results`` -> ``build_replay_records`` ->
    ``write_json`` (full) -> ``select_demo_window`` -> ``write_json`` (demo).

    Returns ``0`` only when every stage succeeds and all five artifacts are
    written (Requirement 14.2). Each stage raises on a precondition failure; any
    such abort is caught here, a clear message is printed to stderr, and a
    non-zero status is returned (Requirement 14.3). Because every writing stage
    writes atomically and preserves its target on failure, an abort leaves
    existing outputs untouched.
    """
    try:
        # 1. Ensure the repo-root .gitignore carries the owned entries (Req 1).
        ensure_gitignore(GITIGNORE_PATH, GITIGNORE_ENTRIES)

        # 2. Load, clean, and segment the KW51 tracked-modes dataset (Req 3, 4).
        df = load_modes(RAW_PATH)
        df = clean(df)
        df = segment(df)

        # 3. Fit the temperature-compensation model on healthy readings (Req 5).
        healthy_df = df[df["period"] == "healthy"]
        slope, intercept, r_squared = fit_compensation(healthy_df)

        # 4. Predict expected frequency for every reading and derive residuals.
        df["predicted_frequency_hz"] = predict(df, slope, intercept)
        df["residual_pct"] = compute_residual_pct(df)

        # 5. Naive baseline over the healthy-period mean frequency (Req 7).
        healthy_mean = healthy_df["frequency_hz"].mean()
        df["naive_pct"] = compute_naive(df, healthy_mean)

        # 6. Classify both methods against the same thresholds (Req 6, 7.3).
        #    Undefined residuals (NaN) classify to None -> excluded (Req 5.5, 6.6).
        df["alert_level"] = df["residual_pct"].map(
            lambda value: classify(abs(value)) if pd.notna(value) else None
        )
        df["naive_alert_level"] = df["naive_pct"].map(
            lambda value: classify(abs(value)) if pd.notna(value) else None
        )

        # 7. Comparison metrics: healthy false alarms (both) + after detections.
        stats = {
            "slope": slope,
            "intercept": intercept,
            "r_squared": r_squared,
        }
        counts = {
            "naive_healthy_false_alarms": count_false_alarms(df, "naive"),
            "corrected_healthy_false_alarms": count_false_alarms(df, "corrected"),
            "corrected_after_detections": count_detections(df),
        }

        # 8. Diagnostic plots (Req 9, 10).
        make_comparison_plot(df, COMPARISON_PLOT_PATH)
        make_fit_plot(healthy_df, slope, intercept, FIT_PLOT_PATH)

        # 9. Measured-numbers report (Req 11, 15).
        write_results(stats, counts, RESULTS_PATH)

        # 10. Full contract-format replay feed (Req 12).
        records = build_replay_records(df)
        write_json(records, REPLAY_PATH)

        # 11. Short demo window crossing normal -> warning/alarm (Req 13).
        demo_records = select_demo_window(records)
        write_json(demo_records, DEMO_PATH)

        return 0
    except (OSError, ValueError, KeyError) as exc:
        # Fail fast: report the aborting stage to stderr and exit non-zero
        # (Requirement 14.3). Existing outputs are left untouched because each
        # writing stage writes atomically and preserves its target on failure.
        print(f"trigger_model: aborting: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
