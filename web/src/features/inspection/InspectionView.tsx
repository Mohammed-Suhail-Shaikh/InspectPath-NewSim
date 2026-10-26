import { useEffect, useMemo, useState } from "react";
import { getDataSource, getInspectionData } from "../../data/activeSource";
import type {
  AlertLevel,
  Finding,
  ImageMap,
  MetricPlan,
  MetricStructure,
  PlanType,
} from "../../data/types";
import { useViewState } from "../../app/viewState";
import ElevationMap from "./ElevationMap";
import SideToggle from "./SideToggle";
import RobotMarker from "./RobotMarker";
import CoverageLayer from "./CoverageLayer";
import StatsPanel from "./StatsPanel";
import PlanToggle from "./PlanToggle";
import FindingPin from "./FindingPin";
import FindingDetail from "./FindingDetail";
import ImagedStrip from "./ImagedStrip";
import ReportPanel from "../report/ReportPanel";
import { useRobotRun } from "./useRobotRun";
import {
  ELEV_SCALE,
  SIDE_LABEL,
  elevationBounds,
  project,
} from "./elevationLayout";

const STRUCTURE_ID = "kw51";
const ALERT_RANK: Record<AlertLevel, number> = {
  normal: 0,
  watch: 1,
  warning: 2,
  alarm: 3,
};

export default function InspectionView() {
  const {
    setActiveView,
    selectedPlan,
    selectedSide,
    selectedFindingId,
    setSelectedFindingId,
    alertHistory,
  } = useViewState();

  const [structure, setStructure] = useState<MetricStructure | null>(null);
  const [plans, setPlans] = useState<Record<PlanType, MetricPlan> | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [imageMap, setImageMap] = useState<ImageMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const src = getDataSource();
    // One coherent bundle: structure + both plans, real or sample together.
    getInspectionData().then((d) => {
      if (!active) return;
      setStructure(d.structure);
      setPlans(d.plans);
      setIsSample(d.isSample);
      setLoading(false);
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

  const plan = plans?.[selectedPlan] ?? null;
  const planLengths: Partial<Record<PlanType, { route_length_m: number }>> = plans
    ? {
        naive: { route_length_m: plans.naive.stats.route_length_m },
        optimized: { route_length_m: plans.optimized.stats.route_length_m },
      }
    : {};

  const robotIndex = useRobotRun(plan);

  // Peak alert level reached this run, for the dispatch banner.
  const peakLevel = useMemo<AlertLevel>(() => {
    let top: AlertLevel = "normal";
    for (const e of alertHistory) {
      if (ALERT_RANK[e.alert_level] > ALERT_RANK[top]) top = e.alert_level;
    }
    return top;
  }, [alertHistory]);
  const dispatched = peakLevel === "warning" || peakLevel === "alarm";

  if (loading && !structure)
    return <p className="placeholder">Loading inspection…</p>;
  if (!structure)
    return <p className="placeholder">No structure data available.</p>;

  const usingSample = isSample;
  const bounds = elevationBounds(structure);
  const stopR = Math.max(4, ELEV_SCALE * 0.6);

  // Map location_id -> metric coords, for positioning robot, coverage, pins.
  const locById = new Map(
    structure.diagonal_connections.distinct_locations.map((l) => [
      l.location_id,
      l,
    ])
  );

  const planStops = plan?.stops ?? [];
  const currentStop =
    planStops.length > 0
      ? planStops[Math.min(robotIndex, planStops.length - 1)]
      : null;

  // Robot: show only when its current stop is on the displayed side.
  let robotPt: { cx: number; cy: number } | null = null;
  if (currentStop) {
    const loc = locById.get(currentStop.location_id);
    if (loc && loc.side === selectedSide) {
      const { px, py } = project(loc.x, loc.z, bounds);
      robotPt = { cx: px, cy: py };
    }
  }
  const nextStop =
    planStops.length > 0 && robotIndex + 1 < planStops.length
      ? planStops[robotIndex + 1]
      : null;
  const routeCrossesSides =
    nextStop && locById.get(nextStop.location_id)?.side !== selectedSide;

  // Coverage: visited stops (up to robot index) that are on the displayed side.
  const coveragePts: { cx: number; cy: number }[] = [];
  for (let i = 0; i <= Math.min(robotIndex, planStops.length - 1); i++) {
    const loc = locById.get(planStops[i].location_id);
    if (loc && loc.side === selectedSide) {
      const { px, py } = project(loc.x, loc.z, bounds);
      coveragePts.push({ cx: px, cy: py });
    }
  }

  // Finding pins on the displayed side, positioned at their connection stop.
  const sideFindings = findings.filter((f) => f.side === selectedSide);

  // Whether any finding carries real model scores (vs. all mock). Drives the
  // honest caption wording about where the defect scores/images come from.
  const anyRealScores = findings.some((f) => f.defect_source === "predict");

  const selectedFinding =
    findings.find((f) => f.id === selectedFindingId) ?? null;

  const hasRealCredit =
    !usingSample &&
    structure.provenance.doi &&
    structure.provenance.doi !== "n/a";
  const credit = hasRealCredit
    ? `${structure.provenance.source} — ${structure.provenance.license} (${structure.provenance.doi})`
    : null;

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

      {dispatched && (
        <div className="dispatch-banner" role="status">
          Frequency shift detected. Location unknown: inspecting all connection
          locations.
        </div>
      )}

      {usingSample && (
        <div className="sample-banner" role="status">
          Showing sample geometry, not the real KW51 bridge. The KW51 layout file
          could not be loaded.
        </div>
      )}

      <div className="inspection-body">
        <div className="map-wrap">
          <div className="map-side-head">
            <SideToggle />
            <span className="muted side-caption">{SIDE_LABEL[selectedSide]}</span>
          </div>

          <ElevationMap structure={structure} plan={plan} side={selectedSide}>
            <CoverageLayer points={coveragePts} r={stopR * 0.8} />
            {robotPt && (
              <RobotMarker cx={robotPt.cx} cy={robotPt.cy} r={stopR} />
            )}
            {sideFindings.map((f) => {
              const loc = locById.get(f.location_id);
              if (!loc) return null;
              const { px, py } = project(loc.x, loc.z, bounds);
              return (
                <FindingPin
                  key={f.id}
                  finding={f}
                  cx={px}
                  cy={py}
                  r={stopR}
                  selected={f.id === selectedFindingId}
                  onSelect={setSelectedFindingId}
                />
              );
            })}
          </ElevationMap>

          {routeCrossesSides && (
            <p className="muted route-note">
              The route continues on side {selectedSide === "A" ? "C" : "A"}.
            </p>
          )}

          <ul className="map-legend" aria-label="Map legend">
            <li>
              <span className="legend-swatch legend-stop" aria-hidden="true" />
              Connection stop
            </li>
            <li>
              <span className="legend-swatch legend-sensor" aria-hidden="true" />
              Sensor (S strain, A acceleration, D displacement)
            </li>
            <li>
              <span className="legend-swatch legend-covered" aria-hidden="true" />
              Visited
            </li>
          </ul>

          <p className="map-caption muted">
            {usingSample
              ? "Geometry: sample placeholder, not the real KW51 bridge (the KW51 layout could not be loaded). Defect findings and images: simulated."
              : anyRealScores
              ? "Geometry: real KW51 (KU Leuven FEM, CC BY-NC-SA 4.0). Defect scores: real model on representative concrete images from the CODEBRIM held-out test set, not photographs of KW51. Defect images are placed at chosen connections for demonstration; their locations are not detections."
              : "Geometry: real KW51 (KU Leuven FEM, CC BY-NC-SA 4.0). Defect findings and images: simulated."}
          </p>
          {credit && <p className="map-credit muted">{credit}</p>}
        </div>

        <aside className="inspection-side">
          <PlanToggle lengths={planLengths} />
          {plan && <StatsPanel stats={plan.stats} findings={findings} />}
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

      <ImagedStrip
        findings={findings}
        imageMap={imageMap}
        structureId={STRUCTURE_ID}
        selectedFindingId={selectedFindingId}
        onSelect={setSelectedFindingId}
      />

      <ReportPanel />
    </div>
  );
}
