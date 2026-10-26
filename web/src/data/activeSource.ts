import type { DataSource } from "./source";
import { mockSource } from "./mockSource";
import { realSource } from "./realSource";
import { addWarning } from "./dataWarnings";
import type { MetricPlan, MetricStructure, PlanType } from "./types";

// Data-source switch: use the real source when the shared data/ outputs exist,
// otherwise the mock source. Each piece inside realSource still falls back on
// its own, so one missing piece never breaks the others.
//
// Resolution happens once at startup via initDataSource(). Until then, and if
// no real data is present, getDataSource() returns the mock source.

export const DATA_BASE =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? "/data";

// The replay file used to detect a real deployment. Matches the default dataset.
const PROBE_FILE = "replay_kw51_demo.json";

// Resolve an image-map path (relative, e.g. "images/test/x.png") to a URL the
// browser can load, served under the data base (e.g. "/data/images/test/x.png").
// Absolute URLs and already-prefixed paths pass through unchanged.
export function resolveImageUrl(p: string | undefined): string | undefined {
  if (!p) return undefined;
  if (/^(https?:)?\/\//.test(p) || p.startsWith(DATA_BASE + "/")) return p;
  const clean = p.replace(/^\/+/, "");
  return `${DATA_BASE}/${clean}`;
}

let active: DataSource = mockSource;
let initialized = false;

// A real deployment is detected if an expected data/ entry point is reachable
// AND returns JSON. The Vite dev server answers missing files with 200 + an
// HTML SPA fallback, so we must check the content-type, not just res.ok.
// We probe a trigger replay file (the piece that currently ships real data).
// Returns ok=true when real data is present, or ok=false with a human reason
// naming the probed URL and what went wrong, so the fallback is never silent.
interface ProbeResult {
  ok: boolean;
  url: string;
  reason?: string;
}

async function realDataPresent(): Promise<ProbeResult> {
  const url = `${DATA_BASE}/trigger/${PROBE_FILE}`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      return { ok: false, url, reason: `HTTP ${res.status}` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      // Vite's SPA fallback returns the app HTML for missing files.
      return {
        ok: false,
        url,
        reason: `expected JSON but got "${contentType || "unknown"}" (file not served)`,
      };
    }
    return { ok: true, url };
  } catch (e) {
    return { ok: false, url, reason: `request failed (${String(e)})` };
  }
}

export async function initDataSource(): Promise<DataSource> {
  if (initialized) return active;
  const probe = await realDataPresent();
  active = probe.ok ? realSource : mockSource;
  initialized = true;
  if (!probe.ok) {
    // Step 5: never fall back to mock silently. Name the file the probe could
    // not reach so the user knows why the whole app is in sample mode.
    addWarning({
      piece: "replay",
      message:
        `Real data not found at ${probe.url} (${probe.reason}). ` +
        `Showing sample data for the whole app.`,
    });
  }
  return active;
}

export function getDataSource(): DataSource {
  return active;
}

// Convenience: whether the active source serves mock data.
export function isMockActive(): boolean {
  return active.isMock;
}

// ---- Coherent metric geometry + plans ----
// The inspection view and the report both need the structure AND a plan, and
// they must never mix real geometry with sample plans (or the reverse), nor show
// real stats over sample geometry. getInspectionData resolves all of it as ONE
// coherent unit and reports whether the result is real or sample:
//   - if the structure fell back to the sample, the plans use the sample too;
//   - if a real plan's stops reference locations absent from the real structure,
//     the whole bundle degrades to the sample (warn), because a real plan that
//     does not match the real geometry is a data-integrity failure, not a view we
//     should render with mixed data.

// The real KW51 layout carries id "kw51"; any other id is the sample fallback.
export function isSampleStructure(s: MetricStructure): boolean {
  return s.id !== "kw51";
}

export interface InspectionData {
  structure: MetricStructure;
  plans: Record<PlanType, MetricPlan>;
  isSample: boolean; // true when geometry AND plans are the sample fallback
}

let inspectionDataPromise: Promise<InspectionData> | null = null;

// Reset the cached bundle (used by tests; harmless in the app).
export function resetInspectionData(): void {
  inspectionDataPromise = null;
}

async function sampleBundle(): Promise<InspectionData> {
  const [structure, naive, optimized] = await Promise.all([
    mockSource.getMetricStructure(),
    mockSource.getMetricPlan("naive"),
    mockSource.getMetricPlan("optimized"),
  ]);
  return { structure, plans: { naive, optimized }, isSample: true };
}

async function resolveInspectionData(): Promise<InspectionData> {
  const src = getDataSource();
  const structure = await src.getMetricStructure();

  // 1. Sample geometry -> sample everything. Never real stats over a sample.
  if (isSampleStructure(structure)) {
    return sampleBundle();
  }

  // 2. Real geometry -> load the real plans and verify every stop exists in the
  //    structure. Any mismatch degrades the whole bundle to the sample.
  const [naive, optimized] = await Promise.all([
    src.getMetricPlan("naive"),
    src.getMetricPlan("optimized"),
  ]);
  const locationIds = new Set(
    structure.diagonal_connections.distinct_locations.map((l) => l.location_id)
  );
  for (const [type, plan] of [
    ["naive", naive],
    ["optimized", optimized],
  ] as const) {
    const missing = plan.stops.filter((s) => !locationIds.has(s.location_id));
    if (missing.length > 0) {
      addWarning({
        piece: "plan",
        message:
          `Plan "${type}" references ${missing.length} location(s) not in the ` +
          `loaded structure (e.g. ${missing[0].location_id}). Showing sample ` +
          `geometry and plans to avoid mixing mismatched data.`,
      });
      return sampleBundle();
    }
  }

  return { structure, plans: { naive, optimized }, isSample: false };
}

// Resolve (and cache) the coherent structure + plans bundle.
export function getInspectionData(): Promise<InspectionData> {
  if (!inspectionDataPromise) {
    inspectionDataPromise = resolveInspectionData();
  }
  return inspectionDataPromise;
}
