import type { AlertLevel } from "./types";

interface AlertLevelStyle {
  label: string;
  color: string; // text/icon color
  bg: string; // background for badges/banners
}

// Distinct, clearly distinguishable color per level.
// Colors are a dashboard presentation choice; the level values are from contract §2.
// Hex values match the design tokens in .kiro/steering/design.md. `bg` is the
// meaning color, `color` is the text color that meets AA on that background.
export const ALERT_LEVELS: Record<AlertLevel, AlertLevelStyle> = {
  normal: { label: "Normal", color: "#ffffff", bg: "#2e7d32" },
  watch: { label: "Watch", color: "#ffffff", bg: "#806500" },
  warning: { label: "Warning", color: "#ffffff", bg: "#9e5200" },
  alarm: { label: "Alarm", color: "#ffffff", bg: "#c62828" },
};

export function alertStyle(level: AlertLevel): AlertLevelStyle {
  return ALERT_LEVELS[level];
}
