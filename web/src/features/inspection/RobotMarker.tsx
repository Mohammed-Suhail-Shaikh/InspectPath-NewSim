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

  return (
    <g className="robot">
      <circle cx={cx} cy={cy} r={r} fill="var(--route)" stroke="#ffffff" strokeWidth={2} />
      {/* simple "scanner" dot */}
      <circle cx={cx} cy={cy} r={r * 0.35} fill="#ffffff" />
      <title>Inspection robot</title>
    </g>
  );
}
