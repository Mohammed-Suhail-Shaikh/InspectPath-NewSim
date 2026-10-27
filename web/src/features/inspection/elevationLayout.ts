import type {
  BridgeSide,
  MetricNode,
  MetricStructure,
} from "../../data/types";

// Shared projection math for the side elevation (x-z plane) at true metric
// scale. x maps left→right with Brussels (low x) on the left on BOTH sides, so
// side A and side C are directly comparable. z maps up, flipped for SVG (screen
// y grows downward).

export const ELEV_PAD = 28; // px padding around the drawing
export const ELEV_SCALE = 6; // px per metre (equal for x and z → true scale)

export interface ElevationBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Bounds over all nodes so both sides share one coordinate frame (comparable).
export function elevationBounds(structure: MetricStructure): ElevationBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const n of structure.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.z < minZ) minZ = n.z;
    if (n.z > maxZ) maxZ = n.z;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 1;
    minZ = 0;
    maxZ = 1;
  }
  return { minX, maxX, minZ, maxZ };
}

export function svgWidth(b: ElevationBounds): number {
  return (b.maxX - b.minX) * ELEV_SCALE + ELEV_PAD * 2;
}

export function svgHeight(b: ElevationBounds): number {
  return (b.maxZ - b.minZ) * ELEV_SCALE + ELEV_PAD * 2;
}

// Project a metric (x, z) to screen px. Brussels (low x) on the left; z up.
export function project(
  x: number,
  z: number,
  b: ElevationBounds
): { px: number; py: number } {
  const px = ELEV_PAD + (x - b.minX) * ELEV_SCALE;
  const py = ELEV_PAD + (b.maxZ - z) * ELEV_SCALE; // flip z for SVG
  return { px, py };
}

// Which structural side a node belongs to, from its y coordinate. Side A is
// y≈0 (South); side C is y≈11.75 (North). Nodes exactly between are treated as
// shared and drawn on both sides.
export function nodeSide(n: MetricNode): BridgeSide | "shared" {
  if (Math.abs(n.y) < 0.01) return "A";
  if (Math.abs(n.y - 11.75) < 0.5) return "C";
  return "shared";
}

export function nodeOnSide(n: MetricNode, side: BridgeSide): boolean {
  const s = nodeSide(n);
  return s === side || s === "shared";
}

// Human-readable label for each side view.
export const SIDE_LABEL: Record<BridgeSide, string> = {
  A: "Side A (South), viewed from the south",
  C: "Side C (North), viewed from the north",
};

// Extra space below the structure (in px) for the dimension line and bearing /
// abutment symbols, which sit just under the girder.
export const ELEV_BOTTOM_PAD = 34;

export function svgHeightWithDims(b: ElevationBounds): number {
  return svgHeight(b) + ELEV_BOTTOM_PAD;
}

// Line weight (px) by member part. Arch and girder read heaviest, deck beams
// medium, diagonals and braces light. Thickness is a DRAWING weight only, not a
// real cross-section (we have no section dimensions in the data).
export function memberWeight(part: string): number {
  if (part.startsWith("arch") || part.startsWith("girder")) return 2.4;
  if (part === "deck_beam") return 1.4;
  return 0.8; // diagonals, braces
}

// Member stroke opacity: let the light members recede a little.
export function memberOpacity(part: string): number {
  if (part.startsWith("arch") || part.startsWith("girder")) return 1;
  if (part === "deck_beam") return 0.85;
  return 0.6;
}

// Diagonal number (1-16) for a connection location, read from its diagonal_ends.
// overview.pdf numbers diagonal 1 at the Leuven end (high x) and 16 at Brussels
// (low x). A location can sit where two diagonals meet; show the lowest number
// so the label is stable and unambiguous.
export function diagonalNumber(
  loc: { diagonal_ends?: { diagonal: number }[] }
): number | null {
  const ds = (loc.diagonal_ends ?? []).map((d) => d.diagonal);
  return ds.length ? Math.min(...ds) : null;
}

// Bearing x-positions (the two abutment lines) from the structure's bearing
// nodes. Returns the distinct x values and the span between the extremes, which
// is the cross-checked bearing span (114.198 m on KW51).
export function bearingSpan(structure: MetricStructure): {
  xs: number[];
  span: number;
} | null {
  const xs = Array.from(
    new Set(
      structure.nodes
        .filter((n) => n.part === "bearing")
        .map((n) => Math.round(n.x * 1000) / 1000)
    )
  ).sort((a, b) => a - b);
  if (xs.length < 2) return null;
  return { xs, span: Math.round((xs[xs.length - 1] - xs[0]) * 1000) / 1000 };
}
