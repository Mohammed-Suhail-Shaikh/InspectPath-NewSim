import type { DataSource } from "./source";
import { mockSource } from "./mockSource";
import { realSource } from "./realSource";

// Data-source switch: use the real source when the shared data/ outputs exist,
// otherwise the mock source. Each piece inside realSource still falls back on
// its own, so one missing piece never breaks the others.
//
// Resolution happens once at startup via initDataSource(). Until then, and if
// no real data is present, getDataSource() returns the mock source.

const DATA_BASE =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? "/data";

// The replay file used to detect a real deployment. Matches the default dataset.
const PROBE_FILE = "replay_kw51_demo.json";

let active: DataSource = mockSource;
let initialized = false;

// A real deployment is detected if an expected data/ entry point is reachable
// AND returns JSON. The Vite dev server answers missing files with 200 + an
// HTML SPA fallback, so we must check the content-type, not just res.ok.
// We probe a trigger replay file (the piece that currently ships real data).
async function realDataPresent(): Promise<boolean> {
  try {
    const res = await fetch(`${DATA_BASE}/trigger/${PROBE_FILE}`, { method: "GET" });
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    return contentType.includes("application/json");
  } catch {
    return false;
  }
}

export async function initDataSource(): Promise<DataSource> {
  if (initialized) return active;
  const present = await realDataPresent();
  active = present ? realSource : mockSource;
  initialized = true;
  return active;
}

export function getDataSource(): DataSource {
  return active;
}

// Convenience: whether the active source serves mock data.
export function isMockActive(): boolean {
  return active.isMock;
}
