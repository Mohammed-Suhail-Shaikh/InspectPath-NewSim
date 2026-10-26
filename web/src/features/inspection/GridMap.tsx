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

// Technical-drawing look: white surface, light lines. Obstacle and priority
// cells are distinguished by a neutral pattern, not color (purple is reserved
// for route, robot, and coverage).
const CELL_FILL: Record<number, string> = {
  0: "#ffffff", // inspectable surface
  1: "#e9edf2", // obstacle / no-fly (gray)
  2: "#f4f6f8", // priority zone (very light gray; marked with a dotted outline)
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
      {/* cells: light technical-drawing grid */}
      {structure.grid.map((row, y) =>
        row.map((cell, x) => (
          <rect
            key={`${x}-${y}`}
            x={PAD + x * CELL}
            y={PAD + y * CELL}
            width={CELL}
            height={CELL}
            fill={CELL_FILL[cell] ?? CELL_FILL[0]}
            stroke="#d8dde3"
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

      {/* obstacle cells get a diagonal hatch so they do not rely on fill alone */}
      {structure.grid.map((row, y) =>
        row.map((cell, x) =>
          cell === 1 ? (
            <line
              key={`ob-${x}-${y}`}
              x1={PAD + x * CELL}
              y1={PAD + y * CELL}
              x2={PAD + (x + 1) * CELL}
              y2={PAD + (y + 1) * CELL}
              stroke="#b9c0c9"
              strokeWidth={1}
              aria-hidden="true"
            />
          ) : null
        )
      )}

      {/* priority cells get a neutral dotted gray outline, distinct from the
          obstacle diagonal hatch and not using purple */}
      {structure.grid.map((row, y) =>
        row.map((cell, x) =>
          cell === 2 ? (
            <rect
              key={`pr-${x}-${y}`}
              x={PAD + x * CELL + 2}
              y={PAD + y * CELL + 2}
              width={CELL - 4}
              height={CELL - 4}
              fill="none"
              stroke="#5b6676"
              strokeWidth={1}
              strokeDasharray="2 2"
              aria-hidden="true"
            />
          ) : null
        )
      )}

      {/* alert zone highlight */}
      {structure.alert_zone && (
        <circle
          cx={cellCenter(structure.alert_zone.x, structure.alert_zone.y).cx}
          cy={cellCenter(structure.alert_zone.x, structure.alert_zone.y).cy}
          r={structure.alert_zone.radius * CELL}
          fill="rgba(198, 40, 40, 0.10)"
          stroke="#c62828"
          strokeWidth={2}
          strokeDasharray="6 4"
        >
          <title>Alert zone (near the sensor node that raised the alert)</title>
        </circle>
      )}

      {/* bounds guard for empty grids */}
      {cols === 0 || rows === 0 ? (
        <text x={PAD} y={PAD + 16} fill="#5b6676">
          No structure grid.
        </text>
      ) : null}

      {children}
    </svg>
  );
}
