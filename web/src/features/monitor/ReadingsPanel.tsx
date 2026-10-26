import type { TriggerRecord } from "../../data/types";

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

// Measured frequency vs predicted, difference from expected, and temperature,
// with plain-language labels and units. The alert level and the "node
// degraded" badge live in the hero above, not here.
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
        <div className="reading reading-emphasis">
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
