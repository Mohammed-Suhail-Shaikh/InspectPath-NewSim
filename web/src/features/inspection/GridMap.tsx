import type { ReactNode } from "react";
import type { Structure } from "../../data/types";
import {
  CELL,
  PAD,
  cellCenter,
  gridCols,
  gridRows,
  svgHeight,
  svgWidth,
} from "./mapLayout";

const CELL_FILL: Record<number, string> = {
  0: "#1a2029", // inspectable surface
  1: "#39404b", // obstacle / no-fly
  2: "#2a3a2e", // priority zone
};

// Renders the structure grid as SVG and highlights the alert zone.
// Children (coverage, robot, pins) are drawn on top in the same coordinate space.
export default function GridMap({
  structure,
  children,
}: {
  structure: Structure;
  children?: ReactNode;
}) {
  const cols = gridCols(structure);
  const rows = gridRows(structure);
  const w = svgWidth(structure);
  const h = svgHeight(structure);

  return (
    <svg
      className="grid-map"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label={`Grid map of ${structure.name}`}
    >
      {/* cells */}
      {structure.grid.map((row, y) =>
        row.map((cell, x) => (
          <rect
            key={`${x}-${y}`}
            x={PAD + x * CELL}
            y={PAD + y * CELL}
            width={CELL}
            height={CELL}
            fill={CELL_FILL[cell] ?? CELL_FILL[0]}
            stroke="#2a323d"
            strokeWidth={1}
          >
            <title>
              {cell === 1
                ? "Obstacle / no-fly"
                : cell === 2
                ? "Priority zone"
                : "Inspectable surface"}
            </title>
          </rect>
        ))
      )}

      {/* alert zone highlight */}
      {structure.alert_zone && (
        <circle
          cx={cellCenter(structure.alert_zone.x, structure.alert_zone.y).cx}
          cy={cellCenter(structure.alert_zone.x, structure.alert_zone.y).cy}
          r={structure.alert_zone.radius * CELL}
          fill="rgba(229, 72, 77, 0.12)"
          stroke="#e5484d"
          strokeWidth={2}
          strokeDasharray="6 4"
        >
          <title>Alert zone (near the sensor node that raised the alert)</title>
        </circle>
      )}

      {/* bounds guard for empty grids */}
      {cols === 0 || rows === 0 ? (
        <text x={PAD} y={PAD + 16} fill="#9aa4b2">
          No structure grid.
        </text>
      ) : null}

      {children}
    </svg>
  );
}
