// Permanent fallback tests (promoted from a group-C throwaway): when the real
// metric data cannot be loaded, the real source falls back to the metric SAMPLE
// and raises a data warning that names the problem.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realSource } from "../data/realSource";
import { clearWarnings } from "../data/dataWarnings";

describe("metric fallback", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => clearWarnings());
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("missing layout -> metric sample structure + warning", async () => {
    // Simulate the Vite SPA fallback: 200 but text/html (treated as missing).
    globalThis.fetch = vi.fn(async () =>
      new Response("<!doctype html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    ) as unknown as typeof fetch;

    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));

    const s = await realSource.getMetricStructure();
    expect(s.id).toBe("kw51-sample"); // the metric sample, not real KW51
    expect(
      warned.some(
        (w) => w.includes("structure") && w.toLowerCase().includes("sample")
      )
    ).toBe(true);
    spy.mockRestore();
  });

  it("invalid plan (empty stops) -> metric sample plan + warning naming the field", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          plan_type: "optimized",
          units: "m",
          stops: [],
          stats: {},
          provenance: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));

    const p = await realSource.getMetricPlan("optimized");
    expect(p.stats.locations_total).toBe(2); // the metric sample plan (2 stops)
    expect(warned.some((w) => w.includes("stops"))).toBe(true); // validator named the field
    spy.mockRestore();
  });
});
