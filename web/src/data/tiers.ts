import type { DefectTier } from "./types";

// Tier -> pin color. Colors are a dashboard presentation choice;
// the tier values are from contract §1.
// Hex values match the design tokens in .kiro/steering/design.md.
export const TIER_COLOR: Record<DefectTier, string | null> = {
  high: "#c62828", // red
  medium: "#9e5200", // amber
  low: "#806500", // yellow
  none: null, // not pinned
};

export const TIER_LABEL: Record<DefectTier, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};
