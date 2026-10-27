import {
  Scatter,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TriggerRecord } from "../../data/types";
import { recoverTempModel } from "./monitorMetrics";

// Layer 2, item 11b: measured frequency vs temperature, with the model's
// prediction line. The line comes from recoverTempModel (fit of the served
// predicted_frequency_hz vs temperature_c), so it is derived from the data.
export default function FreqTempScatter({
  records,
  upToIndex,
}: {
  records: TriggerRecord[];
  upToIndex: number;
}) {
  const end = Math.min(upToIndex + 1, records.length);
  const slice = records.slice(0, end);
  const model = recoverTempModel(slice);

  const pts = slice.map((r) => ({
    temp: r.temperature_c,
    measured: r.frequency_hz,
  }));

  // Prediction line across the observed temperature range.
  const temps = slice.map((r) => r.temperature_c);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const line = model
    ? [
        { temp: tMin, predicted: model.slope * tMin + model.intercept },
        { temp: tMax, predicted: model.slope * tMax + model.intercept },
      ]
    : [];

  return (
    <section className="chart">
      <h3 className="chart-title">Measured frequency vs temperature (zoomed in)</h3>
      <p className="chart-legend muted">
        Each point is one reading; the line is the temperature model's prediction.
        The y-axis does not start at 0, so the scatter is exaggerated.
      </p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="temp"
              name="temperature"
              unit="°C"
              stroke="var(--muted)"
              fontSize={12}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(0)}
              label={{ value: "Temperature (°C)", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="measured"
              stroke="var(--muted)"
              fontSize={12}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(2)}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <Legend />
            <Scatter
              name="Measured (Hz)"
              data={pts}
              fill="var(--text)"
              isAnimationActive={false}
            />
            {line.length > 0 && (
              <Line
                name="Model prediction (Hz)"
                data={line}
                dataKey="predicted"
                stroke="var(--muted)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
