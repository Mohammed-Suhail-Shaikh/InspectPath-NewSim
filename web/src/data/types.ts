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

// [contract §4b] plan type (shared enum for metric plans)
export type PlanType = "naive" | "optimized";

// ---- Contract metric v2 shapes (docs/contract.md §3b, §4b) ----
// Real KW51 geometry at true metric scale, consumed by the elevation map and
// the metric planner output. These live ALONGSIDE the grid shapes above during
// the migration; the grid shapes are removed once no caller remains.

export type BridgeSide = "A" | "C";
export type ConnectionEnd = "deck" | "arch";

// [contract §3b] provenance for derived geometry / plans
export interface Provenance {
  source: string;
  doi: string;
  license: string;
  note?: string;
  derivation?: string; // "derived" on plan files
}

// [contract §3b] a structural node (girder/arch/diagonal vertex)
export interface MetricNode {
  id: number;
  part: string;
  x: number;
  y: number;
  z: number;
}

// [contract §3b] a structural member joining two nodes
export interface MetricMember {
  id: number;
  part: string;
  element_type: string;
  nodes: [number, number];
}

// [contract §3b] one of the 34 distinct diagonal-connection inspection stops
export interface DistinctLocation {
  location_id: string;
  node_id: number;
  side: BridgeSide;
  end: ConnectionEnd;
  x: number;
  y: number;
  z: number;
  diagonal_ends: { diagonal: number; end: ConnectionEnd }[];
}

// [contract §3b] a real sensor on the structure
export interface MetricSensor {
  label: string;
  type: "strain" | "acceleration" | "displacement";
  part: string;
  x: number;
  y: number;
  z: number;
}

// [contract §3b] structure input (metric)
export interface MetricStructure {
  id: string;
  name: string;
  units: "m";
  coordinate_system: string;
  nodes: MetricNode[];
  members: MetricMember[];
  diagonal_connections: {
    distinct_location_count: number;
    distinct_locations: DistinctLocation[];
  };
  sensors: MetricSensor[];
  provenance: Provenance;
}

// [contract §4b] one ordered stop in a metric plan
export interface MetricStop {
  location_id: string;
  x: number;
  y: number;
  z: number;
  order: number;
  reachable: boolean;
}

// [contract §4b] metric plan stats (no priority coverage, no alert-dependent stat)
export interface MetricPlanStats {
  locations_total: number;
  locations_visited: number;
  coverage_pct: number;
  route_length_m: number;
  route_length_note: string;
  energy_per_meter: number;
  battery_used: number;
  battery_budget: number;
  battery_budget_note: string;
  within_budget: boolean;
}

// [contract §4b] planner output (metric)
export interface MetricPlan {
  plan_type: PlanType;
  units: "m";
  stops: MetricStop[];
  stats: MetricPlanStats;
  provenance: Provenance;
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

// [dashboard-internal] joins a map location to a captured image and its defect result.
// Positioned on the metric elevation by location_id/side; the geometry is real
// but the defect result itself is simulated (see defect_source).
export interface Finding {
  id: string;
  location_id: string; // references MetricStop.location_id [contract §4b]
  side: BridgeSide; // which elevation the pin belongs on
  tier: DefectTier; // value set per [contract §1]
  scores: DefectScores; // field set per [contract §1]
  detected: string[]; // per [contract §1]
  image_key: string; // key into ImageMap[structureId] [contract §5]
  has_closeup: boolean; // whether "<image_key>_closeup" exists [contract §5]
  // [dashboard-internal] provenance of the defect result for this finding.
  // "mock" when the live /predict call failed and a mock result was substituted.
  defect_source?: "predict" | "mock";
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
