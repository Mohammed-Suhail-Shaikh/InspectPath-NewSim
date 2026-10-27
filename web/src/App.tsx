import Footer from "./components/Footer";
import DataWarningsBanner from "./components/DataWarningsBanner";
import ViewErrorBoundary from "./components/ViewErrorBoundary";
import MonitorView from "./features/monitor/MonitorView";
import InspectionView from "./features/inspection/InspectionView";
import { useViewState } from "./app/viewState";

export default function App() {
  const { activeView, setReplayCursor, setReplayRunning, setAlertHistory } =
    useViewState();

  // Restart from the error boundary: reset the replay to the start so a bad
  // data state is left behind and the view can re-render cleanly.
  function restart() {
    setReplayCursor(0);
    setAlertHistory([]);
    setReplayRunning(true);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>InspectPath</h1>
      </header>

      <main className="app-main">
        <DataWarningsBanner />
        {/* key by view so switching views remounts the boundary (clears a
            stale error from the other view). */}
        <ViewErrorBoundary key={activeView} onRestart={restart}>
          {activeView === "monitor" ? <MonitorView /> : <InspectionView />}
        </ViewErrorBoundary>
      </main>

      <Footer />
    </div>
  );
}
