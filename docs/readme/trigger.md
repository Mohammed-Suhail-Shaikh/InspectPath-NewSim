# Structural trigger model

Owner: Komal. Code in `ml/trigger/`, replay data in `data/trigger/`.

## What it does

Decides when the sensor node should raise an alert. A bridge's natural frequency drops when it loses stiffness, but temperature also shifts frequency, often by more than damage does. A naive threshold would raise false alarms with every cold snap. The model learns how frequency depends on temperature during a healthy period, then flags readings that don't fit.

## How it works

1. Fit a linear baseline of mode-6 natural frequency against steel temperature on the healthy period (before May 15, 2019).
2. For each reading, compute the residual: how far the measured frequency is from the predicted one, in percent.
3. Assign alert levels on the absolute residual: 0.75% watch, 1.5% warning, 2.0% alarm.
4. Export the results as replay data the dashboard plays back as if it were live from the node.

Run it with:

    python ml/trigger/trigger_model.py

## Data

KW51 railway bridge in Leuven, Belgium: about 15 months of monitoring before, during, and after a retrofit that strengthened the diagonal connections.

- Maes, K. and Lombaert, G. (2021). "Monitoring railway bridge KW51 before, during, and after retrofitting." Journal of Bridge Engineering, 26(3).
- Dataset: https://zenodo.org/record/3745914

Only the `trackedmodes` file is used. Raw data is not committed; download it from Zenodo and place it at `ml/trigger/raw/trackedmodes.mat`.

## Results (measured)

- Baseline slope about -0.00123 Hz per °C, R² 0.409
- False alarms in the healthy period: 129 with a naive threshold, 67 with temperature correction, about 48% fewer
- After the retrofit, the corrected model flagged 2,546 readings as changed behavior

Full numbers: `ml/trigger/results.md`. Plots: `ml/trigger/plots/`.

## Outputs

- `data/trigger/replay_kw51.json`: full replay, one record per hourly reading
- `data/trigger/replay_kw51_demo.json`: demo window, June 22 to 29, 2019, going normal to watch to warning to alarm
- Format: `docs/contract.md` section 2

## Limitations

- KW51 is a European steel bridge monitored with professional accelerometers. Our ESP32 node's MPU6050 is much noisier, so this demonstrates the method, not calibration for Massachusetts bridges.
- The structural change in KW51 is the bridge getting stiffer after repair, so the model flags change in either direction.
- A linear baseline underfits below freezing, where the bridge stiffens. Most remaining false alarms come from one cold spell.
- Thresholds are tuned to this dataset for the demo, not engineering limits.
- The dashboard replays recorded 2019 data; it is not live.