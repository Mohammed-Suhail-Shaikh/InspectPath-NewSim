// Data shapes for the dashboard.
// Each shape is labeled either [contract §N] (defined by docs/contract.md, consumed as-is)
// or [dashboard-internal] (owned by web/, NOT part of the shared contract).

// ---- Contract-defined shapes ----

// [contract §2] one record per measurement window
export interface TriggerRecord {
  node_id: string;
  timestamp: string; // ISO 8601
  temperature_c: number;
  frequency_hz: number;
  predicted_frequency_hz: number;
  residual_pct: number;
  alert_level: AlertLevel;
  quality: "ok" | "degraded";
  source: string;
}

// [contract §2] alert levels
export type AlertLevel = "normal" | "watch" | "warning" | "alarm";

// [contract §3] structure input
export interface Structure {
  id: string;
  name: string;
  width: number;
  height: number;
  grid: number[][]; // 0 surface, 1 obstacle/no-fly, 2 priority
  start: { x: number; y: number };
  battery_budget: number;
  capture_spacing: number;
  alert_zone?: { x: number; y: number; radius: number };
}

// [contract §4] planner output
export interface Waypoint {
  id: string;
  x: number;
  y: number;
  capture: boolean;
  closeup: boolean;
  zone?: string;
}

export interface PlanStats {
  coverage_pct: number;
  priority_coverage_pct: number;
  path_length: number;
  battery_used: number;
  battery_budget: number;
}

export type PlanType = "naive" | "optimized";

export interface Plan {
  plan_type: PlanType;
  waypoints: Waypoint[];
  stats: PlanStats;
}

// [contract §5] image map
export type ImageMap = {
  [structureId: string]: {
    [key: string]: string;
  };
};

// [contract §1] defect model scores and tier
export interface DefectScores {
  crack: number;
  spallation: number;
  exposed_bars: number;
  efflorescence: number;
  corrosion_stain: number;
}

export type DefectTier = "high" | "medium" | "low" | "none";

// ---- Dashboard-internal shapes (NOT part of the shared contract) ----

// [dashboard-internal] joins a map location to a captured image and its defect result
export interface Finding {
  id: string;
  waypoint_id: string; // references Waypoint.id [contract §4]
  x: number;
  y: number;
  tier: DefectTier; // value set per [contract §1]
  scores: DefectScores; // field set per [contract §1]
  detected: string[]; // per [contract §1]
  image_key: string; // key into ImageMap[structureId] [contract §5]
  has_closeup: boolean; // whether "<image_key>_closeup" exists [contract §5]
}

// [dashboard-internal] accumulated alert transitions observed during replay
export interface AlertHistoryEntry {
  timestamp: string;
  alert_level: AlertLevel;
  residual_pct: number;
  quality: "ok" | "degraded";
}

// [dashboard-internal] the report feature's response envelope
export interface InspectionReport {
  text: string;
  generatedAt: string; // ISO 8601
  source: "llm" | "mock" | "rule-based";
}
