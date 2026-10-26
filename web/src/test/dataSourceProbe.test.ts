// Permanent test for the startup data-source probe (step 8). The probe is what
// chooses real vs mock at app start; it is the step the direct-file tests skip,
// and the one that was silently failing. These tests exercise it through a
// mocked fetch so a regression in the probe URL, status/content-type handling,
// or the silent-fallback behavior is caught.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initDataSource,
  resetDataSourceForTest,
  isMockActive,
} from "../data/activeSource";
import { clearWarnings } from "../data/dataWarnings";

const realFetch = globalThis.fetch;

describe("startup data-source probe", () => {
  beforeEach(() => {
    resetDataSourceForTest();
    clearWarnings();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("chooses the REAL source when the probe file is served as JSON", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // The probe hits /data/trigger/replay_kw51_demo.json.
      if (url.includes("/trigger/replay_kw51_demo.json")) {
        return new Response(JSON.stringify([{ ok: true }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));

    const src = await initDataSource();
    expect(src.isMock).toBe(false);
    expect(isMockActive()).toBe(false);
    expect(warned).toEqual([]); // no fallback warning when real data is present
    spy.mockRestore();
  });

  it("chooses MOCK with a warning when the probe gets Vite's HTML SPA fallback", async () => {
    // Vite answers missing files with 200 + text/html, not JSON.
    globalThis.fetch = vi.fn(async () =>
      new Response("<!doctype html><div id=root></div>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    ) as unknown as typeof fetch;

    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));

    const src = await initDataSource();
    expect(src.isMock).toBe(true);
    expect(isMockActive()).toBe(true);
    // Step 5: the fallback is NOT silent and names the probed file.
    expect(
      warned.some(
        (w) =>
          w.includes("replay_kw51_demo.json") &&
          w.toLowerCase().includes("sample")
      )
    ).toBe(true);
    spy.mockRestore();
  });

  it("chooses MOCK with a warning when the probe returns a non-OK status", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 404 })
    ) as unknown as typeof fetch;

    const warned: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void warned.push(m));

    const src = await initDataSource();
    expect(src.isMock).toBe(true);
    expect(warned.some((w) => w.includes("replay_kw51_demo.json"))).toBe(true);
    spy.mockRestore();
  });
});
