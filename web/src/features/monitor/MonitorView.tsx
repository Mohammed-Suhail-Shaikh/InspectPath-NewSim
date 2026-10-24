import { useReplay } from "./useReplay";
import ReadingsPanel from "./ReadingsPanel";
import FrequencyChart from "./FrequencyChart";
import ReplayControls from "./ReplayControls";
import EscalationBanner from "./EscalationBanner";
import DatasetPicker from "./DatasetPicker";
import { useViewState } from "../../app/viewState";

export default function MonitorView() {
  const { current, loading, records, isMock } = useReplay();
  const { replayCursor } = useViewState();

  if (loading) {
    return (
      <div className="monitor">
        <div className="monitor-head">
          <div>
            <h2 className="view-title">Bridge monitor</h2>
          </div>
          <DatasetPicker />
        </div>
        <p className="placeholder">Loading monitor…</p>
      </div>
    );
  }
  if (!current || records.length === 0) {
    return <p className="placeholder">No monitor data available.</p>;
  }

  const index = Math.min(replayCursor, records.length - 1);
  const atEnd = index >= records.length - 1;

  // Never claim real data while on mocks. When a real file is loaded, use its
  // own "source" field in the subtitle.
  const subtitle = isMock
    ? "Replaying sample sensor data (mock)"
    : `Replaying sensor node readings as if live (${current.source}).`;

  return (
    <div className="monitor">
      <div className="monitor-head">
        <div>
          <h2 className="view-title">Bridge monitor</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="monitor-controls">
          <DatasetPicker />
          <ReplayControls atEnd={atEnd} />
        </div>
      </div>

      <EscalationBanner level={current.alert_level} />

      <ReadingsPanel record={current} />

      <FrequencyChart records={records} upToIndex={index} />
    </div>
  );
}
