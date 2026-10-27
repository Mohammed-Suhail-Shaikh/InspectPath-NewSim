// Robot icon positioned at the current stop's screen coordinates. The caller
// computes px/py from the metric geometry. Returns null when the current stop
// is not on the displayed side.
export default function RobotMarker({
  cx,
  cy,
  r,
}: {
  cx: number | null;
  cy: number | null;
  r: number;
}) {
  if (cx === null || cy === null) return null;

  // Larger than a stop, with a white outline so it reads over the route and the
  // structure. Fill is the solid flown-route purple.
  const rr = r * 1.25;
  return (
    <g className="robot">
      <circle cx={cx} cy={cy} r={rr} fill="var(--route-flown)" stroke="var(--route-casing)" strokeWidth={2.5} />
      {/* scanner dot */}
      <circle cx={cx} cy={cy} r={rr * 0.35} fill="var(--route-casing)" />
      <title>Inspection robot</title>
    </g>
  );
}
