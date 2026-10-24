import { useReplay } from "./useReplay";
import ReadingsPanel from "./ReadingsPanel";
import FrequencyChart from "./FrequencyChart";
import ReplayControls from "./ReplayControls";
import EscalationBanner from "./EscalationBanner";
import { useViewState } from "../../app/viewState";

export default function MonitorView() {
  const { current, loading, records } = useReplay("z24");
  const { replayCursor } = useViewState();

  if (loading) {
    return <p className="placeholder">Loading monitor…</p>;
  }
  if (!current || records.length === 0) {
    return <p className="placeholder">No monitor data available.</p>;
  }

  const index = Math.min(replayCursor, records.length - 1);
  const atEnd = index >= records.length - 1;

  return (
    <div className="monitor">
      <div className="monitor-head">
        <div>
          <h2 className="view-title">Bridge monitor</h2>
          <p className="muted">
            Replaying sensor node readings as if live ({current.source}).
          </p>
        </div>
        <ReplayControls atEnd={atEnd} />
      </div>

      <EscalationBanner level={current.alert_level} />

      <ReadingsPanel record={current} />

      <FrequencyChart records={records} upToIndex={index} />
    </div>
  );
}
