import type { AlertLevel } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";
import { useViewState } from "../../app/viewState";

// Visible only when alert_level is warning or alarm.
// Plain-language text; never asserts the bridge is unsafe.
export default function EscalationBanner({ level }: { level: AlertLevel }) {
  const { setActiveView } = useViewState();

  if (level !== "warning" && level !== "alarm") return null;

  const s = alertStyle(level);
  const message =
    level === "alarm"
      ? "Alarm level reached. A targeted inspection is strongly recommended."
      : "Warning level reached. Consider dispatching a targeted inspection.";

  return (
    <div
      className="escalation-banner"
      role="alert"
      style={{ background: s.bg, color: s.color }}
    >
      <span className="escalation-text">{message}</span>
      <button
        className="dispatch-btn"
        onClick={() => setActiveView("inspection")}
      >
        Dispatch inspection
      </button>
    </div>
  );
}
