import type { DataSource } from "./source";
import type {
  TriggerRecord,
  Structure,
  Plan,
  PlanType,
  ImageMap,
  Finding,
  InspectionReport,
} from "./types";

import replayZ24 from "../mocks/replay_z24.json";
import structureBridgeA from "../mocks/structure_bridge-a.json";
import planNaive from "../mocks/plan_naive.json";
import planOptimized from "../mocks/plan_optimized.json";
import imageMap from "../mocks/image_map.json";
import findings from "../mocks/findings.json";
import reportDemo from "../mocks/report_demo.json";

// Mock implementation of DataSource, backed by files in src/mocks/.
// Field names match docs/contract.md so the same files would validate
// against the real producers' output.
export const mockSource: DataSource = {
  async getReplay(dataset: string): Promise<TriggerRecord[]> {
    // Only one dataset shipped for the demo; dataset arg reserved for future sets.
    void dataset;
    return replayZ24 as TriggerRecord[];
  },

  async getStructure(id: string): Promise<Structure> {
    void id;
    return structureBridgeA as Structure;
  },

  async getPlan(type: PlanType): Promise<Plan> {
    return (type === "optimized" ? planOptimized : planNaive) as Plan;
  },

  async getImageMap(): Promise<ImageMap> {
    return imageMap as ImageMap;
  },

  async getFindings(structureId: string): Promise<Finding[]> {
    void structureId;
    return findings as Finding[];
  },

  async getDemoReport(): Promise<InspectionReport> {
    return reportDemo as InspectionReport;
  },
};
