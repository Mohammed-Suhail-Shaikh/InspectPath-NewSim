import { describe, it, expect } from "vitest";
import {
  THRESHOLDS,
  MODE_TRACKED,
  levelEntryTimes,
  currentLevelSince,
  countAboveNormal,
  consecutiveAboveThresholds,
  samplingInterval,
  recoverTempModel,
  normalResidualStd,
  fmtUtc,
  fmtUtcHm,
  timeAboveNormal,
  shareAbovePredicted,
  downsample,
} from "../features/monitor/monitorMetrics";
import replay from "../../../data/trigger/replay_kw51_demo.json";
import full from "../../../data/trigger/replay_kw51.json";
import type { TriggerRecord } from "../data/types";

const recs = replay as unknown as TriggerRecord[];

// Small synthetic series for the edge-case helpers.
function rec(
  ts: string,
  level: TriggerRecord["alert_level"],
  residual: number,
  temp = 20,
  pred = 2.9,
  quality: TriggerRecord["quality"] = "ok"
): TriggerRecord {
  return {
    node_id: "n1",
    timestamp: ts,
    temperature_c: temp,
    frequency_hz: 2.9,
    predicted_frequency_hz: pred,
    residual_pct: residual,
    alert_level: level,
    quality,
    source: "test",
  };
}

describe("thresholds + mode match the repo", () => {
  it("thresholds are the KW51 demo values", () => {
    expect(THRESHOLDS).toEqual({ watch: 0.75, warning: 1.5, alarm: 2.0 });
  });
  it("tracked mode is documented as mode 6 (no invented mode shape)", () => {
    expect(MODE_TRACKED).toMatch(/Mode 6/);
    expect(MODE_TRACKED).not.toMatch(/bending|torsion|vertical/i);
  });
});

describe("level entry + since", () => {
  const series = [
    rec("2019-06-22T23:00:00Z", "normal", 0.6),
    rec("2019-06-23T00:00:00Z", "watch", 0.9),
    rec("2019-06-23T01:00:00Z", "watch", 1.0),
    rec("2019-06-27T10:00:00Z", "warning", 1.6),
  ];
  it("records the first time each level is reached", () => {
    const e = levelEntryTimes(series);
    expect(e.normal).toBe("2019-06-22T23:00:00Z");
    expect(e.watch).toBe("2019-06-23T00:00:00Z");
    expect(e.warning).toBe("2019-06-27T10:00:00Z");
    expect(e.alarm).toBeUndefined();
  });
  it("since = start of the current run of the latest level", () => {
    // ends on 'warning' (one reading) -> since is that reading
    expect(currentLevelSince(series)).toBe("2019-06-27T10:00:00Z");
    // a run of two watches -> since is the first of the run
    expect(currentLevelSince(series.slice(0, 3))).toBe("2019-06-23T00:00:00Z");
  });
});

describe("counts + persistence", () => {
  const series = [
    rec("t0", "normal", 0.2),
    rec("t1", "watch", 0.9),
    rec("t2", "warning", 1.7),
    rec("t3", "alarm", 2.3),
  ];
  it("counts readings above normal", () => {
    expect(countAboveNormal(series)).toBe(3);
  });
  it("counts consecutive readings above each threshold at the tail", () => {
    const p = consecutiveAboveThresholds(series);
    // tail: 2.3 then 1.7 then 0.9 then 0.2
    expect(p.alarm).toBe(1); // only 2.3 >= 2.0
    expect(p.warning).toBe(2); // 2.3, 1.7 >= 1.5
    expect(p.watch).toBe(3); // 2.3, 1.7, 0.9 >= 0.75
  });
});

describe("sampling interval", () => {
  it("reports median step and whether it varies", () => {
    const even = [rec("2019-06-22T23:00:00Z", "normal", 0), rec("2019-06-23T00:00:00Z", "normal", 0)];
    expect(samplingInterval(even)).toEqual({ medianMinutes: 60, varies: false });
    const uneven = [
      rec("2019-06-22T23:00:00Z", "normal", 0),
      rec("2019-06-23T00:00:00Z", "normal", 0),
      rec("2019-06-23T02:00:00Z", "normal", 0),
    ];
    const s = samplingInterval(uneven);
    expect(s.varies).toBe(true);
  });
});

describe("UTC time formatting (fix 3: data is UTC, never browser-local)", () => {
  it("formats an ISO timestamp in UTC with a UTC label", () => {
    // Regardless of the machine's timezone, the UTC fields are fixed.
    expect(fmtUtc("2019-06-27T10:00:00Z")).toBe("2019-06-27 10:00 UTC");
    expect(fmtUtcHm("2019-06-27T10:00:00Z")).toBe("10:00");
  });
});

describe("time above normal from timestamps (fix 4)", () => {
  it("measures the current above-normal stretch from first to latest reading", () => {
    const series = [
      rec("2019-06-27T08:00:00Z", "normal", 0.2),
      rec("2019-06-27T09:00:00Z", "warning", 1.6),
      rec("2019-06-27T10:00:00Z", "warning", 1.7),
      rec("2019-06-27T12:00:00Z", "alarm", 2.3),
    ];
    const t = timeAboveNormal(series);
    expect(t).not.toBeNull();
    // 09:00 -> 12:00 = 3 h, 3 readings in the stretch
    expect(t!.hours).toBeCloseTo(3, 5);
    expect(t!.readings).toBe(3);
  });
  it("returns null when the latest reading is normal", () => {
    const series = [rec("t0", "warning", 1.6), rec("t1", "normal", 0.2)];
    expect(timeAboveNormal(series)).toBeNull();
  });
});

describe("share above the model line (fix 6: computed, not assumed 'all')", () => {
  it("counts readings whose measured frequency exceeds the prediction", () => {
    const series = [
      rec("t0", "normal", 0, 20, 2.9), // measured 2.9 == pred 2.9 -> not above
      rec("t1", "watch", 1, 20, 2.8), // 2.9 > 2.8 -> above
      rec("t2", "watch", 1, 20, 2.85), // 2.9 > 2.85 -> above
    ];
    const s = shareAbovePredicted(series);
    expect(s.total).toBe(3);
    expect(s.above).toBe(2);
    expect(s.fraction).toBeCloseTo(2 / 3, 5);
  });
  it("on the real replay, most readings sit above the prediction (retrofit stiffening)", () => {
    const s = shareAbovePredicted(recs);
    expect(s.total).toBe(recs.length);
    expect(s.fraction).toBeGreaterThan(0.5);
  });
});

describe("downsample (root-cause guard for the blank-page crash)", () => {
  it("caps a large series to at most max points, keeping first and last", () => {
    const big = Array.from({ length: 9857 }, (_, i) => i);
    const out = downsample(big, 400);
    expect(out.length).toBe(400);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(9856);
  });
  it("returns the array unchanged when it is already small enough", () => {
    const small = [1, 2, 3];
    expect(downsample(small, 400)).toEqual(small);
  });
  it("the full KW51 replay downsamples to the cap, not thousands of points", () => {
    const fullRecs = full as unknown as TriggerRecord[];
    expect(fullRecs.length).toBeGreaterThan(1000); // the crash input
    expect(downsample(fullRecs, 400).length).toBe(400);
  });
});

describe("temperature model recovered from served data", () => {
  it("recovers slope/intercept matching results.md (slope ~ -0.001, intercept ~ 2.934)", () => {
    const m = recoverTempModel(recs);
    expect(m).not.toBeNull();
    expect(m!.slope).toBeCloseTo(-0.00122, 3);
    expect(m!.intercept).toBeCloseTo(2.934, 2);
  });
  it("normal-residual std is derivable and small on the real replay", () => {
    const std = normalResidualStd(recs);
    expect(std).not.toBeNull();
    expect(std!).toBeGreaterThan(0);
    expect(std!).toBeLessThan(1); // sub-1% scatter on normal readings
  });
});
