import type {
  TriggerRecord,
  PlanType,
  ImageMap,
  Finding,
  InspectionReport,
  MetricStructure,
  MetricPlan,
} from "./types";

// The single seam between the dashboard and its data.
// Today only mockSource implements this; a realSource can be added later
// with no changes to the views.
export interface DataSource {
  // True when this source serves mock/sample data rather than real sensor data.
  // The UI uses this to avoid claiming real data in the monitor subtitle/footer.
  readonly isMock: boolean;
  getReplay(dataset: string): Promise<TriggerRecord[]>; // [contract §2]
  getMetricStructure(): Promise<MetricStructure>; // [contract §3b]
  getMetricPlan(type: PlanType): Promise<MetricPlan>; // [contract §4b]
  getImageMap(): Promise<ImageMap>; // [contract §5]
  getFindings(structureId: string): Promise<Finding[]>; // [dashboard-internal]
  getDemoReport(): Promise<InspectionReport>; // [dashboard-internal]
}
