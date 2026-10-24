import { useEffect, useState } from "react";
import { mockSource } from "../../data/mockSource";
import type { Plan, Structure } from "../../data/types";
import { useViewState } from "../../app/viewState";
import GridMap from "./GridMap";
import RobotMarker from "./RobotMarker";
import CoverageLayer from "./CoverageLayer";
import StatsPanel from "./StatsPanel";
import PlanToggle from "./PlanToggle";
import { useRobotRun } from "./useRobotRun";
import { cellCenter } from "./mapLayout";

export default function InspectionView() {
  const { setActiveView, selectedPlan } = useViewState();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    mockSource.getStructure("bridge-a").then((s) => {
      if (active) setStructure(s);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    mockSource.getPlan(selectedPlan).then((p) => {
      if (!active) return;
      setPlan(p);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [selectedPlan]);

  const robotIndex = useRobotRun(plan);

  if (loading && !structure) return <p className="placeholder">Loading inspection…</p>;
  if (!structure) return <p className="placeholder">No structure data available.</p>;

  const waypoints = plan?.waypoints ?? [];
  const robotWaypoint =
    waypoints.length > 0
      ? waypoints[Math.min(robotIndex, waypoints.length - 1)]
      : null;
  const pathPoints = waypoints
    .map((w) => {
      const { cx, cy } = cellCenter(w.x, w.y);
      return `${cx},${cy}`;
    })
    .join(" ");

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
          <GridMap structure={structure}>
            <CoverageLayer waypoints={waypoints} upToIndex={robotIndex} />
            {pathPoints && (
              <polyline
                points={pathPoints}
                fill="none"
                stroke="#5aa9ff"
                strokeWidth={1.5}
                strokeOpacity={0.45}
                strokeDasharray="4 3"
              />
            )}
            <RobotMarker waypoint={robotWaypoint} />
          </GridMap>
        </div>

        <aside className="inspection-side">
          <PlanToggle />
          {plan && <StatsPanel stats={plan.stats} />}
          {/* Findings (tasks 16-17) added next. */}
        </aside>
      </div>
    </div>
  );
}
