import type { TriggerRecord } from "../../data/types";
import {
  THRESHOLDS,
  countAboveNormal,
  timeAboveNormal,
} from "./monitorMetrics";

// Layer 1, item 3: three plain-language metric cards.
//  - drift from expected (current |residual|), with the alarm threshold for scale
//  - time above normal (readings above normal x typical interval)
//  - sensor health (from the quality flag; "degraded" shown honestly)
export default function SummaryMetrics({
  current,
  history,
}: {
  current: TriggerRecord;
  history: TriggerRecord[];
}) {
  const drift = Math.abs(current.residual_pct);
  const dir = current.residual_pct > 0 ? "faster" : "slower";

  const aboveCount = countAboveNormal(history);
  // "Time above normal" from the ACTUAL timestamps: the span of the current
  // above-normal stretch (first reading of the stretch to the latest reading).
  const stretch = timeAboveNormal(history);
  const timeAbove = stretch ? `${stretch.hours.toFixed(0)} h` : "0";
  const stretchReadings = stretch ? stretch.readings : 0;

  const degraded = current.quality === "degraded";

  return (
    <div className="summary-metrics">
      <div className="metric-card">
        <span className="metric-label">Drift from expected</span>
        <span className="metric-value">
          {drift.toFixed(2)}%{" "}
          <span className="metric-sub muted">{dir} than expected</span>
        </span>
        <span className="metric-foot muted">
          Alarm at {THRESHOLDS.alarm}% drift
        </span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Time above normal</span>
        <span className="metric-value">{timeAbove}</span>
        <span className="metric-foot muted">
          {stretch
            ? `current stretch: ${stretchReadings} readings`
            : `${aboveCount} of ${history.length} readings above normal so far`}
        </span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Sensor health</span>
        <span className="metric-value">
          {degraded ? "Degraded" : "OK"}
        </span>
        <span className="metric-foot muted">
          {degraded
            ? "This reading is from a degraded sensor node, not a bridge problem."
            : "Sensor node reporting normally."}
        </span>
      </div>
    </div>
  );
}
