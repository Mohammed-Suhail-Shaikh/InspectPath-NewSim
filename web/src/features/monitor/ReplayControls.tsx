import { useViewState, type ReplaySpeed } from "../../app/viewState";

const SPEEDS: ReplaySpeed[] = [1, 5, 20];

// Speed control (1x / 5x / 20x, default 1x ~= 2 records/sec) plus play/restart.
export default function ReplayControls({ atEnd }: { atEnd: boolean }) {
  const {
    replaySpeed,
    setReplaySpeed,
    replayRunning,
    setReplayRunning,
    setReplayCursor,
    setAlertHistory,
  } = useViewState();

  function restart() {
    setReplayCursor(0);
    setAlertHistory([]);
    setReplayRunning(true);
  }

  return (
    <div className="replay-controls">
      <div className="speed-group" role="group" aria-label="Replay speed">
        <span className="muted speed-label">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={"speed-btn" + (s === replaySpeed ? " active" : "")}
            onClick={() => setReplaySpeed(s)}
            aria-pressed={s === replaySpeed}
          >
            {s}x
          </button>
        ))}
      </div>

      {atEnd ? (
        <button className="replay-btn" onClick={restart}>
          Restart
        </button>
      ) : (
        <button
          className="replay-btn"
          onClick={() => setReplayRunning(!replayRunning)}
        >
          {replayRunning ? "Pause" : "Play"}
        </button>
      )}
    </div>
  );
}
