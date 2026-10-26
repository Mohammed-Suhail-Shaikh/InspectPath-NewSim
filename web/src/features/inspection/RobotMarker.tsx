import type { Waypoint } from "../../data/types";
import { cellCenter, CELL } from "./mapLayout";

// Robot icon positioned at the current waypoint. CSS transition on cx/cy
// gives smooth movement between grid cells.
export default function RobotMarker({ waypoint }: { waypoint: Waypoint | null }) {
  if (!waypoint) return null;
  const { cx, cy } = cellCenter(waypoint.x, waypoint.y);
  const r = CELL * 0.32;

  return (
    <g className="robot" style={{ transition: "transform 0.4s linear" }}>
      <circle cx={cx} cy={cy} r={r} fill="var(--route)" stroke="#ffffff" strokeWidth={2} />
      {/* simple "scanner" dot */}
      <circle cx={cx} cy={cy} r={r * 0.35} fill="#ffffff" />
      <title>Inspection robot</title>
    </g>
  );
}
