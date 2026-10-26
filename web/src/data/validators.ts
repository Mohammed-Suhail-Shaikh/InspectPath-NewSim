// Contract validators for externally-loaded data (docs/contract.md).
// Each validator returns { ok: true, value } or { ok: false, error } where the
// error names exactly which field is wrong. We never silently guess.

import type {
  AlertLevel,
  BridgeSide,
  ConnectionEnd,
  MetricPlan,
  MetricStructure,
  Provenance,
  TriggerRecord,
} from "./types";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ALERT_LEVELS: AlertLevel[] = ["normal", "watch", "warning", "alarm"];
const QUALITY = ["ok", "degraded"];

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---- contract §2: trigger replay (array of records) ----

export function validateTriggerRecord(
  rec: unknown,
  where: string
): ValidationResult<TriggerRecord> {
  if (!isObj(rec)) return { ok: false, error: `${where}: record is not an object` };
  const checks: [string, boolean][] = [
    ["node_id", isString(rec.node_id)],
    ["timestamp", isString(rec.timestamp)],
    ["temperature_c", isNumber(rec.temperature_c)],
    ["frequency_hz", isNumber(rec.frequency_hz)],
    ["predicted_frequency_hz", isNumber(rec.predicted_frequency_hz)],
    ["residual_pct", isNumber(rec.residual_pct)],
    ["alert_level", isString(rec.alert_level) && ALERT_LEVELS.includes(rec.alert_level as AlertLevel)],
    ["quality", isString(rec.quality) && QUALITY.includes(rec.quality as string)],
    ["source", isString(rec.source)],
  ];
  for (const [field, pass] of checks) {
    if (!pass) {
      return { ok: false, error: `${where}: field "${field}" is missing or invalid` };
    }
  }
  return { ok: true, value: rec as unknown as TriggerRecord };
}

export function validateReplay(
  data: unknown,
  fileName = "replay"
): ValidationResult<TriggerRecord[]> {
  if (!Array.isArray(data)) {
    return { ok: false, error: `${fileName}: expected a JSON array of records` };
  }
  if (data.length === 0) {
    return { ok: false, error: `${fileName}: array is empty` };
  }
  for (let i = 0; i < data.length; i++) {
    const res = validateTriggerRecord(data[i], `${fileName}[${i}]`);
    if (!res.ok) return res;
  }
  return { ok: true, value: data as TriggerRecord[] };
}

// ---- contract §3b: metric structure ----

const SIDES: BridgeSide[] = ["A", "C"];
const ENDS: ConnectionEnd[] = ["deck", "arch"];
const SENSOR_TYPES = ["strain", "acceleration", "displacement"];

function validateProvenance(p: unknown, where: string): ValidationResult<Provenance> {
  if (!isObj(p)) return { ok: false, error: `${where}: provenance is not an object` };
  for (const field of ["source", "doi", "license"]) {
    if (!isString(p[field])) {
      return { ok: false, error: `${where}: provenance."${field}" is missing or invalid` };
    }
  }
  return { ok: true, value: p as unknown as Provenance };
}

function xyz(obj: Record<string, unknown>): boolean {
  return isNumber(obj.x) && isNumber(obj.y) && isNumber(obj.z);
}

export function validateMetricStructure(
  data: unknown,
  fileName = "metric structure"
): ValidationResult<MetricStructure> {
  if (!isObj(data)) return { ok: false, error: `${fileName}: not an object` };

  if (!isString(data.id)) return { ok: false, error: `${fileName}: field "id" is missing or invalid` };
  if (!isString(data.name)) return { ok: false, error: `${fileName}: field "name" is missing or invalid` };
  if (data.units !== "m") return { ok: false, error: `${fileName}: field "units" must be "m"` };
  if (!isString(data.coordinate_system)) {
    return { ok: false, error: `${fileName}: field "coordinate_system" is missing or invalid` };
  }

  if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
    return { ok: false, error: `${fileName}: field "nodes" must be a non-empty array` };
  }
  for (let i = 0; i < data.nodes.length; i++) {
    const n = data.nodes[i];
    if (!isObj(n) || !isNumber(n.id) || !isString(n.part) || !xyz(n)) {
      return { ok: false, error: `${fileName}: nodes[${i}] must be { id, part, x, y, z }` };
    }
  }

  if (!Array.isArray(data.members) || data.members.length === 0) {
    return { ok: false, error: `${fileName}: field "members" must be a non-empty array` };
  }
  for (let i = 0; i < data.members.length; i++) {
    const m = data.members[i];
    if (
      !isObj(m) ||
      !isNumber(m.id) ||
      !isString(m.part) ||
      !isString(m.element_type) ||
      !Array.isArray(m.nodes) ||
      m.nodes.length !== 2 ||
      !isNumber(m.nodes[0]) ||
      !isNumber(m.nodes[1])
    ) {
      return {
        ok: false,
        error: `${fileName}: members[${i}] must be { id, part, element_type, nodes:[n1,n2] }`,
      };
    }
  }

  const dc = data.diagonal_connections;
  if (!isObj(dc)) {
    return { ok: false, error: `${fileName}: field "diagonal_connections" is missing or invalid` };
  }
  if (!isNumber(dc.distinct_location_count)) {
    return { ok: false, error: `${fileName}: diagonal_connections.distinct_location_count must be a number` };
  }
  if (!Array.isArray(dc.distinct_locations) || dc.distinct_locations.length === 0) {
    return { ok: false, error: `${fileName}: diagonal_connections.distinct_locations must be a non-empty array` };
  }
  if (dc.distinct_locations.length !== dc.distinct_location_count) {
    return {
      ok: false,
      error: `${fileName}: distinct_locations length (${dc.distinct_locations.length}) != distinct_location_count (${dc.distinct_location_count})`,
    };
  }
  for (let i = 0; i < dc.distinct_locations.length; i++) {
    const loc = dc.distinct_locations[i];
    const w = `${fileName}: distinct_locations[${i}]`;
    if (!isObj(loc)) return { ok: false, error: `${w} is not an object` };
    if (!isString(loc.location_id)) return { ok: false, error: `${w}.location_id is missing or invalid` };
    if (!isNumber(loc.node_id)) return { ok: false, error: `${w}.node_id is missing or invalid` };
    if (!isString(loc.side) || !SIDES.includes(loc.side as BridgeSide)) {
      return { ok: false, error: `${w}.side must be "A" or "C"` };
    }
    if (!isString(loc.end) || !ENDS.includes(loc.end as ConnectionEnd)) {
      return { ok: false, error: `${w}.end must be "deck" or "arch"` };
    }
    if (!xyz(loc)) return { ok: false, error: `${w} must have numeric x, y, z` };
    if (!Array.isArray(loc.diagonal_ends) || loc.diagonal_ends.length === 0) {
      return { ok: false, error: `${w}.diagonal_ends must be a non-empty array` };
    }
  }

  if (!Array.isArray(data.sensors) || data.sensors.length === 0) {
    return { ok: false, error: `${fileName}: field "sensors" must be a non-empty array` };
  }
  for (let i = 0; i < data.sensors.length; i++) {
    const s = data.sensors[i];
    if (
      !isObj(s) ||
      !isString(s.label) ||
      !isString(s.type) ||
      !SENSOR_TYPES.includes(s.type as string) ||
      !isString(s.part) ||
      !xyz(s)
    ) {
      return {
        ok: false,
        error: `${fileName}: sensors[${i}] must be { label, type(strain|acceleration|displacement), part, x, y, z }`,
      };
    }
  }

  const prov = validateProvenance(data.provenance, fileName);
  if (!prov.ok) return prov;

  return { ok: true, value: data as unknown as MetricStructure };
}

// ---- contract §4b: metric plan ----

export function validateMetricPlan(
  data: unknown,
  fileName = "metric plan"
): ValidationResult<MetricPlan> {
  if (!isObj(data)) return { ok: false, error: `${fileName}: not an object` };
  if (data.plan_type !== "naive" && data.plan_type !== "optimized") {
    return { ok: false, error: `${fileName}: field "plan_type" must be "naive" or "optimized"` };
  }
  if (data.units !== "m") return { ok: false, error: `${fileName}: field "units" must be "m"` };

  if (!Array.isArray(data.stops) || data.stops.length === 0) {
    return { ok: false, error: `${fileName}: field "stops" must be a non-empty array` };
  }
  for (let i = 0; i < data.stops.length; i++) {
    const s = data.stops[i];
    if (
      !isObj(s) ||
      !isString(s.location_id) ||
      !xyz(s) ||
      !isNumber(s.order) ||
      !isBool(s.reachable)
    ) {
      return {
        ok: false,
        error: `${fileName}: stops[${i}] must be { location_id, x, y, z, order, reachable }`,
      };
    }
  }

  const stats = data.stats;
  if (!isObj(stats)) return { ok: false, error: `${fileName}: stats is not an object` };
  const numericStats = [
    "locations_total",
    "locations_visited",
    "coverage_pct",
    "route_length_m",
    "energy_per_meter",
    "battery_used",
    "battery_budget",
  ];
  for (const f of numericStats) {
    if (!isNumber(stats[f])) {
      return { ok: false, error: `${fileName}: stats."${f}" is missing or invalid` };
    }
  }
  if (!isString(stats.route_length_note)) {
    return { ok: false, error: `${fileName}: stats."route_length_note" is missing or invalid` };
  }
  if (!isString(stats.battery_budget_note)) {
    return { ok: false, error: `${fileName}: stats."battery_budget_note" is missing or invalid` };
  }
  if (!isBool(stats.within_budget)) {
    return { ok: false, error: `${fileName}: stats."within_budget" is missing or invalid` };
  }

  const prov = validateProvenance(data.provenance, fileName);
  if (!prov.ok) return prov;

  return { ok: true, value: data as unknown as MetricPlan };
}
