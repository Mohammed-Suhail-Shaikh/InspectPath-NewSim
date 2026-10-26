import type { ReactNode } from "react";
import type {
  BridgeSide,
  MetricNode,
  MetricPlan,
  MetricStructure,
} from "../../data/types";
import {
  ELEV_SCALE,
  SIDE_LABEL,
  elevationBounds,
  nodeOnSide,
  project,
  svgHeight,
  svgWidth,
} from "./elevationLayout";

// Side elevation (x-z) of the bridge at true metric scale. Draws the members
// (girder line, arch curve, diagonals) for the selected side, the connection
// stops, and the sensors. Children (route, robot, finding pins) are drawn on
// top in the same coordinate space.
export default function ElevationMap({
  structure,
  plan,
  side,
  children,
}: {
  structure: MetricStructure;
  plan: MetricPlan | null;
  side: BridgeSide;
  children?: ReactNode;
}) {
  const bounds = elevationBounds(structure);
  const w = svgWidth(bounds);
  const h = svgHeight(bounds);

  const nodeById = new Map<number, MetricNode>(
    structure.nodes.map((n) => [n.id, n])
  );

  // Members whose both endpoints are on (or shared with) the selected side.
  const members = structure.members.filter((m) => {
    const a = nodeById.get(m.nodes[0]);
    const b = nodeById.get(m.nodes[1]);
    return a && b && nodeOnSide(a, side) && nodeOnSide(b, side);
  });

  // Stops on the selected side.
  const stops = structure.diagonal_connections.distinct_locations.filter(
    (l) => l.side === side
  );

  // Sensors on the selected side (y matches the side's transverse position).
  const sensors = structure.sensors.filter((s) =>
    side === "A" ? Math.abs(s.y) < 0.5 : Math.abs(s.y - 11.75) < 0.5
  );

  // Route segments for stops on this side, in plan order. The full 3D route
  // spans both sides; here we draw the portion whose stops are on this side.
  const sideStopIds = new Set(stops.map((s) => s.location_id));
  const routePts = (plan?.stops ?? [])
    .filter((s) => sideStopIds.has(s.location_id))
    .map((s) => {
      const { px, py } = project(s.x, s.z, bounds);
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");

  const r = Math.max(4, ELEV_SCALE * 0.6);

  return (
    <svg
      className="elevation-map"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label={`${SIDE_LABEL[side]} elevation of ${structure.name}`}
    >
      {/* members: light technical-drawing lines */}
      {members.map((m) => {
        const a = nodeById.get(m.nodes[0])!;
        const b = nodeById.get(m.nodes[1])!;
        const pa = project(a.x, a.z, bounds);
        const pb = project(b.x, b.z, bounds);
        return (
          <line
            key={`m-${m.id}`}
            x1={pa.px}
            y1={pa.py}
            x2={pb.px}
            y2={pb.py}
            stroke="#c2c9d2"
            strokeWidth={1.2}
          />
        );
      })}

      {/* route polyline for this side (purple, reserved for the route) */}
      {routePts && (
        <polyline
          points={routePts}
          fill="none"
          stroke="var(--route)"
          strokeWidth={1.5}
          strokeOpacity={0.55}
          strokeDasharray="4 3"
        />
      )}

      {/* sensors: small squares, distinguished by a letter, never color alone */}
      {sensors.map((s, i) => {
        const { px, py } = project(s.x, s.z, bounds);
        const letter =
          s.type === "strain" ? "S" : s.type === "acceleration" ? "A" : "D";
        return (
          <g key={`sensor-${i}`}>
            <rect
              x={px - r * 0.5}
              y={py - r * 0.5}
              width={r}
              height={r}
              fill="#ffffff"
              stroke="#5b6676"
              strokeWidth={1}
            />
            <text
              x={px}
              y={py}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={r * 0.9}
              fill="#5b6676"
              aria-hidden="true"
            >
              {letter}
            </text>
            <title>
              {`Sensor ${s.label} (${s.type})`}
            </title>
          </g>
        );
      })}

      {/* connection stops: open circles (findings/robot drawn on top) */}
      {stops.map((l) => {
        const { px, py } = project(l.x, l.z, bounds);
        return (
          <circle
            key={`stop-${l.location_id}`}
            cx={px}
            cy={py}
            r={r * 0.5}
            fill="#ffffff"
            stroke="#8a93a0"
            strokeWidth={1.2}
          >
            <title>{`Connection ${l.location_id} (${l.end})`}</title>
          </circle>
        );
      })}

      {children}
    </svg>
  );
}
