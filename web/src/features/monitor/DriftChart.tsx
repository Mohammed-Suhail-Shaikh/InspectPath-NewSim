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
import { THRESHOLDS, fmtUtcHm } from "./monitorMetrics";

const WATCH_FILL = "#f5e8b8";
const WATCH_STROKE = "#806500";
const BAND = {
  normal: "var(--normal-band)",
  watch: "#fbf3d6",
  warning: "var(--warning-band)",
  alarm: "var(--alarm-band)",
};

// Layer 1, item 4: a plain-language drift chart. Same residual data and the same
// time window as the engineering residual chart (both use `window`), with the
// severity bands LABELED (Normal / Watch / Warning / Alarm), the faster/slower
// sides labeled, the current reading marked, and a one-sentence explanation of
// natural frequency. Point colors come from each record's own alert_level.
export default function DriftChart({
  records,
  upToIndex,
  window,
}: {
  records: TriggerRecord[];
  upToIndex: number;
  window: number;
}) {
  const end = Math.min(upToIndex + 1, records.length);
  const start = Math.max(0, end - window);
  const slice = records.slice(start, end);
  const data = slice.map((r, i) => ({
    i: start + i,
    time: fmtUtcHm(r.timestamp),
    residual: r.residual_pct,
    level: r.alert_level,
    color: alertStyle(r.alert_level).bg,
  }));

  // Symmetric domain rounded UP to a whole percent so ticks are clean integers
  // including 0 (e.g. -3,-2,-1,0,1,2,3).
  const dataMax = Math.max(
    THRESHOLDS.alarm,
    ...slice.map((r) => Math.abs(r.residual_pct))
  );
  const bound = Math.ceil(dataMax + 0.5);
  const yMin = -bound;
  const yMax = bound;
  const ticks: number[] = [];
  for (let t = -bound; t <= bound; t++) ticks.push(t);
  const currentResidual = slice.length
    ? slice[slice.length - 1].residual_pct
    : 0;

  return (
    <section className="chart">
      <h3 className="chart-title">Drift from expected vibration</h3>
      <p className="chart-legend muted">
        Natural frequency is how fast the bridge vibrates on its own; it shifts
        when the structure changes. This shows how far each reading is from what
        the temperature predicts. Bands: normal, watch, warning, alarm. Times are
        UTC.
      </p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 8, right: 70, bottom: 4, left: -8 }}>
            <ReferenceArea y1={-THRESHOLDS.watch} y2={THRESHOLDS.watch} fill={BAND.normal} fillOpacity={1} ifOverflow="extendDomain" />
            <ReferenceArea y1={THRESHOLDS.watch} y2={THRESHOLDS.warning} fill={BAND.watch} fillOpacity={1} />
            <ReferenceArea y1={-THRESHOLDS.warning} y2={-THRESHOLDS.watch} fill={BAND.watch} fillOpacity={1} />
            <ReferenceArea y1={THRESHOLDS.warning} y2={THRESHOLDS.alarm} fill={BAND.warning} fillOpacity={1} />
            <ReferenceArea y1={-THRESHOLDS.alarm} y2={-THRESHOLDS.warning} fill={BAND.warning} fillOpacity={1} />
            <ReferenceArea y1={THRESHOLDS.alarm} y2={yMax} fill={BAND.alarm} fillOpacity={1} />
            <ReferenceArea y1={yMin} y2={-THRESHOLDS.alarm} fill={BAND.alarm} fillOpacity={1} />

            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="category" dataKey="time" stroke="var(--muted)" fontSize={12} />
            <YAxis
              type="number"
              dataKey="residual"
              domain={[yMin, yMax]}
              ticks={ticks}
              interval={0}
              stroke="var(--muted)"
              fontSize={12}
              tickFormatter={(v: number) => `${v}%`}
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
              formatter={(value: number, _n, props) => [
                `${value.toFixed(2)}% (${props?.payload?.level})`,
                "drift",
              ]}
            />

            {/* faster/slower labels on the upper and lower halves, next to the
                y-axis (insideTopLeft / insideBottomLeft), not in the corners */}
            <ReferenceLine y={bound - 0.5} stroke="none"
              label={{ value: "↑ faster than expected", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />
            <ReferenceLine y={-(bound - 0.5)} stroke="none"
              label={{ value: "↓ slower than expected", position: "insideBottomLeft", fill: "var(--muted)", fontSize: 11 }} />

            {/* threshold + expected lines, labeled on the right edge */}
            <ReferenceLine y={THRESHOLDS.watch} stroke="var(--border-strong)" strokeDasharray="4 3"
              label={{ value: "Watch", position: "right", fill: "var(--muted)", fontSize: 11 }} />
            <ReferenceLine y={THRESHOLDS.warning} stroke="var(--border-strong)" strokeDasharray="4 3"
              label={{ value: "Warning", position: "right", fill: "var(--muted)", fontSize: 11 }} />
            <ReferenceLine y={THRESHOLDS.alarm} stroke="var(--border-strong)" strokeDasharray="4 3"
              label={{ value: "Alarm", position: "right", fill: "var(--muted)", fontSize: 11 }} />
            <ReferenceLine y={0} stroke="var(--border-strong)"
              label={{ value: "expected", position: "right", fill: "var(--muted)", fontSize: 11 }} />

            {/* current reading marker, labeled on the right so it clears the y-axis */}
            <ReferenceLine
              y={currentResidual}
              stroke="var(--route-flown)"
              strokeWidth={1.5}
              label={{ value: "now", position: "right", fill: "var(--route-flown)", fontSize: 11 }}
            />

            <Scatter data={data} isAnimationActive={false}>
              {data.map((d) =>
                d.level === "watch" ? (
                  <Cell key={d.i} fill={WATCH_FILL} stroke={WATCH_STROKE} strokeWidth={1.5} />
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
