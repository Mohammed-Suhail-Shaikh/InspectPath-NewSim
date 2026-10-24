import Footer from "./components/Footer";
import DataWarningsBanner from "./components/DataWarningsBanner";
import MonitorView from "./features/monitor/MonitorView";
import InspectionView from "./features/inspection/InspectionView";
import { useViewState } from "./app/viewState";

export default function App() {
  const { activeView } = useViewState();

  return (
    <div className="app">
      <header className="app-header">
        <h1>InspectPath</h1>
      </header>

      <main className="app-main">
        <DataWarningsBanner />
        {activeView === "monitor" ? <MonitorView /> : <InspectionView />}
      </main>

      <Footer />
    </div>
  );
}
