import type { DefectTier } from "./types";

// Tier -> pin color. Colors are a dashboard presentation choice;
// the tier values are from contract §1.
export const TIER_COLOR: Record<DefectTier, string | null> = {
  high: "#e5484d", // red
  medium: "#ff8c42", // amber
  low: "#ffd23f", // yellow
  none: null, // not pinned
};

export const TIER_LABEL: Record<DefectTier, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};
