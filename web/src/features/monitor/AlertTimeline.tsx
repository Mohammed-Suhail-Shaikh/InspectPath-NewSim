import type { AlertLevel, TriggerRecord } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";
import { levelEntryTimes } from "./monitorMetrics";

const ICON: Record<AlertLevel, string> = {
  normal: "✓",
  watch: "•",
  warning: "!",
  alarm: "!!",
};

const ORDER: AlertLevel[] = ["normal", "watch", "warning", "alarm"];

// Layer 1, item 5: when each level was FIRST reached in this replay (up to the
// current cursor). Levels not yet reached are shown as not reached, so the
// timeline never implies something that has not happened.
export default function AlertTimeline({
  history,
}: {
  history: TriggerRecord[];
}) {
  const entries = levelEntryTimes(history);

  return (
    <section className="alert-timeline" aria-label="Alert timeline">
      <h3 className="chart-title">Alert timeline</h3>
      <ol className="timeline-list">
        {ORDER.map((level) => {
          const ts = entries[level];
          const s = alertStyle(level);
          return (
            <li key={level} className="timeline-item">
              <span
                className="timeline-badge"
                style={{ background: ts ? s.bg : "transparent", borderColor: s.bg }}
                aria-hidden="true"
              >
                {ts ? ICON[level] : ""}
              </span>
              <span className="timeline-level">{s.label}</span>
              <span className="timeline-time muted">
                {ts
                  ? `first reached ${new Date(ts).toLocaleString()}`
                  : "not reached in this replay"}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
