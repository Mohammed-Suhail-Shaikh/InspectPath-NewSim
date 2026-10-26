import { describe, it, expect } from "vitest";
import {
  validateReplay,
  validateMetricStructure,
  validateMetricPlan,
  validateTriggerRecord,
} from "../data/validators";
import metricStructure from "../mocks/structure_kw51_sample.json";
import metricPlan from "../mocks/plan_kw51_optimized_sample.json";

// ---- contract §2: replay ----

const validRecord = {
  node_id: "node-1",
  timestamp: "1998-01-17T10:00:00Z",
  temperature_c: -2.4,
  frequency_hz: 3.91,
  predicted_frequency_hz: 4.05,
  residual_pct: -3.5,
  alert_level: "watch",
  quality: "ok",
  source: "Z24 replay",
};

describe("validateTriggerRecord (contract §2)", () => {
  it("accepts a valid record", () => {
    const res = validateTriggerRecord(validRecord, "r");
    expect(res.ok).toBe(true);
  });

  it("rejects an invalid alert_level and names the field", () => {
    const res = validateTriggerRecord(
      { ...validRecord, alert_level: "critical" },
      "r"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("alert_level");
  });

  it("rejects a non-numeric frequency and names the field", () => {
    const res = validateTriggerRecord(
      { ...validRecord, frequency_hz: "3.91" },
      "r"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("frequency_hz");
  });

  it("rejects an invalid quality value", () => {
    const res = validateTriggerRecord({ ...validRecord, quality: "bad" }, "r");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("quality");
  });
});

describe("validateReplay (contract §2)", () => {
  it("accepts a non-empty array of valid records", () => {
    const res = validateReplay([validRecord], "replay.json");
    expect(res.ok).toBe(true);
  });

  it("rejects a non-array", () => {
    const res = validateReplay({ not: "array" }, "replay.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("array");
  });

  it("rejects an empty array", () => {
    const res = validateReplay([], "replay.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("empty");
  });

  it("names the index of the first bad record", () => {
    const res = validateReplay(
      [validRecord, { ...validRecord, timestamp: 123 }],
      "replay.json"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("[1]");
      expect(res.error).toContain("timestamp");
    }
  });
});

// ---- contract §3b: metric structure ----
// Replaces the former grid-structure tests. Reason: the grid structure format
// and validateStructure were removed; the dashboard now consumes metric
// geometry validated by validateMetricStructure.

describe("validateMetricStructure (contract §3b)", () => {
  it("accepts the metric sample structure", () => {
    const res = validateMetricStructure(metricStructure, "s.json");
    expect(res.ok).toBe(true);
  });

  it("rejects units that are not metres", () => {
    const res = validateMetricStructure(
      { ...metricStructure, units: "ft" },
      "s.json"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("units");
  });

  it("rejects when distinct_location_count disagrees with the array length", () => {
    const bad = {
      ...metricStructure,
      diagonal_connections: {
        ...metricStructure.diagonal_connections,
        distinct_location_count: 99,
      },
    };
    const res = validateMetricStructure(bad, "s.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("distinct_location_count");
  });

  it("rejects a location with an invalid side and names the field", () => {
    const locs = metricStructure.diagonal_connections.distinct_locations.map(
      (l, i) => (i === 0 ? { ...l, side: "B" } : l)
    );
    const bad = {
      ...metricStructure,
      diagonal_connections: {
        ...metricStructure.diagonal_connections,
        distinct_locations: locs,
      },
    };
    const res = validateMetricStructure(bad, "s.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("side");
  });

  it("rejects a missing provenance block", () => {
    const { provenance, ...noProv } = metricStructure;
    void provenance;
    const res = validateMetricStructure(noProv, "s.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provenance");
  });
});

// ---- contract §4b: metric plan ----
// Replaces the former grid-plan tests. Reason: the grid plan format and
// validatePlan were removed; plans are now metric (stops + stats + provenance).

describe("validateMetricPlan (contract §4b)", () => {
  it("accepts the metric sample plan", () => {
    const res = validateMetricPlan(metricPlan, "plan.json");
    expect(res.ok).toBe(true);
  });

  it("rejects an invalid plan_type", () => {
    const res = validateMetricPlan(
      { ...metricPlan, plan_type: "greedy" },
      "plan.json"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("plan_type");
  });

  it("rejects a stop missing a required field and names it", () => {
    const bad = {
      ...metricPlan,
      stops: [{ location_id: "x", x: 0, y: 0, z: 0, order: 0 }],
    };
    const res = validateMetricPlan(bad, "plan.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("stops[0]");
  });

  it("rejects a missing numeric stats field and names it", () => {
    const { coverage_pct, ...stats } = metricPlan.stats;
    void coverage_pct;
    const res = validateMetricPlan({ ...metricPlan, stats }, "plan.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("coverage_pct");
  });
});
