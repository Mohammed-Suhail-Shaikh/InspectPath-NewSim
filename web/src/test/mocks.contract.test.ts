import { describe, it, expect } from "vitest";
import replay from "../mocks/replay_z24.json";
import structure from "../mocks/structure_kw51_sample.json";
import planNaive from "../mocks/plan_kw51_naive_sample.json";
import planOptimized from "../mocks/plan_kw51_optimized_sample.json";
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

// Changed from grid (cells 0/1/2, alert_zone) to metric. Reason: the mock
// structure moved to the metric format (contract §3b); the grid mock was removed.
describe("contract §3b — metric structure", () => {
  it("has metric fields, units in metres, nodes/members/stops/sensors", () => {
    expect(typeof structure.id).toBe("string");
    expect(typeof structure.name).toBe("string");
    expect(structure.units).toBe("m");
    expect(typeof structure.coordinate_system).toBe("string");
    expect(Array.isArray(structure.nodes)).toBe(true);
    expect(structure.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(structure.members)).toBe(true);
    expect(structure.members.length).toBeGreaterThan(0);
    const dc = structure.diagonal_connections;
    expect(dc.distinct_locations.length).toBe(dc.distinct_location_count);
    for (const l of dc.distinct_locations) {
      expect(["A", "C"]).toContain(l.side);
      expect(["deck", "arch"]).toContain(l.end);
      expect(typeof l.x).toBe("number");
      expect(typeof l.z).toBe("number");
    }
    expect(structure.sensors.length).toBeGreaterThan(0);
    expect(typeof structure.provenance.license).toBe("string");
  });
});

// Changed from grid waypoints + priority_coverage to metric stops + stats.
// Reason: the plan format moved to metric (contract §4b).
describe("contract §4b — metric plans", () => {
  for (const [name, plan] of [
    ["naive", planNaive],
    ["optimized", planOptimized],
  ] as const) {
    it(`${name} plan has valid plan_type, metric stops, and stats`, () => {
      expect(["naive", "optimized"]).toContain(plan.plan_type);
      expect(plan.units).toBe("m");
      expect(Array.isArray(plan.stops)).toBe(true);
      expect(plan.stops.length).toBeGreaterThan(0);
      for (const s of plan.stops) {
        expect(typeof s.location_id).toBe("string");
        expect(typeof s.x).toBe("number");
        expect(typeof s.z).toBe("number");
        expect(typeof s.order).toBe("number");
        expect(typeof s.reachable).toBe("boolean");
      }
      const s = plan.stats;
      expect(typeof s.coverage_pct).toBe("number");
      expect(typeof s.route_length_m).toBe("number");
      expect(typeof s.battery_used).toBe("number");
      expect(typeof s.battery_budget).toBe("number");
      expect(typeof s.within_budget).toBe("boolean");
      // priority coverage must be gone
      expect((s as Record<string, unknown>).priority_coverage_pct).toBeUndefined();
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
