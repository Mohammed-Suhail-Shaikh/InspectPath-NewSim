// Collects data-integration warnings (contract validation failures, fallbacks)
// so the UI can surface them clearly instead of silently guessing.
import { useSyncExternalStore } from "react";

export interface DataWarning {
  piece: "replay" | "structure" | "plan" | "defects";
  message: string;
}

let warnings: DataWarning[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function addWarning(w: DataWarning) {
  // De-duplicate identical messages.
  if (warnings.some((x) => x.piece === w.piece && x.message === w.message)) return;
  warnings = [...warnings, w];
  // Log exactly which piece/field is wrong.
  console.warn(`[data:${w.piece}] ${w.message}`);
  emit();
}

export function clearWarnings() {
  if (warnings.length === 0) return;
  warnings = [];
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return warnings;
}

export function useDataWarnings(): DataWarning[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
