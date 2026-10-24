# Trigger_Model results

All values below are measured from the current analysis run.

## Compensation model

- Slope: -0.001
- Intercept: 2.934
- R-squared: 0.409

## Alert counts

- Healthy-period false alarms (naive baseline): 129
- Healthy-period false alarms (compensation model): 67
- After-period detections (compensation model): 2546

## Open Decisions

The following discrepancies with the shared data contract (`docs/contract.md` section 2) are recorded here as an open decision; the shared contract is left unchanged.

- Alert thresholds: the data contract section 2 specifies absolute-residual thresholds of 2.0 watch / 5.0 warning / 8.0 alarm, while this feature uses 0.75 watch / 1.5 warning / 2.0 alarm.
- Source label: the data contract section 2 shows the example source label "Z24 replay", while this feature uses "KW51 replay".
- These feature values (thresholds 0.75 / 1.5 / 2.0 and source "KW51 replay") are a working assumption pending team confirmation; the shared contract (`docs/contract.md`) is not modified until the team confirms the change.
