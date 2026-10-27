import type { AlertLevel, TriggerRecord } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";
import { useViewState } from "../../app/viewState";
import { THRESHOLDS, fmtUtc } from "./monitorMetrics";

// Glyph per level so level never relies on color alone.
const LEVEL_ICON: Record<AlertLevel, string> = {
  normal: "✓",
  watch: "•",
  warning: "!",
  alarm: "!!",
};

// Plain-language recommendation per level (matches the old escalation banner).
const RECOMMENDATION: Record<AlertLevel, string> = {
  normal: "No action needed. Monitoring continues.",
  watch: "Keep watching. No inspection needed yet.",
  warning: "Consider dispatching a targeted inspection.",
  alarm: "A targeted inspection is strongly recommended.",
};

// One plain sentence with DIRECTION: faster or slower than expected, by how
// much, and what a shift that size can mean. Uses the signed residual so the
// direction is honest (positive = faster than predicted).
function directionSentence(residualPct: number): string {
  const mag = Math.abs(residualPct).toFixed(2);
  if (Math.abs(residualPct) < THRESHOLDS.watch) {
    return `The bridge is vibrating within ${mag}% of what is expected for the recorded temperature, which is normal.`;
  }
  const dir = residualPct > 0 ? "faster" : "slower";
  return (
    `The bridge is vibrating ${mag}% ${dir} than expected for the recorded temperature. ` +
    "A shift this size can mean the structure has changed."
  );
}

// Layer 1, item 1: one status card for a non-technical viewer. Replaces the
// alert hero and the red escalation banner. Shows the level, since when, a
// plain direction sentence, the recommendation, and (for watch/warning/alarm)
// the Dispatch inspection button. Normal is a calm version with no button.
// Item 2: a context note that the June 2019 demo falls in KW51's retrofit period.
export default function StatusCard({
  record,
  since,
}: {
  record: TriggerRecord;
  since: string | null;
}) {
  const { setActiveView } = useViewState();
  const level = record.alert_level;
  const s = alertStyle(level);
  const showDispatch = level === "warning" || level === "alarm";

  return (
    <section
      className={`status-card status-card-${level}`}
      aria-label={`Bridge status: ${s.label}`}
      style={{ borderColor: s.bg }}
    >
      <div className="status-card-head">
        <span className="status-level" style={{ color: s.bg }}>
          <span className="status-icon" aria-hidden="true">
            {LEVEL_ICON[level]}
          </span>
          {s.label}
        </span>
        {since && (
          <span className="status-since muted">since {fmtUtc(since)}</span>
        )}
      </div>

      <p className="status-sentence">{directionSentence(record.residual_pct)}</p>

      <p className="status-recommendation">{RECOMMENDATION[level]}</p>

      {showDispatch && (
        <button
          className="btn-primary status-dispatch"
          onClick={() => setActiveView("inspection")}
        >
          Dispatch inspection
        </button>
      )}

      <p className="status-context muted">
        Context: this demo replays recorded KW51 data from June 2019, which falls
        inside the bridge's retrofit period (May to September 2019). Shifts in
        this window may reflect the retrofit work, not damage.
      </p>
    </section>
  );
}
