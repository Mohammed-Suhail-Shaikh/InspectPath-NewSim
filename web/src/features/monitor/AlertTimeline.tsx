import type { AlertLevel, TriggerRecord } from "../../data/types";
import { alertStyle } from "../../data/alertLevels";
import { levelEntryTimes, fmtUtc } from "./monitorMetrics";

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
      <h3 className="chart-title">Alert timeline (times in UTC)</h3>
      <ol className="timeline-row">
        {ORDER.map((level, idx) => {
          const ts = entries[level];
          const s = alertStyle(level);
          return (
            <li key={level} className="timeline-step">
              {idx > 0 && <span className="timeline-arrow" aria-hidden="true">→</span>}
              <div className="timeline-step-body">
                <span
                  className="timeline-badge"
                  style={{ background: ts ? s.bg : "transparent", borderColor: s.bg }}
                  aria-hidden="true"
                >
                  {ts ? ICON[level] : ""}
                </span>
                <span className="timeline-level">{s.label}</span>
                <span className="timeline-time muted">
                  {ts ? fmtUtc(ts) : "not reached"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
