import type { DataSource } from "./source";
import type {
  DefectScores,
  DefectTier,
  Finding,
  ImageMap,
  InspectionReport,
  MetricPlan,
  MetricStructure,
  PlanType,
  TriggerRecord,
} from "./types";
import { mockSource } from "./mockSource";
import {
  validateMetricPlan,
  validateMetricStructure,
  validateReplay,
} from "./validators";
import { addWarning } from "./dataWarnings";

// Base path where the shared data/ outputs are served from. Defaults to "/data".
const DATA_BASE =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? "/data";

// Defect model endpoint (contract §1: POST /predict).
const PREDICT_URL =
  (import.meta.env.VITE_PREDICT_URL as string | undefined) ??
  "http://localhost:8001";

// Fetches JSON, treating a non-OK status OR a non-JSON content-type as "missing".
// The Vite dev server returns 200 + text/html (its SPA fallback) for files that
// don't exist, so res.ok alone is not enough to conclude the file is present.
async function fetchJson(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(path, { method: "GET" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- Replay (contract §2) ----

async function getReplay(dataset: string): Promise<TriggerRecord[]> {
  const fileName = `replay_${dataset}.json`;
  const raw = await fetchJson(`${DATA_BASE}/trigger/${fileName}`);
  if (raw === null) {
    // File not present yet: fall back to mock silently (expected pre-integration).
    return mockSource.getReplay(dataset);
  }
  const res = validateReplay(raw, fileName);
  if (!res.ok) {
    addWarning({ piece: "replay", message: `${res.error}. Falling back to mock replay.` });
    return mockSource.getReplay(dataset);
  }
  return res.value;
}

// ---- Metric structure (contract §3b) ----
// Real KW51 geometry. The dashboard reads it; it never computes geometry.
// The layout file is served at /data/structures/kw51_layout.json.

async function getMetricStructure(): Promise<MetricStructure> {
  const fileName = "kw51_layout.json";
  const raw = await fetchJson(`${DATA_BASE}/structures/${fileName}`);
  if (raw === null) {
    // Not present yet: fall back to the metric sample. This is expected before
    // the geometry is deployed, so warn (it affects what the map shows).
    addWarning({
      piece: "structure",
      message: `${fileName} not found under ${DATA_BASE}/structures/. Using the metric sample.`,
    });
    return mockSource.getMetricStructure();
  }
  const res = validateMetricStructure(raw, fileName);
  if (!res.ok) {
    addWarning({ piece: "structure", message: `${res.error}. Falling back to the metric sample.` });
    return mockSource.getMetricStructure();
  }
  return res.value;
}

// ---- Metric plan (contract §4b) ----
// Produced only by firmware_esp32/planner.py and served as JSON files; the
// dashboard reads them and never computes a plan.

async function getMetricPlan(type: PlanType): Promise<MetricPlan> {
  const fileName = `kw51_${type}.json`;
  const raw = await fetchJson(`${DATA_BASE}/plans/${fileName}`);
  if (raw === null) {
    addWarning({
      piece: "plan",
      message: `${fileName} not found under ${DATA_BASE}/plans/. Using the metric sample plan.`,
    });
    return mockSource.getMetricPlan(type);
  }
  const res = validateMetricPlan(raw, fileName);
  if (!res.ok) {
    addWarning({ piece: "plan", message: `${res.error}. Falling back to the metric sample plan.` });
    return mockSource.getMetricPlan(type);
  }
  return res.value;
}

// ---- Image map (contract §5) ----

async function getImageMap(): Promise<ImageMap> {
  const raw = await fetchJson(`${DATA_BASE}/image_map.json`);
  if (raw === null || typeof raw !== "object") {
    return mockSource.getImageMap();
  }
  return raw as ImageMap;
}

// ---- Defects (contract §1) via POST /predict, per capture waypoint ----

// Tier rule per contract §1 (team decision, not an engineering standard).
function tierFromDetected(detected: string[]): DefectTier {
  if (detected.includes("exposed_bars") || detected.includes("spallation")) return "high";
  if (detected.includes("corrosion_stain")) return "medium";
  if (detected.includes("crack") || detected.includes("efflorescence")) return "low";
  return "none";
}

interface PredictResponse {
  scores: DefectScores;
  detected: string[];
  tier: DefectTier;
  threshold: number;
}

// Convert a Blob to a bare base64 string (no data: prefix).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string; // "data:<mime>;base64,<payload>"
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Contract §1: POST /predict takes an image file or base64 image — NOT a path.
// We fetch the image from the served data/ path, then send it as base64 JSON
// ({ image_base64 }), which Zaiba's API accepts. Returns null on any failure so
// the caller can fall back to the mock result for that waypoint.
async function predict(imagePath: string): Promise<PredictResponse | null> {
  try {
    // 1. Fetch the image bytes from /data/<path>.
    const imgRes = await fetch(`${DATA_BASE}/${imagePath.replace(/^\/+/, "")}`);
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get("content-type") ?? "";
    // Guard against the Vite SPA fallback (HTML) when the image is missing.
    if (!contentType.startsWith("image/")) return null;
    const blob = await imgRes.blob();
    const imageBase64 = await blobToBase64(blob);

    // 2. Send it to the defect model as base64.
    const res = await fetch(`${PREDICT_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== "object" || !data.scores || !Array.isArray(data.detected)) {
      return null;
    }
    return data as PredictResponse;
  } catch {
    return null;
  }
}

async function getFindings(structureId: string): Promise<Finding[]> {
  const imageMap = await getImageMap();
  const images = imageMap[structureId] ?? {};

  // Findings are simulated, so the set of inspected locations comes from the
  // mock findings (which are keyed to real KW51 connection locations). For each,
  // try the real defect model on its image; fall back to the mock score if the
  // model is unavailable, marking the result as mock.
  const mockFindings = await mockSource.getFindings(structureId);
  if (mockFindings.length === 0) return mockFindings;

  const findings: Finding[] = [];
  let usedMockFallback = false;

  for (const mf of mockFindings) {
    const imagePath = images[mf.image_key];
    const result = imagePath ? await predict(imagePath) : null;

    if (result) {
      const tier = result.tier ?? tierFromDetected(result.detected);
      findings.push({
        ...mf,
        tier,
        scores: result.scores,
        detected: result.detected,
        has_closeup: Boolean(images[`${mf.image_key}_closeup`]),
        defect_source: "predict",
      });
    } else {
      usedMockFallback = true;
      findings.push({ ...mf, defect_source: "mock" });
    }
  }

  if (usedMockFallback) {
    addWarning({
      piece: "defects",
      message:
        "Defect model unavailable for one or more locations. Mock results used " +
        "(marked 'mock' in pin detail).",
    });
  }

  return findings;
}

async function getDemoReport(): Promise<InspectionReport> {
  return mockSource.getDemoReport();
}

export const realSource: DataSource = {
  isMock: false,
  getReplay,
  getMetricStructure,
  getMetricPlan,
  getImageMap,
  getFindings,
  getDemoReport,
};
