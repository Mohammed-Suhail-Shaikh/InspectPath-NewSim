import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TriggerRecord } from "../../data/types";
import { fmtUtcHm } from "./monitorMetrics";

// Plots recent measured vs predicted frequency over the replay history. The
// window is supplied by the parent so every monitor chart shares one time
// window. `zoomed` adds a "zoomed in" note because the y-axis does not start
// at 0 (the frequency range is narrow, so small shifts look large).
export default function FrequencyChart({
  records,
  upToIndex,
  window = 24,
  zoomed = false,
}: {
  records: TriggerRecord[];
  upToIndex: number;
  window?: number;
  zoomed?: boolean;
}) {
  const end = Math.min(upToIndex + 1, records.length);
  const start = Math.max(0, end - window);
  const data = records.slice(start, end).map((r) => ({
    time: fmtUtcHm(r.timestamp),
    measured: r.frequency_hz,
    predicted: r.predicted_frequency_hz,
  }));

  return (
    <section className="chart">
      <h3 className="chart-title">
        Measured vs predicted frequency{zoomed ? " (zoomed in)" : ""}
      </h3>
      <p className="chart-legend muted">
        {zoomed
          ? "The y-axis does not start at 0, so small differences look large. Times are UTC."
          : "Times are UTC."}
      </p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="var(--muted)" fontSize={12} />
            <YAxis
              stroke="var(--muted)"
              fontSize={12}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(3)}
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
            <Line
              type="monotone"
              dataKey="measured"
              name="Measured (Hz)"
              stroke="var(--text)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Predicted (Hz)"
              stroke="var(--muted)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
