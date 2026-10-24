import type { DataSource } from "./source";
import type {
  DefectScores,
  DefectTier,
  Finding,
  ImageMap,
  InspectionReport,
  Plan,
  PlanType,
  Structure,
  TriggerRecord,
  Waypoint,
} from "./types";
import { mockSource } from "./mockSource";
import { validatePlan, validateReplay, validateStructure } from "./validators";
import { addWarning } from "./dataWarnings";

// Base path where the shared data/ outputs are served from. Defaults to "/data".
const DATA_BASE =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? "/data";

// Defect model endpoint (contract §1: POST /predict).
const PREDICT_URL =
  (import.meta.env.VITE_PREDICT_URL as string | undefined) ??
  "http://localhost:8001";

// Discover planner module if a teammate has added web/src/planner/.
// import.meta.glob keeps the build green when the folder doesn't exist yet.
const plannerModules = import.meta.glob("../planner/index.*");

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

// ---- Structure (contract §3) ----

async function getStructure(id: string): Promise<Structure> {
  const fileName = `${id}.json`;
  const raw = await fetchJson(`${DATA_BASE}/structures/${fileName}`);
  if (raw === null) {
    return mockSource.getStructure(id);
  }
  const res = validateStructure(raw, fileName);
  if (!res.ok) {
    addWarning({ piece: "structure", message: `${res.error}. Falling back to mock structure.` });
    return mockSource.getStructure(id);
  }
  return res.value;
}

// ---- Plan (contract §4) ----

interface PlannerModule {
  naive?: (structure: Structure) => Plan;
  optimized?: (structure: Structure) => Plan;
  addInspection?: (plan: Plan, currentIndex: number, x: number, y: number) => Plan;
}

async function loadPlanner(): Promise<PlannerModule | null> {
  const keys = Object.keys(plannerModules);
  if (keys.length === 0) return null;
  try {
    const mod = (await plannerModules[keys[0]]()) as PlannerModule;
    return mod;
  } catch {
    return null;
  }
}

async function getPlan(type: PlanType): Promise<Plan> {
  const planner = await loadPlanner();
  if (!planner) {
    // Planner not present yet: use mock plans.
    return mockSource.getPlan(type);
  }
  try {
    const structure = await getStructure("bridge-a");
    const fn = type === "optimized" ? planner.optimized : planner.naive;
    if (!fn) return mockSource.getPlan(type);
    const plan = fn(structure);
    const res = validatePlan(plan, `planner:${type}`);
    if (!res.ok) {
      addWarning({ piece: "plan", message: `${res.error}. Falling back to mock plan.` });
      return mockSource.getPlan(type);
    }
    return res.value;
  } catch (e) {
    addWarning({
      piece: "plan",
      message: `planner threw an error (${String(e)}). Falling back to mock plan.`,
    });
    return mockSource.getPlan(type);
  }
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
  const planner = await loadPlanner();
  const imageMap = await getImageMap();
  const images = imageMap[structureId] ?? {};

  // Determine capture waypoints from the real/optimized plan.
  let waypoints: Waypoint[] = [];
  try {
    const plan = await getPlan("optimized");
    waypoints = plan.waypoints.filter((w) => w.capture);
  } catch {
    waypoints = [];
  }

  // If we have no planner and no capture waypoints, use mock findings wholesale.
  if (!planner && waypoints.length === 0) {
    return mockSource.getFindings(structureId);
  }

  const mockFindings = await mockSource.getFindings(structureId);
  const mockByWaypoint = new Map(mockFindings.map((f) => [f.waypoint_id, f]));

  const findings: Finding[] = [];
  let usedMockFallback = false;

  for (const wp of waypoints) {
    const imageKey = wp.id;
    const imagePath = images[imageKey];
    const result = imagePath ? await predict(imagePath) : null;

    if (result) {
      const tier = result.tier ?? tierFromDetected(result.detected);
      findings.push({
        id: `f-${wp.id}`,
        waypoint_id: wp.id,
        x: wp.x,
        y: wp.y,
        tier,
        scores: result.scores,
        detected: result.detected,
        image_key: imageKey,
        has_closeup: Boolean(images[`${imageKey}_closeup`]),
        defect_source: "predict",
      });
    } else {
      // Per-waypoint fallback to the mock result, marked as mock.
      usedMockFallback = true;
      const fallback = mockByWaypoint.get(wp.id);
      if (fallback) {
        findings.push({ ...fallback, defect_source: "mock" });
      }
    }
  }

  if (usedMockFallback) {
    addWarning({
      piece: "defects",
      message:
        "Defect model unavailable for one or more waypoints. Mock results used " +
        "(marked 'mock' in pin detail).",
    });
  }

  // If the real plan produced nothing usable, fall back to mock findings.
  if (findings.length === 0) {
    return mockFindings;
  }
  return findings;
}

async function getDemoReport(): Promise<InspectionReport> {
  return mockSource.getDemoReport();
}

export const realSource: DataSource = {
  isMock: false,
  getReplay,
  getStructure,
  getPlan,
  getImageMap,
  getFindings,
  getDemoReport,
};
