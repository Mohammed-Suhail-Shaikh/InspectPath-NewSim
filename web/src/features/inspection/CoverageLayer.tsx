import type { Waypoint } from "../../data/types";
import { CELL, PAD } from "./mapLayout";

// Shades cells covered by the route up to (and including) the robot's current
// position. Updates as the robot advances.
export default function CoverageLayer({
  waypoints,
  upToIndex,
}: {
  waypoints: Waypoint[];
  upToIndex: number;
}) {
  if (waypoints.length === 0) return null;

  const end = Math.min(upToIndex + 1, waypoints.length);
  // De-duplicate covered cells so overlapping visits don't stack opacity.
  const seen = new Set<string>();
  const covered: { x: number; y: number }[] = [];
  for (let i = 0; i < end; i++) {
    const w = waypoints[i];
    const key = `${w.x}-${w.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      covered.push({ x: w.x, y: w.y });
    }
  }

  return (
    <g className="coverage-layer" aria-hidden="true">
      {covered.map((c) => (
        <rect
          key={`cov-${c.x}-${c.y}`}
          x={PAD + c.x * CELL}
          y={PAD + c.y * CELL}
          width={CELL}
          height={CELL}
          fill="rgba(90, 169, 255, 0.28)"
        />
      ))}
    </g>
  );
}
