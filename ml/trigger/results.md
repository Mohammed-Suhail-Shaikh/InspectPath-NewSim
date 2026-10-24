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

## Contract

The team confirmed this feature's alert thresholds and source label, and `docs/contract.md` section 2 now reflects them:

- Alert thresholds on absolute residual: 0.75 watch / 1.5 warning / 2.0 alarm.
- Source label: "KW51 replay".
