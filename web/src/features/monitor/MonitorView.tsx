import { useReplay } from "./useReplay";
import AlertHero from "./AlertHero";
import ReadingsPanel from "./ReadingsPanel";
import FrequencyChart from "./FrequencyChart";
import ResidualChart from "./ResidualChart";
import ReplayControls from "./ReplayControls";
import EscalationBanner from "./EscalationBanner";
import DatasetPicker from "./DatasetPicker";
import { useViewState } from "../../app/viewState";

export default function MonitorView() {
  const { current, loading, records, isMock } = useReplay();
  const { replayCursor, replayDataset } = useViewState();

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

  const isKw51 = !isMock && (replayDataset === "kw51_demo" || replayDataset === "kw51");

  // Panel label by source:
  // - mock: never claim real data
  // - KW51 real data: replay of recorded times, not live
  // - other real source: the file's own source label
  const subtitle = isMock
    ? "Replaying sample sensor data (mock)"
    : isKw51
    ? "Replay of real bridge data (KW51, June 2019). Timestamps are recorded times, not live."
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

      {/* DOM order is also the mobile stack order:
          alert level + degraded badge, dispatch banner, readings,
          frequency chart, residual chart. */}
      <AlertHero record={current} />

      <EscalationBanner level={current.alert_level} />

      <ReadingsPanel record={current} />

      <FrequencyChart records={records} upToIndex={index} />

      <ResidualChart records={records} upToIndex={index} />
    </div>
  );
}
