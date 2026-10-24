import type { AlertLevel } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";

export default function AlertBadge({ level }: { level: AlertLevel }) {
  const s = alertStyle(level);
  return (
    <span
      className="alert-badge"
      style={{ background: s.bg, color: s.color }}
      aria-label={`Alert level: ${s.label}`}
    >
      {s.label}
    </span>
  );
}
