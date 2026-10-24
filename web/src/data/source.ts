import type {
  TriggerRecord,
  Structure,
  Plan,
  PlanType,
  ImageMap,
  Finding,
  InspectionReport,
} from "./types";

// The single seam between the dashboard and its data.
// Today only mockSource implements this; a realSource can be added later
// with no changes to the views.
export interface DataSource {
  getReplay(dataset: string): Promise<TriggerRecord[]>; // [contract §2]
  getStructure(id: string): Promise<Structure>; // [contract §3]
  getPlan(type: PlanType): Promise<Plan>; // [contract §4]
  getImageMap(): Promise<ImageMap>; // [contract §5]
  getFindings(structureId: string): Promise<Finding[]>; // [dashboard-internal]
  getDemoReport(): Promise<InspectionReport>; // [dashboard-internal]
}
