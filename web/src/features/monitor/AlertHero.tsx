import type { AlertLevel, TriggerRecord } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";
import QualityBadge from "./QualityBadge";

// A small glyph per level so the level never relies on color alone.
const LEVEL_ICON: Record<AlertLevel, string> = {
  normal: "✓",
  watch: "•",
  warning: "!",
  alarm: "!!",
};

// The hero of the monitor view: the current alert level is the single most
// prominent element. It describes the BRIDGE.
// The "node degraded" badge sits beside it, clearly separate, because it
// describes the SENSOR, not the bridge.
export default function AlertHero({ record }: { record: TriggerRecord }) {
  const level = record.alert_level;
  const s = alertStyle(level);

  return (
    <section className="alert-hero" aria-label={`Current alert level: ${s.label}`}>
      <div
        className={`alert-hero-main alert-hero-${level}`}
        style={{ borderColor: s.bg }}
      >
        <span className="alert-hero-label">Current alert level</span>
        <span className="alert-hero-value" style={{ color: s.bg }}>
          <span className="alert-hero-icon" aria-hidden="true">
            {LEVEL_ICON[level]}
          </span>
          {s.label}
        </span>
      </div>

      <div className="alert-hero-aside">
        <QualityBadge quality={record.quality} />
      </div>
    </section>
  );
}
