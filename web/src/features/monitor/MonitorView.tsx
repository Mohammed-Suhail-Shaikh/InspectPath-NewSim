import { useReplay } from "./useReplay";
import ReadingsPanel from "./ReadingsPanel";

export default function MonitorView() {
  const { current, loading, records } = useReplay("z24");

  if (loading) {
    return <p className="placeholder">Loading monitor…</p>;
  }
  if (!current || records.length === 0) {
    return <p className="placeholder">No monitor data available.</p>;
  }

  return (
    <div className="monitor">
      <h2 className="view-title">Bridge monitor</h2>
      <p className="muted">
        Replaying sensor node readings as if live ({current.source}).
      </p>

      <ReadingsPanel record={current} />

      {/* Frequency chart added in task 7 */}
      {/* Escalation banner added in task 8 */}
    </div>
  );
}
