// Contract validators for externally-loaded data (docs/contract.md).
// Each validator returns { ok: true, value } or { ok: false, error } where the
// error names exactly which field is wrong. We never silently guess.

import type {
  AlertLevel,
  Plan,
  PlanStats,
  Structure,
  TriggerRecord,
  Waypoint,
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

// ---- contract §3: structure ----

export function validateStructure(
  data: unknown,
  fileName = "structure"
): ValidationResult<Structure> {
  if (!isObj(data)) return { ok: false, error: `${fileName}: not an object` };

  const simple: [string, boolean][] = [
    ["id", isString(data.id)],
    ["name", isString(data.name)],
    ["width", isNumber(data.width)],
    ["height", isNumber(data.height)],
    ["battery_budget", isNumber(data.battery_budget)],
    ["capture_spacing", isNumber(data.capture_spacing)],
  ];
  for (const [field, pass] of simple) {
    if (!pass) return { ok: false, error: `${fileName}: field "${field}" is missing or invalid` };
  }

  if (!Array.isArray(data.grid) || data.grid.length === 0) {
    return { ok: false, error: `${fileName}: field "grid" must be a non-empty array` };
  }
  for (let r = 0; r < data.grid.length; r++) {
    const row = data.grid[r];
    if (!Array.isArray(row)) {
      return { ok: false, error: `${fileName}: grid row ${r} is not an array` };
    }
    for (let c = 0; c < row.length; c++) {
      if (![0, 1, 2].includes(row[c])) {
        return {
          ok: false,
          error: `${fileName}: grid[${r}][${c}] = ${row[c]} (must be 0, 1, or 2)`,
        };
      }
    }
  }

  const start = data.start;
  if (!isObj(start) || !isNumber(start.x) || !isNumber(start.y)) {
    return { ok: false, error: `${fileName}: field "start" must be { x:number, y:number }` };
  }

  // alert_zone is optional, but if present must be well-formed.
  if (data.alert_zone !== undefined) {
    const az = data.alert_zone;
    if (!isObj(az) || !isNumber(az.x) || !isNumber(az.y) || !isNumber(az.radius)) {
      return {
        ok: false,
        error: `${fileName}: field "alert_zone" must be { x, y, radius } numbers`,
      };
    }
  }

  return { ok: true, value: data as unknown as Structure };
}

// ---- contract §4: plan ----

function validateWaypoint(wp: unknown, where: string): ValidationResult<Waypoint> {
  if (!isObj(wp)) return { ok: false, error: `${where}: waypoint is not an object` };
  const checks: [string, boolean][] = [
    ["id", isString(wp.id)],
    ["x", isNumber(wp.x)],
    ["y", isNumber(wp.y)],
    ["capture", isBool(wp.capture)],
    ["closeup", isBool(wp.closeup)],
  ];
  for (const [field, pass] of checks) {
    if (!pass) return { ok: false, error: `${where}: field "${field}" is missing or invalid` };
  }
  if (wp.zone !== undefined && !isString(wp.zone)) {
    return { ok: false, error: `${where}: field "zone" must be a string when present` };
  }
  return { ok: true, value: wp as unknown as Waypoint };
}

function validateStats(stats: unknown, where: string): ValidationResult<PlanStats> {
  if (!isObj(stats)) return { ok: false, error: `${where}: stats is not an object` };
  const fields = [
    "coverage_pct",
    "priority_coverage_pct",
    "path_length",
    "battery_used",
    "battery_budget",
  ];
  for (const f of fields) {
    if (!isNumber(stats[f])) {
      return { ok: false, error: `${where}: stats."${f}" is missing or invalid` };
    }
  }
  return { ok: true, value: stats as unknown as PlanStats };
}

export function validatePlan(
  data: unknown,
  fileName = "plan"
): ValidationResult<Plan> {
  if (!isObj(data)) return { ok: false, error: `${fileName}: not an object` };
  if (data.plan_type !== "naive" && data.plan_type !== "optimized") {
    return { ok: false, error: `${fileName}: field "plan_type" must be "naive" or "optimized"` };
  }
  if (!Array.isArray(data.waypoints) || data.waypoints.length === 0) {
    return { ok: false, error: `${fileName}: field "waypoints" must be a non-empty array` };
  }
  for (let i = 0; i < data.waypoints.length; i++) {
    const res = validateWaypoint(data.waypoints[i], `${fileName}.waypoints[${i}]`);
    if (!res.ok) return res;
  }
  const statsRes = validateStats(data.stats, fileName);
  if (!statsRes.ok) return statsRes;
  return { ok: true, value: data as unknown as Plan };
}
