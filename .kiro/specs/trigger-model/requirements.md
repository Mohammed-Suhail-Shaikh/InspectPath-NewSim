# Requirements Document

## Introduction

The InspectPath structural trigger model detects abnormal changes in a bridge's structural behavior by comparing measured natural frequency against a temperature-compensated baseline. Raw monitoring data (the KW51 tracked-modes dataset) records natural frequency and environmental temperature over time. Because frequency naturally varies with temperature, a naive "percent deviation from mean" alerting approach produces many false alarms. This feature fits a linear temperature-compensation model on a known healthy period, then flags readings whose temperature-corrected residual exceeds configured thresholds.

The deliverables are a single runnable analysis script, two diagnostic plots, a measured-results report, and two replay JSON files (full and demo) that conform to the shared data contract. The implementation must stay simple and explainable, report only real measured numbers, and respect strict file-ownership boundaries: only files under `ml/trigger/`, `data/trigger/`, and the repository-root `.gitignore` may be created or modified.

An unresolved discrepancy exists between the shared `docs/contract.md` (section 2) alert thresholds and example source label, and the thresholds and source label requested for this feature. This is captured explicitly as a requirement/assumption to be resolved with the team before the shared contract is treated as changed.

## Glossary

- **Trigger_Model**: The complete feature comprising the analysis script, generated plots, results report, and replay JSON outputs for structural trigger detection.
- **Analysis_Script**: The single main Python program `ml/trigger/trigger_model.py`, runnable via `python ml/trigger/trigger_model.py`.
- **Tracked_Modes_Dataset**: The MATLAB `.mat` file `ml/trigger/raw/trackedmodes.mat` containing a struct named `modes`.
- **Mode_6_Frequency**: The mode 6 natural frequency in Hz, sourced from `modes.f[:, 5]`.
- **Steel_Temperature**: The steel temperature in degrees Celsius, sourced from `modes.env[:, 0]`.
- **Healthy_Period**: The timespan of readings before 2019-05-15, used to fit the compensation baseline.
- **Retrofit_Period**: The timespan of readings from 2019-05-15 through 2019-09-27 inclusive.
- **After_Period**: The timespan of readings after 2019-09-27.
- **Compensation_Model**: The ordinary-least-squares linear regression of Mode_6_Frequency on Steel_Temperature fitted on the Healthy_Period.
- **Residual_Pct**: The percentage residual computed as `(actual - predicted) / predicted * 100`.
- **Alert_Level**: One of `normal`, `watch`, `warning`, `alarm`, assigned from the absolute value of a percent metric.
- **Naive_Baseline**: An alerting method based on percent deviation of Mode_6_Frequency from the Healthy_Period mean frequency.
- **Replay_File**: The full JSON output `data/trigger/replay_kw51.json`.
- **Demo_Replay_File**: The windowed JSON output `data/trigger/replay_kw51_demo.json`.
- **Results_Report**: The measured-numbers report `ml/trigger/results.md`.
- **Data_Contract**: The shared specification `docs/contract.md`, section 2 of which governs trigger replay data.
- **False_Alarm**: A Healthy_Period reading assigned any Alert_Level above `normal`.

## Requirements

### Requirement 1: Repository ignore configuration

**User Story:** As the trigger-model owner, I want the repository ignore file to exclude raw data and local artifacts, so that large or local-only files are never committed.

#### Acceptance Criteria

1. IF the repository-root `.gitignore` file does not exist, THEN THE Trigger_Model SHALL create the repository-root `.gitignore` file containing exactly the three entries `ml/trigger/raw/`, `__pycache__/`, and `.venv/`, each on its own line terminated by a newline.
2. WHERE the repository-root `.gitignore` file already exists, THE Trigger_Model SHALL append only those entries among `ml/trigger/raw/`, `__pycache__/`, and `.venv/` that are not already present as exact full-line matches, appending each appended entry on its own line and leaving all pre-existing lines unchanged.
3. WHILE appending to an existing `.gitignore` whose final line is not newline-terminated, THE Trigger_Model SHALL insert a newline before the first appended entry so that no appended entry is joined onto an existing line.
4. WHEN all three entries `ml/trigger/raw/`, `__pycache__/`, and `.venv/` are already present as exact full-line matches, THE Trigger_Model SHALL make no change to the `.gitignore` file.
5. THE Trigger_Model SHALL limit all file creation and modification to paths under `ml/trigger/`, paths under `data/trigger/`, and the repository-root `.gitignore` file, and SHALL make no change to any path outside this set.
6. IF a required output target cannot be written, THEN THE Trigger_Model SHALL abort, preserve the existing state of that target, and report an error identifying the target.

### Requirement 2: Python dependency declaration

**User Story:** As a developer, I want the required Python packages declared in one place, so that I can reproduce the analysis environment.

#### Acceptance Criteria

1. THE Trigger_Model SHALL provide the file `ml/trigger/requirements.txt` listing the dependencies `numpy`, `pandas`, `scipy`, and `matplotlib`.
2. THE Trigger_Model SHALL pin each dependency in `ml/trigger/requirements.txt` to an exact version using the `package==version` form.
3. IF a declared dependency cannot be resolved during installation, THEN installation SHALL terminate without success and identify the unresolved dependency.

### Requirement 3: Dataset loading and extraction

**User Story:** As a developer, I want the tracked-modes data loaded and the relevant fields extracted, so that the analysis uses frequency, temperature, and timestamps correctly.

#### Acceptance Criteria

1. WHEN the Tracked_Modes_Dataset file exists at `ml/trigger/raw/trackedmodes.mat`, THE Analysis_Script SHALL load it using `scipy.io.loadmat(path, squeeze_me=True, struct_as_record=False)["modes"]`.
2. THE Analysis_Script SHALL convert the MATLAB datenum field `modes.sdn` to timestamps using `pd.to_datetime(sdn - 719529, unit="D")`.
3. THE Analysis_Script SHALL extract Mode_6_Frequency from `modes.f[:, 5]` as the natural frequency in Hz.
4. THE Analysis_Script SHALL extract Steel_Temperature from `modes.env[:, 0]` as the temperature in degrees Celsius.
5. WHEN a reading has a null or NaN value for timestamp, Mode_6_Frequency, or Steel_Temperature, THE Analysis_Script SHALL drop that reading before analysis and retain all other readings.
6. IF the dataset file is missing or does not contain a `modes` struct, THEN THE Analysis_Script SHALL abort and report an error identifying the problem.
7. IF no readings remain after dropping readings with missing values, THEN THE Analysis_Script SHALL abort and report an error indicating there is no usable data.

### Requirement 4: Period segmentation

**User Story:** As an analyst, I want readings segmented into healthy, retrofit, and after periods, so that the baseline is fit on known-healthy data and later periods are evaluated separately.

#### Acceptance Criteria

1. THE Analysis_Script SHALL assign each reading whose timestamp is strictly before 2019-05-15 00:00:00 to the Healthy_Period.
2. THE Analysis_Script SHALL assign each reading whose timestamp is at or after 2019-05-15 00:00:00 and at or before 2019-09-27 23:59:59 to the Retrofit_Period.
3. THE Analysis_Script SHALL assign each reading whose timestamp is strictly after 2019-09-27 23:59:59 to the After_Period.
4. THE Analysis_Script SHALL assign every retained reading to exactly one of Healthy_Period, Retrofit_Period, or After_Period, such that the three periods are mutually exclusive and jointly cover all retained readings.

### Requirement 5: Temperature-compensation model

**User Story:** As an analyst, I want a linear model of frequency on temperature fit from the healthy period, so that expected frequency can be predicted for any temperature.

#### Acceptance Criteria

1. THE Analysis_Script SHALL fit the Compensation_Model as a linear regression of Mode_6_Frequency on Steel_Temperature using Healthy_Period readings only.
2. IF the Healthy_Period contains fewer than 2 readings, THEN THE Analysis_Script SHALL stop before fitting the Compensation_Model and report an error indicating that the healthy period has insufficient readings to fit the model.
3. THE Analysis_Script SHALL compute a predicted frequency for each reading from the Compensation_Model using that reading's Steel_Temperature.
4. THE Analysis_Script SHALL compute Residual_Pct for each reading as `(actual - predicted) / predicted * 100`.
5. IF a reading's predicted frequency equals 0, THEN THE Analysis_Script SHALL mark that reading's Residual_Pct as undefined rather than computing the ratio.

### Requirement 6: Corrected-model alert levels

**User Story:** As an operator, I want alert levels assigned from the absolute temperature-corrected residual, so that genuine structural change is flagged while temperature-driven variation is not.

#### Acceptance Criteria

1. THE Analysis_Script SHALL define the corrected-model alert thresholds as named constants at the top of the file, with values 0.75, 1.5, and 2.0.
2. WHEN the absolute value of Residual_Pct is below 0.75, THE Analysis_Script SHALL assign the Alert_Level `normal`.
3. WHEN the absolute value of Residual_Pct is greater than or equal to 0.75 and less than 1.5, THE Analysis_Script SHALL assign the Alert_Level `watch`.
4. WHEN the absolute value of Residual_Pct is greater than or equal to 1.5 and less than 2.0, THE Analysis_Script SHALL assign the Alert_Level `warning`.
5. WHEN the absolute value of Residual_Pct is greater than or equal to 2.0, THE Analysis_Script SHALL assign the Alert_Level `alarm`.
6. IF a reading's Residual_Pct is undefined, THEN THE Analysis_Script SHALL exclude that reading from Alert_Level assignment rather than assigning it any Alert_Level.

### Requirement 7: Naive baseline alerting

**User Story:** As an analyst, I want a naive baseline that ignores temperature, so that I can quantify how much temperature compensation reduces false alarms.

#### Acceptance Criteria

1. THE Analysis_Script SHALL compute the Naive_Baseline metric for each reading as `(Mode_6_Frequency - healthy_mean) / healthy_mean * 100`, where `healthy_mean` is the mean Mode_6_Frequency over Healthy_Period readings.
2. IF the Healthy_Period contains 0 readings or the Healthy_Period mean frequency equals 0, THEN THE Analysis_Script SHALL stop before computing the Naive_Baseline metric and report an error indicating that the healthy period mean frequency is unavailable.
3. THE Analysis_Script SHALL assign Alert_Level to each Naive_Baseline value using the absolute value of Naive_Baseline against the same thresholds defined in Requirement 6 (below 0.75 `normal`, 0.75 to below 1.5 `watch`, 1.5 to below 2.0 `warning`, 2.0 and above `alarm`).

### Requirement 8: Comparison metrics

**User Story:** As an analyst, I want false-alarm and detection counts, so that I can report the measured benefit of the corrected model.

#### Acceptance Criteria

1. THE Analysis_Script SHALL count, as a non-negative integer, the Healthy_Period readings assigned an Alert_Level above `normal` under the Naive_Baseline.
2. THE Analysis_Script SHALL count, as a non-negative integer, the Healthy_Period readings assigned an Alert_Level above `normal` under the Compensation_Model.
3. THE Analysis_Script SHALL count, as a non-negative integer, the After_Period readings assigned an Alert_Level above `normal` by the Compensation_Model.
4. IF a counted period contains 0 readings, THEN THE Analysis_Script SHALL report the corresponding count as 0.

### Requirement 9: Comparison plot

**User Story:** As a reviewer, I want a time-series plot comparing naive deviation and corrected residual, so that I can visually see the difference the compensation makes.

#### Acceptance Criteria

1. WHEN the analysis run completes, THE Analysis_Script SHALL generate the plot file `ml/trigger/plots/naive_vs_corrected.png`.
2. THE Analysis_Script SHALL render the plot as two stacked panels over time, the upper panel showing Naive_Baseline deviation and the lower panel showing corrected Residual_Pct.
3. THE Analysis_Script SHALL draw the alert threshold lines at the positive and negative values 0.75, 1.5, and 2.0 on each panel.
4. THE Analysis_Script SHALL shade the Retrofit_Period region (2019-05-15 through 2019-09-27) in gray on the plot.
5. IF the plot file cannot be written, THEN THE Analysis_Script SHALL abort and report an error identifying the plot file.

### Requirement 10: Frequency-versus-temperature plot

**User Story:** As a reviewer, I want a scatter of frequency against temperature with the fitted line, so that I can confirm the healthy-period relationship the model learned.

#### Acceptance Criteria

1. WHEN the analysis run completes, THE Analysis_Script SHALL generate the plot file `ml/trigger/plots/freq_vs_temp.png`.
2. THE Analysis_Script SHALL plot Mode_6_Frequency on the vertical axis against Steel_Temperature on the horizontal axis for Healthy_Period readings as a scatter.
3. THE Analysis_Script SHALL overlay the fitted Compensation_Model line across the Healthy_Period temperature range using the fitted slope and intercept.
4. IF the plot file cannot be written, THEN THE Analysis_Script SHALL abort and report an error identifying the plot file.

### Requirement 11: Measured results report

**User Story:** As a reviewer, I want a report of measured model statistics and counts, so that I can evaluate the results without rerunning the analysis.

#### Acceptance Criteria

1. WHEN the analysis run completes, THE Analysis_Script SHALL generate the report file `ml/trigger/results.md`.
2. THE Results_Report SHALL state the Compensation_Model slope, intercept, and R-squared, each rounded to 3 decimal places.
3. THE Results_Report SHALL state, as non-negative integers, the Healthy_Period false-alarm counts for both the Naive_Baseline and the Compensation_Model.
4. THE Results_Report SHALL state, as a non-negative integer, the After_Period detection count for the Compensation_Model.
5. THE Results_Report SHALL contain only values computed from the current analysis run and SHALL exclude any hardcoded, templated, or default stand-in value not derived from the loaded dataset.

### Requirement 12: Full replay output

**User Story:** As a dashboard developer, I want a full replay JSON of every reading in contract format, so that the dashboard can replay the monitoring timeline.

#### Acceptance Criteria

1. WHEN the analysis run completes, THE Analysis_Script SHALL generate the Replay_File at `data/trigger/replay_kw51.json` as a JSON array with one object per analyzed reading, ordered by ascending timestamp.
2. IF no analyzed readings exist, THEN THE Analysis_Script SHALL write the Replay_File as an empty JSON array.
3. THE Analysis_Script SHALL emit each Replay_File object with exactly the nine fields `node_id`, `timestamp`, `temperature_c`, `frequency_hz`, `predicted_frequency_hz`, `residual_pct`, `alert_level`, `quality`, and `source`, and no additional fields.
4. THE Analysis_Script SHALL set `node_id` to `"node-1"`, `quality` to `"ok"`, and `source` to `"KW51 replay"` in every Replay_File object.
5. THE Analysis_Script SHALL format `timestamp` as an ISO 8601 UTC string with a trailing `Z` (for example `2019-01-17T10:00:00Z`) in every Replay_File object.
6. THE Analysis_Script SHALL set `alert_level` to exactly one of the strings `normal`, `watch`, `warning`, or `alarm` in every Replay_File object.
7. THE Analysis_Script SHALL round the numeric fields `temperature_c`, `frequency_hz`, `predicted_frequency_hz`, and `residual_pct` to a maximum of 3 decimal places in every Replay_File object, where `residual_pct` is the signed percentage difference.

### Requirement 13: Demo replay output

**User Story:** As a presenter, I want a short demo replay window that crosses from normal into alarm, so that a demo video shows an alarm being raised.

#### Acceptance Criteria

1. WHEN the analysis run completes, THE Analysis_Script SHALL generate the Demo_Replay_File at `data/trigger/replay_kw51_demo.json` using the same field schema and formatting rules as the Replay_File (Requirement 12).
2. THE Analysis_Script SHALL select for the Demo_Replay_File a continuous window of consecutive readings in ascending timestamp order, with no reading within the window's time span omitted, spanning at least 1 day and at most 7 days.
3. THE Analysis_Script SHALL select the Demo_Replay_File window such that its readings transition from an earlier Alert_Level `normal` to a later Alert_Level `alarm`, with the window ending at the first `alarm` reading.
4. IF no window satisfying criteria 2 and 3 exists, THEN THE Analysis_Script SHALL report an error indicating that no qualifying demo window was found.

### Requirement 14: Single runnable script

**User Story:** As a developer, I want one main script that produces all outputs, so that the analysis is simple to run and explain.

#### Acceptance Criteria

1. THE Trigger_Model SHALL provide `ml/trigger/trigger_model.py` as the single main entry point that produces the plots, Results_Report, Replay_File, and Demo_Replay_File.
2. WHEN invoked as `python ml/trigger/trigger_model.py` and all outputs are written successfully, THE Analysis_Script SHALL write the two plots, the Results_Report, the Replay_File, and the Demo_Replay_File, and exit with status 0.
3. IF the analysis cannot complete, THEN THE Analysis_Script SHALL exit with a non-zero status and report the failure.

### Requirement 15: Contract threshold and source discrepancy (RESOLVED)

**Resolution:** The team confirmed this feature's alert thresholds (0.75 watch / 1.5 warning / 2.0 alarm) and source label (`"KW51 replay"`). `docs/contract.md` section 2 was updated to match this implementation, so the discrepancy no longer exists.

**User Story:** As the trigger-model owner, I want the shared contract to match this feature's confirmed thresholds and source label, so that the contract and implementation agree.

#### Acceptance Criteria

1. THE Trigger_Model SHALL preserve the replay JSON field schema `node_id`, `timestamp`, `temperature_c`, `frequency_hz`, `predicted_frequency_hz`, `residual_pct`, `alert_level`, `quality`, `source` exactly as defined in Data_Contract section 2.
2. THE Data_Contract section 2 SHALL specify absolute-residual thresholds of 0.75 watch, 1.5 warning, and 2.0 alarm, matching this feature.
3. THE Data_Contract section 2 SHALL specify the source label `"KW51 replay"`, matching this feature.
4. THE Trigger_Model SHALL record, in the Results_Report, that the team confirmed these thresholds and source label and that Data_Contract section 2 was updated to match.
