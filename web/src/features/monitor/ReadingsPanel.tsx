import type { TriggerRecord } from "../../data/types";
import AlertBadge from "./AlertBadge";
import QualityBadge from "./QualityBadge";

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

// Measured frequency vs predicted, residual %, temperature, with plain labels + units.
export default function ReadingsPanel({ record }: { record: TriggerRecord }) {
  return (
    <section className="readings">
      <div className="readings-header">
        <div className="readings-title">
          <span className="muted">Current reading</span>
          <time dateTime={record.timestamp}>
            {new Date(record.timestamp).toLocaleString()}
          </time>
        </div>
        <div className="readings-badges">
          <AlertBadge level={record.alert_level} />
          <QualityBadge quality={record.quality} />
        </div>
      </div>

      <div className="readings-grid">
        <div className="reading">
          <span className="reading-label">Measured frequency</span>
          <span className="reading-value">{fmt(record.frequency_hz)} Hz</span>
        </div>
        <div className="reading">
          <span className="reading-label">Predicted frequency</span>
          <span className="reading-value">
            {fmt(record.predicted_frequency_hz)} Hz
          </span>
        </div>
        <div className="reading">
          <span className="reading-label">Difference from expected</span>
          <span className="reading-value">{fmt(record.residual_pct, 1)}%</span>
        </div>
        <div className="reading">
          <span className="reading-label">Temperature</span>
          <span className="reading-value">{fmt(record.temperature_c, 1)} °C</span>
        </div>
      </div>
    </section>
  );
}
