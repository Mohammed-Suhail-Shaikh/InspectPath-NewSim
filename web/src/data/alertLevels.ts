import type { AlertLevel } from "./types";

interface AlertLevelStyle {
  label: string;
  color: string; // text/icon color
  bg: string; // background for badges/banners
}

// Distinct, clearly distinguishable color per level.
// Colors are a dashboard presentation choice; the level values are from contract §2.
export const ALERT_LEVELS: Record<AlertLevel, AlertLevelStyle> = {
  normal: { label: "Normal", color: "#0b3d1f", bg: "#3ddc84" },
  watch: { label: "Watch", color: "#3d2f00", bg: "#ffd23f" },
  warning: { label: "Warning", color: "#3d1f00", bg: "#ff8c42" },
  alarm: { label: "Alarm", color: "#ffffff", bg: "#e5484d" },
};

export function alertStyle(level: AlertLevel): AlertLevelStyle {
  return ALERT_LEVELS[level];
}
