import type { Finding } from "../../data/types";
import { TIER_COLOR, TIER_LABEL } from "../../data/tiers";
import { cellCenter, CELL } from "./mapLayout";

// A map pin for a single finding, colored by tier. Clicking selects it.
export default function FindingPin({
  finding,
  selected,
  onSelect,
}: {
  finding: Finding;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = TIER_COLOR[finding.tier];
  if (!color) return null; // tier "none" is not pinned

  const { cx, cy } = cellCenter(finding.x, finding.y);
  const r = CELL * (selected ? 0.3 : 0.24);

  return (
    <g
      className="finding-pin"
      onClick={() => onSelect(finding.id)}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`${TIER_LABEL[finding.tier]} priority finding at column ${finding.x}, row ${finding.y}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(finding.id);
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        stroke={selected ? "#ffffff" : "#06213f"}
        strokeWidth={selected ? 3 : 2}
      />
      <title>
        {TIER_LABEL[finding.tier]} priority finding
      </title>
    </g>
  );
}
