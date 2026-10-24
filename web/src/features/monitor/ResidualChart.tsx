import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TriggerRecord } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";

// Demo alert thresholds on absolute residual (dashed guide lines only).
const THRESHOLDS = [0.75, 1.5, 2.0];

// Residual % over recent replay history. Points are colored by each record's
// own alert_level (we never recompute the level here). Dashed reference lines
// mark the +/- thresholds for context.
export default function ResidualChart({
  records,
  upToIndex,
  window = 24,
}: {
  records: TriggerRecord[];
  upToIndex: number;
  window?: number;
}) {
  const end = Math.min(upToIndex + 1, records.length);
  const start = Math.max(0, end - window);
  const data = records.slice(start, end).map((r, i) => ({
    i: start + i,
    time: new Date(r.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    residual: r.residual_pct,
    level: r.alert_level,
    color: alertStyle(r.alert_level).bg,
  }));

  return (
    <section className="chart">
      <h3 className="chart-title">Residual % (difference from expected)</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="#2a323d" strokeDasharray="3 3" />
            <XAxis
              type="category"
              dataKey="time"
              stroke="#9aa4b2"
              fontSize={12}
            />
            <YAxis
              type="number"
              dataKey="residual"
              stroke="#9aa4b2"
              fontSize={12}
              tickFormatter={(v: number) => v.toFixed(1)}
              width={48}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                background: "#1a2029",
                border: "1px solid #2a323d",
                color: "#e6e9ef",
              }}
              formatter={(value: number, _name, props) => [
                `${value.toFixed(2)}%  (${props?.payload?.level})`,
                "residual",
              ]}
            />

            {/* Dashed threshold guide lines at +/- each threshold. */}
            {THRESHOLDS.map((t) => (
              <ReferenceLine
                key={`p${t}`}
                y={t}
                stroke="#5a6472"
                strokeDasharray="5 4"
              />
            ))}
            {THRESHOLDS.map((t) => (
              <ReferenceLine
                key={`n${t}`}
                y={-t}
                stroke="#5a6472"
                strokeDasharray="5 4"
              />
            ))}
            <ReferenceLine y={0} stroke="#3a424d" />

            <Scatter data={data} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.i} fill={d.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
