import { useEffect, useState } from "react";
import { mockSource } from "../../data/mockSource";
import type { Structure } from "../../data/types";
import { useViewState } from "../../app/viewState";
import GridMap from "./GridMap";

export default function InspectionView() {
  const { setActiveView } = useViewState();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    mockSource.getStructure("bridge-a").then((s) => {
      if (!active) return;
      setStructure(s);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="placeholder">Loading inspection…</p>;
  if (!structure) return <p className="placeholder">No structure data available.</p>;

  return (
    <div className="inspection">
      <div className="inspection-head">
        <div>
          <h2 className="view-title">Inspection</h2>
          <p className="muted">{structure.name}</p>
        </div>
        <button className="replay-btn" onClick={() => setActiveView("monitor")}>
          Back to monitor
        </button>
      </div>

      <div className="inspection-body">
        <div className="map-wrap">
          <GridMap structure={structure} />
        </div>
        {/* Robot (task 11), coverage (task 12), stats (task 13),
            plan toggle (task 14), findings (tasks 16-17) added next. */}
      </div>
    </div>
  );
}
