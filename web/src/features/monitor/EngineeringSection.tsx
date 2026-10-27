import type { TriggerRecord } from "../../data/types";
import FrequencyChart from "./FrequencyChart";
import FreqTempScatter from "./FreqTempScatter";
import {
  THRESHOLDS,
  MODE_TRACKED,
  consecutiveAboveThresholds,
  recoverTempModel,
  normalResidualStd,
  samplingInterval,
  fmtUtc,
} from "./monitorMetrics";

// R-squared of the temperature model. This is the healthy-period fit quality
// from ml/trigger/results.md; it cannot be derived from the demo replay window
// alone, so it is cited from the repo with its source shown on screen.
const MODEL_R_SQUARED_FROM_RESULTS_MD = 0.409;
const REPLAY_FILE = "replay_kw51_demo.json";
const ZENODO_RECORD = "3745914";

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

// Layer 2: full engineering detail, always visible. Items 6-12.
export default function EngineeringSection({
  current,
  history,
  upToIndex,
  window,
}: {
  current: TriggerRecord;
  history: TriggerRecord[];
  upToIndex: number;
  window: number;
}) {
  const model = recoverTempModel(history);
  const resStd = normalResidualStd(history);
  const persistence = consecutiveAboveThresholds(history);
  const { medianMinutes, varies } = samplingInterval(history);
  const intervalText =
    medianMinutes === null
      ? "not available (need two readings)"
      : `${varies ? "about " : ""}${Math.round(medianMinutes)} min between readings${varies ? " (varies)" : ""}`;

  return (
    <div className="engineering-section">
      <h2 className="view-title">Engineering detail</h2>

      {/* Two columns on desktop, one on phones. Left: current reading +
          persistence tables. Right: thresholds, mode, temperature model, source. */}
      <div className="eng-columns">
        <div className="eng-col">
          {/* Item 6: readings table with units */}
          <section className="eng-block">
            <h3 className="chart-title">Current reading</h3>
            <table className="eng-table">
              <tbody>
                <tr><th>Measured frequency</th><td>{fmt(current.frequency_hz, 3)} Hz</td></tr>
                <tr><th>Temperature-predicted frequency</th><td>{fmt(current.predicted_frequency_hz, 3)} Hz</td></tr>
                <tr><th>Residual</th><td>{fmt(current.residual_pct, 2)} %</td></tr>
                <tr><th>Temperature</th><td>{fmt(current.temperature_c, 1)} °C</td></tr>
                <tr><th>Recorded timestamp</th><td>{fmtUtc(current.timestamp)} (recorded, not live)</td></tr>
                <tr><th>Sampling interval</th><td>{intervalText}</td></tr>
                <tr><th>Quality flag</th><td>{current.quality}{current.quality === "degraded" ? " (sensor node, not the bridge)" : ""}</td></tr>
              </tbody>
            </table>
          </section>

          {/* Item 10: persistence */}
          <section className="eng-block">
            <h3 className="chart-title">Persistence (consecutive readings above each threshold)</h3>
            <table className="eng-table">
              <tbody>
                <tr><th>At or above watch ({THRESHOLDS.watch} %)</th><td>{persistence.watch}</td></tr>
                <tr><th>At or above warning ({THRESHOLDS.warning} %)</th><td>{persistence.warning}</td></tr>
                <tr><th>At or above alarm ({THRESHOLDS.alarm} %)</th><td>{persistence.alarm}</td></tr>
              </tbody>
            </table>
          </section>
        </div>

        <div className="eng-col">
          {/* Item 7: thresholds next to the current residual */}
          <section className="eng-block">
            <h3 className="chart-title">Thresholds</h3>
            <p className="eng-text">
              Current |residual| = <strong>{fmt(Math.abs(current.residual_pct), 2)} %</strong>.
              Thresholds on the absolute residual: watch {THRESHOLDS.watch} %,
              warning {THRESHOLDS.warning} %, alarm {THRESHOLDS.alarm} %. These are
              demonstration values tuned to KW51, not engineering limits.
            </p>
          </section>

          {/* Item 8: tracked mode */}
          <section className="eng-block">
            <h3 className="chart-title">Tracked vibration mode</h3>
            <p className="eng-text">
              {MODE_TRACKED
                ? `Tracking ${MODE_TRACKED}. Source: ml/trigger/trigger_model.py (f[:, 5], "mode-6 natural frequency").`
                : "Mode not documented."}
            </p>
          </section>

          {/* Item 9: temperature model */}
          <section className="eng-block">
            <h3 className="chart-title">Temperature model</h3>
            {model ? (
              <p className="eng-text">
                predicted frequency = {fmt(model.slope, 6)} × temperature + {fmt(model.intercept, 4)} (Hz).
                Slope and intercept are recovered by least-squares from the served
                predicted-vs-temperature values. R² = {MODEL_R_SQUARED_FROM_RESULTS_MD}{" "}
                (healthy-period fit, from ml/trigger/results.md; not derivable from
                this demo window).{" "}
                {resStd !== null
                  ? `Residual scatter on the normal readings in this replay: standard deviation ${fmt(resStd, 2)} % (computed from the replay shown).`
                  : "Residual scatter not available (no normal readings in this replay)."}
              </p>
            ) : (
              <p className="eng-text">
                Temperature model not available (temperature range is degenerate).
              </p>
            )}
          </section>

          {/* Item 12: source */}
          <section className="eng-block">
            <h3 className="chart-title">Source</h3>
            <p className="eng-text muted">
              KW51 railway bridge monitoring dataset, Zenodo record {ZENODO_RECORD}.
              Replay file: {REPLAY_FILE}. Timestamps are the dataset's recorded
              times (UTC), not live readings.
            </p>
          </section>
        </div>
      </div>

      {/* Item 11: charts (full width, below the two columns) */}
      <FrequencyChart records={history} upToIndex={upToIndex} window={window} zoomed />
      <FreqTempScatter records={history} upToIndex={upToIndex} />
    </div>
  );
}
