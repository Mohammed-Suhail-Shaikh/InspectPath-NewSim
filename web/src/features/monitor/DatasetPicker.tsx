import { useViewState, type ReplayDataset } from "../../app/viewState";

const OPTIONS: { value: ReplayDataset; label: string }[] = [
  { value: "kw51_demo", label: "KW51 demo (short)" },
  { value: "kw51", label: "KW51 full" },
  { value: "mock", label: "Mock sample" },
];

// Switches the replay source between Komal's real KW51 datasets and the mock.
export default function DatasetPicker() {
  const { replayDataset, setReplayDataset } = useViewState();

  return (
    <label className="dataset-picker">
      <span className="muted dataset-label">Dataset</span>
      <select
        value={replayDataset}
        onChange={(e) => setReplayDataset(e.target.value as ReplayDataset)}
        aria-label="Replay dataset"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
