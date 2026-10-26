// Permanent tests that load the REAL committed data files
// (data/structures/kw51_layout.json and data/plans/*.json) through the
// validators, check structure-plan consistency, and confirm the real source
// returns them WITHOUT falling back. These are the tests that would have caught
// the transverse-beam y=null bug.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateMetricPlan,
  validateMetricStructure,
} from "../data/validators";
import { realSource } from "../data/realSource";
import { clearWarnings } from "../data/dataWarnings";
import type { MetricPlan, MetricStructure } from "../data/types";

// Load the REAL committed data files. These live at the repo root (outside
// web/), imported directly so the test breaks if the real files ever become
// invalid. Vite resolves JSON imports at test time; no Node types needed.
import layoutRaw from "../../../data/structures/kw51_layout.json";
import naiveRaw from "../../../data/plans/kw51_naive.json";
import optimizedRaw from "../../../data/plans/kw51_optimized.json";

describe("real data — validators accept the committed files", () => {
  it("kw51_layout.json validates as a metric structure", () => {
    const res = validateMetricStructure(layoutRaw, "kw51_layout.json");
    expect(res.ok).toBe(true);
  });

  it("every node in the real layout has numeric x, y, z (regression: transverse-beam y=null)", () => {
    const s = layoutRaw as unknown as MetricStructure;
    const bad = s.nodes.filter(
      (n) =>
        typeof n.x !== "number" ||
        typeof n.y !== "number" ||
        typeof n.z !== "number"
    );
    expect(bad).toEqual([]);
  });

  it("kw51_naive.json validates as a metric plan", () => {
    const res = validateMetricPlan(naiveRaw, "kw51_naive.json");
    expect(res.ok).toBe(true);
  });

  it("kw51_optimized.json validates as a metric plan", () => {
    const res = validateMetricPlan(optimizedRaw, "kw51_optimized.json");
    expect(res.ok).toBe(true);
  });
});

describe("real data — structure/plan consistency", () => {
  const structure = layoutRaw as unknown as MetricStructure;
  const locationIds = new Set(
    structure.diagonal_connections.distinct_locations.map((l) => l.location_id)
  );

  for (const [name, raw] of [
    ["naive", naiveRaw],
    ["optimized", optimizedRaw],
  ] as const) {
    it(`${name} plan: every stop location_id exists in the structure`, () => {
      const plan = raw as unknown as MetricPlan;
      const missing = plan.stops.filter(
        (s) => !locationIds.has(s.location_id)
      );
      expect(missing).toEqual([]);
    });

    it(`${name} plan: visits all 34 distinct locations exactly once`, () => {
      const plan = raw as unknown as MetricPlan;
      expect(plan.stops.length).toBe(34);
      expect(new Set(plan.stops.map((s) => s.location_id)).size).toBe(34);
      expect(structure.diagonal_connections.distinct_location_count).toBe(34);
    });
  }
});

describe("real source — loads the real files without falling back", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => clearWarnings());
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  // Serve the real files through a mocked fetch, exactly as the Vite dev server
  // would (JSON content-type). If anything about the real files were invalid,
  // realSource would warn and fall back to the sample — these asserts prove it
  // does not.
  function serveRealFiles() {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = null;
      if (url.includes("/structures/kw51_layout.json")) body = layoutRaw;
      else if (url.includes("/plans/kw51_naive.json")) body = naiveRaw;
      else if (url.includes("/plans/kw51_optimized.json")) body = optimizedRaw;
      if (body === null) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
  }

  it("getMetricStructure returns the real KW51 layout (id 'kw51'), no warning", async () => {
    serveRealFiles();
    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));
    const s = await realSource.getMetricStructure();
    expect(s.id).toBe("kw51");
    expect(s.nodes.length).toBeGreaterThan(1000);
    expect(warned).toEqual([]);
    spy.mockRestore();
  });

  it("getMetricPlan returns the real plans (34 stops), no warning", async () => {
    serveRealFiles();
    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));
    const naive = await realSource.getMetricPlan("naive");
    const optimized = await realSource.getMetricPlan("optimized");
    expect(naive.stops.length).toBe(34);
    expect(optimized.stops.length).toBe(34);
    expect(naive.stats.route_length_m).toBeCloseTo(405.9, 1);
    expect(optimized.stats.route_length_m).toBeCloseTo(399.8, 1);
    expect(warned).toEqual([]);
    spy.mockRestore();
  });
});
