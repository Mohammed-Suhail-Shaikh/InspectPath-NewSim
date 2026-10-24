import Footer from "./components/Footer";
import MonitorView from "./features/monitor/MonitorView";
import { useViewState } from "./app/viewState";

export default function App() {
  const { activeView } = useViewState();

  return (
    <div className="app">
      <header className="app-header">
        <h1>InspectPath</h1>
      </header>

      <main className="app-main">
        {activeView === "monitor" ? (
          <MonitorView />
        ) : (
          <p className="placeholder">Inspection view coming in task 10.</p>
        )}
      </main>

      <Footer />
    </div>
  );
}
