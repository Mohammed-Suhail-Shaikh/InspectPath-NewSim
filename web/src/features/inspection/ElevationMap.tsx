import type { ReactNode } from "react";
import type {
  BridgeSide,
  MetricNode,
  MetricPlan,
  MetricStructure,
} from "../../data/types";
import {
  ELEV_BOTTOM_PAD,
  ELEV_SCALE,
  SIDE_LABEL,
  bearingSpan,
  diagonalMemberNumbers,
  elevationBounds,
  memberStroke,
  memberWeight,
  nodeOnSide,
  project,
  svgHeightWithDims,
  svgWidth,
} from "./elevationLayout";

// Side elevation (x-z) of the bridge at true metric scale, drawn to read like an
// engineering elevation: line weights by member type (arch/girder heavy, deck
// medium, diagonals light), span and crown dimensions, end labels (Brussels left,
// Leuven right), diagonal numbers (1 Leuven .. 16 Brussels), bearing symbols with
// schematic abutments and canal, and connection stops that fill in as visited.
// Shapes carry meaning without color: circle = arch connection, diamond = deck
// connection, lettered square = sensor. Children (route, robot, finding pins) are
// drawn on top in the same coordinate space.
export default function ElevationMap({
  structure,
  plan,
  side,
  visitedIds,
  robotIndex = -1,
  children,
}: {
  structure: MetricStructure;
  plan: MetricPlan | null;
  side: BridgeSide;
  visitedIds?: Set<string>;
  robotIndex?: number;
  children?: ReactNode;
}) {
  const bounds = elevationBounds(structure);
  const w = svgWidth(bounds);
  const h = svgHeightWithDims(bounds);
  const visited = visitedIds ?? new Set<string>();

  const nodeById = new Map<number, MetricNode>(
    structure.nodes.map((n) => [n.id, n])
  );

  // Members whose both endpoints are on (or shared with) the selected side.
  const members = structure.members.filter((m) => {
    const a = nodeById.get(m.nodes[0]);
    const b = nodeById.get(m.nodes[1]);
    return a && b && nodeOnSide(a, side) && nodeOnSide(b, side);
  });

  // Diagonal number per diagonal member (1 Leuven .. 16 Brussels), so each of
  // the 16 is labeled once at its own midpoint.
  const diagNums = diagonalMemberNumbers(structure, side);

  // Stops on the selected side.
  const stops = structure.diagonal_connections.distinct_locations.filter(
    (l) => l.side === side
  );

  // Sensors on the selected side (y matches the side's transverse position).
  const sensors = structure.sensors.filter((s) =>
    side === "A" ? Math.abs(s.y) < 0.5 : Math.abs(s.y - 11.75) < 0.5
  );

  // Route points for stops on this side, in plan order, each tagged with its
  // order in the FULL route so we can split flown (<= robotIndex) from remaining.
  const sideStopIds = new Set(stops.map((s) => s.location_id));
  const routePoints = (plan?.stops ?? [])
    .filter((s) => sideStopIds.has(s.location_id))
    .map((s) => {
      const { px, py } = project(s.x, s.z, bounds);
      return { order: s.order, pt: `${px.toFixed(1)},${py.toFixed(1)}` };
    });
  // Flown = points at or before the robot; remaining = the rest. Overlap by one
  // point so the two polylines join without a gap. When robotIndex is -1 (no
  // run yet) everything is "remaining".
  const idx = robotIndex;
  const flownPts = routePoints
    .filter((p) => p.order <= idx)
    .map((p) => p.pt)
    .join(" ");
  const remainingPts = routePoints
    .filter((p, i) => p.order >= idx || (i > 0 && routePoints[i - 1].order <= idx))
    .map((p) => p.pt)
    .join(" ");

  const r = Math.max(4, ELEV_SCALE * 0.6);

  // Dimension + end-label geometry.
  const span = bearingSpan(structure);
  const dimY = project(0, bounds.minZ, bounds).py + ELEV_BOTTOM_PAD * 0.55;
  const crownZ = bounds.maxZ;
  // The arch crown point on this side (max-z node on the arch for the side).
  const archNodes = structure.nodes.filter(
    (n) => n.part === `arch_${side}`
  );
  const crownNode = archNodes.reduce<MetricNode | null>(
    (best, n) => (best === null || n.z > best.z ? n : best),
    null
  );

  return (
    <svg
      className="elevation-map"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label={`${SIDE_LABEL[side]} elevation of ${structure.name}`}
    >
      {/* schematic canal band under the deck (context only, not to scale) */}
      <rect
        x={0}
        y={project(0, bounds.minZ, bounds).py + 6}
        width={w}
        height={ELEV_BOTTOM_PAD}
        fill="#eef3f6"
      />

      {/* members: neutral technical-drawing lines, weighted by member type */}
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
            stroke={memberStroke(m.part)}
            strokeWidth={memberWeight(m.part)}
          />
        );
      })}

      {/* bearing symbols (triangles) + schematic abutment blocks at N1..N4 x's */}
      {span &&
        span.xs.map((bx, i) => {
          const base = project(bx, bounds.minZ, bounds);
          const ty = base.py + 4;
          return (
            <g key={`bearing-${i}`}>
              <polygon
                points={`${base.px},${ty} ${base.px - 5},${ty + 8} ${base.px + 5},${ty + 8}`}
                fill="#ffffff"
                stroke="#5b6676"
                strokeWidth={1}
              />
              <rect
                x={base.px - 7}
                y={ty + 8}
                width={14}
                height={ELEV_BOTTOM_PAD * 0.4}
                fill="#e9edf2"
                stroke="#b9c0c9"
                strokeWidth={1}
              />
            </g>
          );
        })}

      {/* span dimension line between the two bearing x-positions (line only;
          its label is drawn with the other labels, on top of everything) */}
      {span && (
        <g>
          {(() => {
            const left = project(span.xs[0], bounds.minZ, bounds).px;
            const right = project(span.xs[span.xs.length - 1], bounds.minZ, bounds).px;
            return (
              <>
                <line x1={left} y1={dimY} x2={right} y2={dimY} stroke="#5b6676" strokeWidth={1} />
                <line x1={left} y1={dimY - 4} x2={left} y2={dimY + 4} stroke="#5b6676" strokeWidth={1} />
                <line x1={right} y1={dimY - 4} x2={right} y2={dimY + 4} stroke="#5b6676" strokeWidth={1} />
              </>
            );
          })()}
        </g>
      )}

      {/* route: a thin white casing underneath so it stays visible where it
          crosses members, then the flown part solid and the remaining part
          lighter + dashed. */}
      {remainingPts && (
        <polyline
          points={remainingPts}
          fill="none"
          stroke="var(--route-casing)"
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {flownPts && (
        <polyline
          points={flownPts}
          fill="none"
          stroke="var(--route-casing)"
          strokeWidth={4.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {remainingPts && (
        <polyline
          points={remainingPts}
          fill="none"
          stroke="var(--route-remaining)"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {flownPts && (
        <polyline
          points={flownPts}
          fill="none"
          stroke="var(--route-flown)"
          strokeWidth={2.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* sensors: small lettered squares, never color alone */}
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
              fill="var(--map-sensor)"
              stroke="var(--map-sensor)"
              strokeWidth={1}
            />
            <text
              x={px}
              y={py}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={r * 0.82}
              fontWeight={600}
              fill="#ffffff"
              aria-hidden="true"
            >
              {letter}
            </text>
            <title>{`Sensor ${s.label} (${s.type})`}</title>
          </g>
        );
      })}

      {/* connection stops: circle = arch, diamond = deck (shape, not color).
          Filled when visited, hollow before. Diagonal number shown beside. */}
      {stops.map((l) => {
        const { px, py } = project(l.x, l.z, bounds);
        const isVisited = visited.has(l.location_id);
        // Visited: filled route-purple with a white ring (casing drawn first,
        // slightly larger). Unvisited: hollow dark-gray outline.
        const fill = isVisited ? "var(--route-flown)" : "#ffffff";
        const stroke = isVisited ? "var(--route-casing)" : "var(--map-stop-unvisited)";
        const sw = isVisited ? 1.6 : 1.2;
        const marker =
          l.end === "deck" ? (
            // diamond for deck connections
            <polygon
              points={`${px},${py - r * 0.6} ${px + r * 0.6},${py} ${px},${py + r * 0.6} ${px - r * 0.6},${py}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={sw}
            />
          ) : (
            // circle for arch connections
            <circle cx={px} cy={py} r={r * 0.5} fill={fill} stroke={stroke} strokeWidth={sw} />
          );
        return (
          <g key={`stop-${l.location_id}`}>
            {marker}
            <title>
              {`Connection ${l.location_id} (${l.end})${isVisited ? " — visited" : ""}`}
            </title>
          </g>
        );
      })}

      {children}

      {/* ALL text labels last, each with a white halo (.map-label), so route
          and member lines drawn underneath can never obscure or clip them. */}
      {members.map((m) => {
        const num = diagNums.get(m.id);
        if (num === undefined) return null;
        const a = nodeById.get(m.nodes[0])!;
        const b = nodeById.get(m.nodes[1])!;
        const pa = project(a.x, a.z, bounds);
        const pb = project(b.x, b.z, bounds);
        return (
          <text
            key={`dn-${m.id}`}
            className="map-label"
            x={(pa.px + pb.px) / 2}
            y={(pa.py + pb.py) / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
          >
            {num}
          </text>
        );
      })}

      {span && (
        <text
          className="map-label"
          x={(project(span.xs[0], bounds.minZ, bounds).px +
            project(span.xs[span.xs.length - 1], bounds.minZ, bounds).px) / 2}
          y={dimY - 5}
          textAnchor="middle"
          fontSize={10}
        >
          {`bearing span ${span.span} m`}
        </text>
      )}

      {crownNode && (
        <text
          className="map-label"
          x={project(crownNode.x, crownNode.z, bounds).px}
          y={project(crownNode.x, crownNode.z, bounds).py - 6}
          textAnchor="middle"
          fontSize={10}
        >
          {`crown ${crownZ.toFixed(1)} m`}
        </text>
      )}

      <text className="map-label" x={ELEV_SCALE} y={14} fontSize={10}>
        Brussels
      </text>
      <text className="map-label" x={w - ELEV_SCALE} y={14} textAnchor="end" fontSize={10}>
        Leuven
      </text>
    </svg>
  );
}
