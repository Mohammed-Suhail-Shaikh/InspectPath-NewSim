import { useViewState, type ReplayDataset } from "../../app/viewState";

const OPTIONS: { value: ReplayDataset; label: string }[] = [
  { value: "kw51_demo", label: "KW51 demo (short)" },
  { value: "kw51", label: "KW51 full" },
  { value: "mock", label: "Mock sample" },
];

// Switches the replay source between Komal's real KW51 datasets and the mock.
// `isMock` is the TRUTH about what is actually playing: when a real KW51 dataset
// is selected but its data could not load, the active source fell back to the
// mock. In that case the picker must not pretend the real dataset is playing.
export default function DatasetPicker({ isMock }: { isMock: boolean }) {
  const { replayDataset, setReplayDataset } = useViewState();

  // A real dataset is selected but mock data is actually playing.
  const realSelectedButMock = isMock && replayDataset !== "mock";

  return (
    <label className="dataset-picker">
      <span className="muted dataset-label">Dataset</span>
      <select
        value={replayDataset}
        onChange={(e) => setReplayDataset(e.target.value as ReplayDataset)}
        aria-label="Replay dataset"
      >
        {OPTIONS.map((o) => {
          // Don't show a real dataset name as if it were loaded when it isn't.
          const label =
            realSelectedButMock && o.value === replayDataset
              ? `${o.label} — not loaded, showing sample`
              : o.label;
          return (
            <option key={o.value} value={o.value}>
              {label}
            </option>
          );
        })}
      </select>
      {realSelectedButMock && (
        <span className="dataset-fallback-note" role="status">
          Sample data is playing. The selected dataset could not be loaded.
        </span>
      )}
    </label>
  );
}
