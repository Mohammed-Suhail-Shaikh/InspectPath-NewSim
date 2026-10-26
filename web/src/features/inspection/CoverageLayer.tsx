// Highlights the connection stops already visited by the robot (up to and
// including its current position) on the displayed side. The caller supplies
// the screen coordinates of the visited stops for this side.
export default function CoverageLayer({
  points,
  r,
}: {
  points: { cx: number; cy: number }[];
  r: number;
}) {
  if (points.length === 0) return null;

  return (
    <g className="coverage-layer" aria-hidden="true">
      {points.map((p, i) => (
        <circle
          key={`cov-${i}`}
          cx={p.cx}
          cy={p.cy}
          r={r}
          fill="var(--route-soft)"
        />
      ))}
    </g>
  );
}
