import type { AlertLevel, TriggerRecord } from "../../data/types";

// Pure, testable helpers for the monitor view. Every value is derived from the
// replay records (or clearly cited from the repo); nothing is invented. Where a
// value cannot be derived from the available data, the UI says so rather than
// guessing.

// Demo alert thresholds on the ABSOLUTE residual %, tuned to KW51. These match
// ml/trigger/trigger_model.py (WATCH/WARNING/ALARM) and docs/contract.md §2.
export const THRESHOLDS = { watch: 0.75, warning: 1.5, alarm: 2.0 } as const;

const RANK: Record<AlertLevel, number> = {
  normal: 0,
  watch: 1,
  warning: 2,
  alarm: 3,
};

// The tracked vibration mode, documented in ml/trigger/trigger_model.py
// (FREQUENCY_COL = 5, commented "mode-6 natural frequency"). The repo names the
// mode only as "mode 6"; it does NOT state the mode shape, so we do not invent
// one. If this ever becomes undocumented, set MODE_TRACKED = null and the UI
// prints "mode not documented".
export const MODE_TRACKED: string | null = "Mode 6 (mode shape not documented in the repo)";

// First timestamp at which each level was reached within the given slice, in
// replay order. Returns only levels that occurred.
export function levelEntryTimes(
  records: TriggerRecord[]
): Partial<Record<AlertLevel, string>> {
  const seen: Partial<Record<AlertLevel, string>> = {};
  for (const r of records) {
    if (!(r.alert_level in seen)) seen[r.alert_level] = r.timestamp;
  }
  return seen;
}

// Timestamp at which the CURRENT run of the latest level began: walk back from
// the last record while the level stays the same. "Since <this time>".
export function currentLevelSince(records: TriggerRecord[]): string | null {
  if (records.length === 0) return null;
  const level = records[records.length - 1].alert_level;
  let since = records[records.length - 1].timestamp;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].alert_level !== level) break;
    since = records[i].timestamp;
  }
  return since;
}

// Count of readings whose level is above "normal" (watch/warning/alarm).
export function countAboveNormal(records: TriggerRecord[]): number {
  return records.filter((r) => RANK[r.alert_level] > 0).length;
}

// Consecutive readings at the END of the slice whose |residual| is at or above
// each threshold (persistence). Uses the residual magnitude, matching the
// trigger's absolute-residual rule.
export function consecutiveAboveThresholds(
  records: TriggerRecord[]
): { watch: number; warning: number; alarm: number } {
  const out = { watch: 0, warning: 0, alarm: 0 };
  for (const key of ["watch", "warning", "alarm"] as const) {
    let n = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (Math.abs(records[i].residual_pct) >= THRESHOLDS[key]) n++;
      else break;
    }
    out[key] = n;
  }
  return out;
}

// Sampling interval between consecutive readings, in minutes. The KW51 replay is
// not perfectly regular (mostly 1 h, sometimes 2 h), so report the MEDIAN step
// and whether it varies, instead of claiming one fixed value.
export function samplingInterval(records: TriggerRecord[]): {
  medianMinutes: number | null;
  varies: boolean;
} {
  if (records.length < 2) return { medianMinutes: null, varies: false };
  const steps: number[] = [];
  for (let i = 1; i < records.length; i++) {
    const dt =
      (new Date(records[i].timestamp).getTime() -
        new Date(records[i - 1].timestamp).getTime()) /
      60000;
    if (Number.isFinite(dt) && dt > 0) steps.push(dt);
  }
  if (steps.length === 0) return { medianMinutes: null, varies: false };
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const varies = sorted[0] !== sorted[sorted.length - 1];
  return { medianMinutes: median, varies };
}

// Recover the temperature model from the data: predicted_frequency_hz is a
// linear function of temperature_c (predicted = slope*temp + intercept), so an
// ordinary least-squares fit over the records recovers the slope and intercept
// the trigger used. Returns null if the temperature range is degenerate.
export function recoverTempModel(
  records: TriggerRecord[]
): { slope: number; intercept: number } | null {
  const n = records.length;
  if (n < 2) return null;
  const xs = records.map((r) => r.temperature_c);
  const ys = records.map((r) => r.predicted_frequency_hz);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

// Format an ISO timestamp in UTC (the data is UTC; KW51 is in Belgium but the
// dataset records UTC). Always labeled "UTC" so the reader is never shown
// browser-local time. Example: "2019-06-27 10:00 UTC".
export function fmtUtc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
  );
}

// UTC hour:minute only, for dense chart axes. Example: "10:00".
export function fmtUtcHm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Duration of the current above-normal stretch, measured from the first reading
// of the stretch that includes the last reading to the last reading itself,
// using the ACTUAL timestamps (not reading count x interval). Returns null when
// the latest reading is normal (no current stretch).
export function timeAboveNormal(
  records: TriggerRecord[]
): { hours: number; readings: number } | null {
  if (records.length === 0) return null;
  const last = records[records.length - 1];
  if (RANK[last.alert_level] === 0) return null; // normal now -> no stretch
  // Walk back while the reading stays above normal.
  let startIdx = records.length - 1;
  for (let i = records.length - 1; i >= 0; i--) {
    if (RANK[records[i].alert_level] > 0) startIdx = i;
    else break;
  }
  const hours =
    (new Date(last.timestamp).getTime() -
      new Date(records[startIdx].timestamp).getTime()) /
    3600000;
  return { hours, readings: records.length - startIdx };
}

// Evenly downsample an array to at most `max` items, always keeping the first
// and last. Used so the frequency-vs-temperature scatter can represent every
// reading's relationship without rendering thousands of SVG points (the full
// KW51 replay is ~10k readings, which blanks the page if drawn point-for-point).
export function downsample<T>(items: T[], max: number): T[] {
  if (max <= 0 || items.length <= max) return items.slice();
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(items[Math.round(i * step)]);
  }
  return out;
}

// Share of readings whose measured frequency is ABOVE the model's predicted
// frequency (i.e. positive residual). Returns the fraction 0..1 and the counts,
// computed from the data so the UI can state the actual share instead of
// assuming "all".
export function shareAbovePredicted(
  records: TriggerRecord[]
): { fraction: number; above: number; total: number } {
  const total = records.length;
  const above = records.filter(
    (r) => r.frequency_hz > r.predicted_frequency_hz
  ).length;
  return { fraction: total ? above / total : 0, above, total };
}

// Population standard deviation of the residual % over the "normal" readings in
// the slice — a plain-language stand-in for the healthy-period scatter, computed
// from the replay the dashboard is showing. Returns null if there are none.
export function normalResidualStd(records: TriggerRecord[]): number | null {
  const res = records
    .filter((r) => r.alert_level === "normal")
    .map((r) => r.residual_pct);
  if (res.length === 0) return null;
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  const variance =
    res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length;
  return Math.sqrt(variance);
}
