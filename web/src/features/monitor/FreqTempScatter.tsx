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
import {
  recoverTempModel,
  shareAbovePredicted,
  downsample,
} from "./monitorMetrics";

// Cap on plotted scatter points. The relationship is fully represented by an
// evenly-spaced sample; drawing every point of the ~10k full replay blanks the
// page. The model line, y-domain, and the share stat still use every reading.
const MAX_POINTS = 400;

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

  // Downsample the plotted points so the scatter never renders thousands of
  // SVG nodes (the crash on the full dataset). The stats below use all readings.
  const plotted = downsample(slice, MAX_POINTS);
  const pts = plotted.map((r) => ({
    temp: r.temperature_c,
    measured: r.frequency_hz,
  }));
  const isDownsampled = plotted.length < slice.length;

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

  // Y-domain must include BOTH the measured points and the full model line, so
  // the line never runs off the chart. Add a small margin and round to 3 dp.
  const yVals = [
    ...slice.map((r) => r.frequency_hz),
    ...line.map((p) => p.predicted),
  ];
  let yDomain: [number, number] | ["auto", "auto"] = ["auto", "auto"];
  if (yVals.length > 0) {
    const lo = Math.min(...yVals);
    const hi = Math.max(...yVals);
    const pad = Math.max((hi - lo) * 0.1, 0.002);
    yDomain = [
      Number((lo - pad).toFixed(3)),
      Number((hi + pad).toFixed(3)),
    ];
  }

  // Item 6: share of readings ABOVE the model line, computed from the data.
  const share = shareAbovePredicted(slice);
  const pct = Math.round(share.fraction * 100);
  const allOrMost =
    share.fraction === 1
      ? "All"
      : share.fraction >= 0.5
      ? "Most"
      : "Some";

  return (
    <section className="chart">
      <h3 className="chart-title">Measured frequency vs temperature (zoomed in)</h3>
      <p className="chart-legend muted">
        {isDownsampled
          ? `Readings from across this replay (an even sample of ${pts.length} of ${slice.length}) are plotted; `
          : "Every reading in this replay (not just the recent window) is plotted; "}
        the dashed line is the temperature model's prediction. The y-axis does not
        start at 0, so the scatter is exaggerated.
      </p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: -4 }}>
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
              label={{ value: "Temperature (°C)", position: "insideBottom", offset: -16, fill: "var(--muted)", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="measured"
              stroke="var(--muted)"
              fontSize={12}
              domain={yDomain}
              tickFormatter={(v: number) => v.toFixed(3)}
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            {/* legend at the top so it never overlaps the bottom axis label */}
            <Legend verticalAlign="top" height={28} />
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
      <p className="chart-legend muted">
        {allOrMost} readings in this replay ({share.above} of {share.total}, {pct}%)
        sit above the healthy-period model line. The model was fit on pre-retrofit
        data, so readings sitting above it is consistent with the retrofit
        stiffening the bridge.
      </p>
    </section>
  );
}
