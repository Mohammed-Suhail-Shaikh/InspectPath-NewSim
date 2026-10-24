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

let active: DataSource = mockSource;
let initialized = false;

// A real deployment is detected if any expected data/ entry point is reachable.
// We probe the image map (small, always present once data/ exists).
async function realDataPresent(): Promise<boolean> {
  try {
    const res = await fetch(`${DATA_BASE}/image_map.json`, { method: "GET" });
    return res.ok;
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
