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

// Single letter per tier (used on map pins, where space is tight).
export const TIER_LETTER: Record<DefectTier, string> = {
  high: "H",
  medium: "M",
  low: "L",
  none: "",
};

// Letter-in-parens plus the word, e.g. "(H) High". Used anywhere there is room
// for the full chip (strip, finding detail, legend). Never color-alone.
export function tierChipText(tier: DefectTier): string {
  if (tier === "none") return TIER_LABEL.none;
  return `(${TIER_LETTER[tier]}) ${TIER_LABEL[tier]}`;
}

// Count imaged findings by tier and render a plain-language, color-independent
// summary, e.g. "1 high, 1 medium, 2 low (4 imaged for demonstration)". Shared
// by the stats panel and the rule-based report so the wording stays identical.
export function findingTierCounts(
  findings: { tier: DefectTier }[]
): Record<Exclude<DefectTier, "none">, number> {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.tier === "high" || f.tier === "medium" || f.tier === "low") {
      counts[f.tier] += 1;
    }
  }
  return counts;
}

export function findingsSummaryText(findings: { tier: DefectTier }[]): string {
  const counts = findingTierCounts(findings);
  const parts: string[] = [];
  if (counts.high) parts.push(`${counts.high} high`);
  if (counts.medium) parts.push(`${counts.medium} medium`);
  if (counts.low) parts.push(`${counts.low} low`);
  const body = parts.length > 0 ? parts.join(", ") : "none";
  return `${body} (${findings.length} imaged for demonstration)`;
}
