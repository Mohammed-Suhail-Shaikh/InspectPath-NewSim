import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TriggerRecord } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";

// Demo alert thresholds on absolute residual.
const WATCH = 0.75;
const WARNING = 1.5;
const ALARM = 2.0;

// Band tints. Watch uses a distinctly light yellow so it reads clearly lighter
// than the Warning band (which is a deeper amber tint). Shown behind the data.
const BAND = {
  normal: "var(--normal-band)",
  watch: "#fbf3d6", // light yellow, clearly lighter than warning
  warning: "var(--warning-band)",
  alarm: "var(--alarm-band)",
};

// Watch points: pale-yellow fill with a dark-yellow outline, so they stay
// distinguishable from the solid Warning points.
const WATCH_FILL = "#f5e8b8";
const WATCH_STROKE = "#806500";

// Residual % over recent replay history. Points are colored by each record's
// own alert_level (we never recompute the level here). Shaded bands behind the
// data mark the Watch / Warning / Alarm severity zones on both sides of zero.
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
  const slice = records.slice(start, end);
  const data = slice.map((r, i) => ({
    i: start + i,
    time: new Date(r.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    residual: r.residual_pct,
    level: r.alert_level,
    color: alertStyle(r.alert_level).bg,
  }));

  // Y range: cover the data and at least the alarm band, with a little margin.
  const maxAbs = Math.max(ALARM + 0.5, ...slice.map((r) => Math.abs(r.residual_pct) + 0.3));
  const yMin = -maxAbs;
  const yMax = maxAbs;

  return (
    <section className="chart">
      <h3 className="chart-title">Residual % (difference from expected)</h3>
      <p className="chart-legend muted">
        Bands show severity zones: normal, watch, warning, alarm.
      </p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            {/* Severity bands behind the data (both signs). Innermost first. */}
            <ReferenceArea y1={-WATCH} y2={WATCH} fill={BAND.normal} fillOpacity={1} ifOverflow="extendDomain" />
            <ReferenceArea y1={WATCH} y2={WARNING} fill={BAND.watch} fillOpacity={1} />
            <ReferenceArea y1={-WARNING} y2={-WATCH} fill={BAND.watch} fillOpacity={1} />
            <ReferenceArea y1={WARNING} y2={ALARM} fill={BAND.warning} fillOpacity={1} />
            <ReferenceArea y1={-ALARM} y2={-WARNING} fill={BAND.warning} fillOpacity={1} />
            <ReferenceArea y1={ALARM} y2={yMax} fill={BAND.alarm} fillOpacity={1} />
            <ReferenceArea y1={yMin} y2={-ALARM} fill={BAND.alarm} fillOpacity={1} />

            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="category" dataKey="time" stroke="var(--muted)" fontSize={12} />
            <YAxis
              type="number"
              dataKey="residual"
              domain={[yMin, yMax]}
              stroke="var(--muted)"
              fontSize={12}
              tickFormatter={(v: number) => v.toFixed(1)}
              width={48}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              formatter={(value: number, _name, props) => [
                `${value.toFixed(2)}%  (${props?.payload?.level})`,
                "residual",
              ]}
            />

            <ReferenceLine y={0} stroke="var(--border-strong)" />

            <Scatter data={data} isAnimationActive={false}>
              {data.map((d) =>
                d.level === "watch" ? (
                  <Cell
                    key={d.i}
                    fill={WATCH_FILL}
                    stroke={WATCH_STROKE}
                    strokeWidth={1.5}
                  />
                ) : (
                  <Cell key={d.i} fill={d.color} />
                )
              )}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
