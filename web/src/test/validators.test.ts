import { describe, it, expect } from "vitest";
import {
  validateReplay,
  validateStructure,
  validatePlan,
  validateTriggerRecord,
} from "../data/validators";

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

// ---- contract §3: structure ----

const validStructure = {
  id: "bridge-a",
  name: "Bridge Section A",
  width: 30,
  height: 10,
  grid: [
    [0, 0, 2, 1],
    [0, 0, 0, 0],
  ],
  start: { x: 0, y: 0 },
  battery_budget: 220,
  capture_spacing: 3,
  alert_zone: { x: 12, y: 4, radius: 3 },
};

describe("validateStructure (contract §3)", () => {
  it("accepts a valid structure (with alert_zone)", () => {
    const res = validateStructure(validStructure, "s.json");
    expect(res.ok).toBe(true);
  });

  it("accepts a valid structure without the optional alert_zone", () => {
    const { alert_zone, ...noZone } = validStructure;
    void alert_zone;
    const res = validateStructure(noZone, "s.json");
    expect(res.ok).toBe(true);
  });

  it("rejects an out-of-range grid cell and names its position", () => {
    const res = validateStructure(
      { ...validStructure, grid: [[0, 3]] },
      "s.json"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("grid[0][1]");
  });

  it("rejects a missing numeric field", () => {
    const { battery_budget, ...missing } = validStructure;
    void battery_budget;
    const res = validateStructure(missing, "s.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("battery_budget");
  });

  it("rejects a malformed alert_zone", () => {
    const res = validateStructure(
      { ...validStructure, alert_zone: { x: 1, y: 2 } },
      "s.json"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("alert_zone");
  });
});

// ---- contract §4: plan ----

const validPlan = {
  plan_type: "optimized",
  waypoints: [
    { id: "w1", x: 0, y: 0, capture: false, closeup: false },
    { id: "w2", x: 2, y: 0, capture: true, closeup: false, zone: "priority" },
  ],
  stats: {
    coverage_pct: 0.94,
    priority_coverage_pct: 1.0,
    path_length: 198,
    battery_used: 214,
    battery_budget: 220,
  },
};

describe("validatePlan (contract §4)", () => {
  it("accepts a valid plan", () => {
    const res = validatePlan(validPlan, "plan.json");
    expect(res.ok).toBe(true);
  });

  it("rejects an invalid plan_type", () => {
    const res = validatePlan({ ...validPlan, plan_type: "greedy" }, "plan.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("plan_type");
  });

  it("rejects a waypoint missing a boolean field and names it", () => {
    const res = validatePlan(
      {
        ...validPlan,
        waypoints: [{ id: "w1", x: 0, y: 0, closeup: false }],
      },
      "plan.json"
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("waypoints[0]");
      expect(res.error).toContain("capture");
    }
  });

  it("rejects a missing stats field and names it", () => {
    const { coverage_pct, ...stats } = validPlan.stats;
    void coverage_pct;
    const res = validatePlan({ ...validPlan, stats }, "plan.json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("coverage_pct");
  });
});
