import type { Finding, DefectTier } from "../../data/types";
import { TIER_COLOR, TIER_LABEL } from "../../data/tiers";

// Letter per tier so a pin never relies on color alone.
const TIER_LETTER: Record<DefectTier, string> = {
  high: "H",
  medium: "M",
  low: "L",
  none: "",
};

// A map pin for a single simulated finding, colored by tier AND marked with a
// letter. Positioned at the screen px/py of its connection stop (computed by
// the caller from the metric geometry). Clicking selects it.
export default function FindingPin({
  finding,
  cx,
  cy,
  r,
  selected,
  onSelect,
}: {
  finding: Finding;
  cx: number;
  cy: number;
  r: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = TIER_COLOR[finding.tier];
  if (!color) return null; // tier "none" is not pinned

  const radius = r * (selected ? 1.2 : 1);

  // Low tier uses the pale-yellow treatment (light fill, dark-yellow letter and
  // outline) to match Watch. High and medium stay solid with a white letter.
  const isLow = finding.tier === "low";
  const fillColor = isLow ? "#f5e8b8" : color;
  const letterColor = isLow ? "#806500" : "#ffffff";
  const baseStroke = isLow ? "#806500" : "#ffffff";

  return (
    <g
      className="finding-pin"
      onClick={() => onSelect(finding.id)}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`${TIER_LABEL[finding.tier]} priority finding at connection ${finding.location_id}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(finding.id);
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={fillColor}
        stroke={selected ? "#1e293b" : baseStroke}
        strokeWidth={selected ? 3 : 2}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={radius}
        fontWeight="700"
        fill={letterColor}
        aria-hidden="true"
      >
        {TIER_LETTER[finding.tier]}
      </text>
      <title>{TIER_LABEL[finding.tier]} priority finding</title>
    </g>
  );
}
