import { useEffect, useState } from "react";
import { getDataSource } from "../../data/activeSource";
import type { Finding, ImageMap, Plan, Structure } from "../../data/types";
import { useViewState } from "../../app/viewState";
import GridMap from "./GridMap";
import RobotMarker from "./RobotMarker";
import CoverageLayer from "./CoverageLayer";
import StatsPanel from "./StatsPanel";
import PlanToggle from "./PlanToggle";
import FindingPin from "./FindingPin";
import FindingDetail from "./FindingDetail";
import ReportPanel from "../report/ReportPanel";
import { useRobotRun } from "./useRobotRun";
import { cellCenter } from "./mapLayout";

const STRUCTURE_ID = "bridge-a";

export default function InspectionView() {
  const { setActiveView, selectedPlan, selectedFindingId, setSelectedFindingId } =
    useViewState();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [imageMap, setImageMap] = useState<ImageMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const src = getDataSource();
    src.getStructure(STRUCTURE_ID).then((s) => {
      if (active) setStructure(s);
    });
    src.getFindings(STRUCTURE_ID).then((f) => {
      if (active) setFindings(f);
    });
    src.getImageMap().then((m) => {
      if (active) setImageMap(m);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDataSource().getPlan(selectedPlan).then((p) => {
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

  const selectedFinding =
    findings.find((f) => f.id === selectedFindingId) ?? null;

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
                stroke="var(--route)"
                strokeWidth={1.5}
                strokeOpacity={0.55}
                strokeDasharray="4 3"
              />
            )}
            <RobotMarker waypoint={robotWaypoint} />
            {findings.map((f) => (
              <FindingPin
                key={f.id}
                finding={f}
                selected={f.id === selectedFindingId}
                onSelect={setSelectedFindingId}
              />
            ))}
          </GridMap>

          <ul className="map-legend" aria-label="Map legend">
            <li>
              <span className="legend-swatch legend-priority" aria-hidden="true" />
              Priority zone
            </li>
            <li>
              <span className="legend-swatch legend-obstacle" aria-hidden="true" />
              Obstacle
            </li>
            <li>
              <span className="legend-swatch legend-covered" aria-hidden="true" />
              Covered
            </li>
            <li>
              <span className="legend-swatch legend-alert-zone" aria-hidden="true" />
              Alert zone
            </li>
          </ul>
        </div>

        <aside className="inspection-side">
          <PlanToggle />
          {plan && <StatsPanel stats={plan.stats} />}
          {selectedFinding && (
            <FindingDetail
              finding={selectedFinding}
              imageMap={imageMap}
              structureId={STRUCTURE_ID}
              onClose={() => setSelectedFindingId(null)}
            />
          )}
        </aside>
      </div>

      <ReportPanel />
    </div>
  );
}
