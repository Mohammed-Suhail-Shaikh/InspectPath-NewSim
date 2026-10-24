import { describe, it, expect } from "vitest";
import replay from "../mocks/replay_z24.json";
import structure from "../mocks/structure_bridge-a.json";
import planNaive from "../mocks/plan_naive.json";
import planOptimized from "../mocks/plan_optimized.json";
import imageMap from "../mocks/image_map.json";
import defectResponses from "../mocks/defect_responses.json";

const ALERT_LEVELS = ["normal", "watch", "warning", "alarm"];
const QUALITY = ["ok", "degraded"];
const TIERS = ["high", "medium", "low", "none"];
const DEFECT_CLASSES = [
  "crack",
  "spallation",
  "exposed_bars",
  "efflorescence",
  "corrosion_stain",
];

describe("contract §2 — trigger replay", () => {
  it("is a non-empty array of records with the required fields and value sets", () => {
    expect(Array.isArray(replay)).toBe(true);
    expect(replay.length).toBeGreaterThan(0);
    for (const r of replay) {
      expect(typeof r.node_id).toBe("string");
      expect(typeof r.timestamp).toBe("string");
      expect(typeof r.temperature_c).toBe("number");
      expect(typeof r.frequency_hz).toBe("number");
      expect(typeof r.predicted_frequency_hz).toBe("number");
      expect(typeof r.residual_pct).toBe("number");
      expect(ALERT_LEVELS).toContain(r.alert_level);
      expect(QUALITY).toContain(r.quality);
      expect(typeof r.source).toBe("string");
    }
  });

  it("progresses normal -> watch -> warning -> alarm and has a degraded window", () => {
    const levels = replay.map((r) => r.alert_level);
    expect(levels[0]).toBe("normal");
    expect(levels).toContain("watch");
    expect(levels).toContain("warning");
    expect(levels[levels.length - 1]).toBe("alarm");
    expect(replay.some((r) => r.quality === "degraded")).toBe(true);
  });
});

describe("contract §3 — structure", () => {
  it("has required fields with correct cell values and an alert zone", () => {
    expect(typeof structure.id).toBe("string");
    expect(typeof structure.name).toBe("string");
    expect(typeof structure.width).toBe("number");
    expect(typeof structure.height).toBe("number");
    expect(Array.isArray(structure.grid)).toBe(true);
    for (const row of structure.grid) {
      for (const cell of row) {
        expect([0, 1, 2]).toContain(cell);
      }
    }
    expect(structure.start).toHaveProperty("x");
    expect(structure.start).toHaveProperty("y");
    expect(typeof structure.battery_budget).toBe("number");
    expect(typeof structure.capture_spacing).toBe("number");
    expect(structure.alert_zone).toBeDefined();
  });
});

describe("contract §4 — plans", () => {
  for (const [name, plan] of [
    ["naive", planNaive],
    ["optimized", planOptimized],
  ] as const) {
    it(`${name} plan has valid plan_type, waypoints, and stats`, () => {
      expect(["naive", "optimized"]).toContain(plan.plan_type);
      expect(Array.isArray(plan.waypoints)).toBe(true);
      expect(plan.waypoints.length).toBeGreaterThan(0);
      for (const w of plan.waypoints) {
        expect(typeof w.id).toBe("string");
        expect(typeof w.x).toBe("number");
        expect(typeof w.y).toBe("number");
        expect(typeof w.capture).toBe("boolean");
        expect(typeof w.closeup).toBe("boolean");
      }
      const s = plan.stats;
      expect(typeof s.coverage_pct).toBe("number");
      expect(typeof s.priority_coverage_pct).toBe("number");
      expect(typeof s.path_length).toBe("number");
      expect(typeof s.battery_used).toBe("number");
      expect(typeof s.battery_budget).toBe("number");
    });
  }
});

describe("contract §5 — image map", () => {
  it("maps structure ids to key -> path strings", () => {
    for (const structId of Object.keys(imageMap)) {
      const entries = (imageMap as Record<string, Record<string, string>>)[structId];
      for (const [key, path] of Object.entries(entries)) {
        expect(typeof key).toBe("string");
        expect(typeof path).toBe("string");
      }
    }
  });
});

describe("contract §1 — defect responses", () => {
  it("each response has all five scores, detected, tier, threshold", () => {
    for (const resp of Object.values(
      defectResponses as Record<
        string,
        { scores: Record<string, number>; detected: string[]; tier: string; threshold: number }
      >
    )) {
      for (const cls of DEFECT_CLASSES) {
        expect(typeof resp.scores[cls]).toBe("number");
      }
      expect(Array.isArray(resp.detected)).toBe(true);
      expect(TIERS).toContain(resp.tier);
      expect(typeof resp.threshold).toBe("number");
    }
  });

  it("covers all four tiers across the sample set", () => {
    const tiers = new Set(
      Object.values(
        defectResponses as Record<string, { tier: string }>
      ).map((r) => r.tier)
    );
    for (const t of TIERS) {
      expect(tiers.has(t)).toBe(true);
    }
  });
});
