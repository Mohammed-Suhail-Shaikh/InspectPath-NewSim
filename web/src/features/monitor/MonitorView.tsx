import { useReplay } from "./useReplay";
import StatusCard from "./StatusCard";
import SummaryMetrics from "./SummaryMetrics";
import DriftChart from "./DriftChart";
import AlertTimeline from "./AlertTimeline";
import EngineeringSection from "./EngineeringSection";
import ReplayControls from "./ReplayControls";
import DatasetPicker from "./DatasetPicker";
import { currentLevelSince } from "./monitorMetrics";
import { useViewState } from "../../app/viewState";

// Every monitor chart shares ONE time window so the frequency, drift, and
// engineering charts line up (previously the frequency chart used 12 and the
// residual chart 24, showing different spans).
const CHART_WINDOW = 24;

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
          <DatasetPicker isMock={isMock} />
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
  // History up to (and including) the current cursor — the data every panel
  // summarizes. Nothing reads past the cursor.
  const history = records.slice(0, index + 1);
  const since = currentLevelSince(history);

  const isKw51 = !isMock && (replayDataset === "kw51_demo" || replayDataset === "kw51");
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
          <DatasetPicker isMock={isMock} />
          <ReplayControls atEnd={atEnd} />
        </div>
      </div>

      {/* LAYER 1 — summary for anyone. DOM order = mobile stack order. */}
      <StatusCard record={current} since={since} />
      <SummaryMetrics current={current} history={history} />
      <DriftChart records={records} upToIndex={index} window={CHART_WINDOW} />
      <AlertTimeline history={history} />

      {/* LAYER 2 — engineering detail, always visible. */}
      <EngineeringSection
        current={current}
        history={history}
        upToIndex={index}
        window={CHART_WINDOW}
      />
    </div>
  );
}
