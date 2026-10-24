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

// Plots recent measured vs predicted frequency over the replay history.
export default function FrequencyChart({
  records,
  upToIndex,
  window = 12,
}: {
  records: TriggerRecord[];
  upToIndex: number;
  window?: number;
}) {
  const end = Math.min(upToIndex + 1, records.length);
  const start = Math.max(0, end - window);
  const data = records.slice(start, end).map((r) => ({
    time: new Date(r.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    measured: r.frequency_hz,
    predicted: r.predicted_frequency_hz,
  }));

  return (
    <section className="chart">
      <h3 className="chart-title">Frequency vs. predicted</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="#2a323d" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="#9aa4b2" fontSize={12} />
            <YAxis
              stroke="#9aa4b2"
              fontSize={12}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(2)}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "#1a2029",
                border: "1px solid #2a323d",
                color: "#e6e9ef",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="measured"
              name="Measured (Hz)"
              stroke="#3ddc84"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Predicted (Hz)"
              stroke="#5aa9ff"
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
