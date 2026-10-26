import type { DataSource } from "./source";
import type {
  TriggerRecord,
  PlanType,
  ImageMap,
  Finding,
  InspectionReport,
  MetricStructure,
  MetricPlan,
} from "./types";

import replayZ24 from "../mocks/replay_z24.json";
import structureKw51Sample from "../mocks/structure_kw51_sample.json";
import planKw51NaiveSample from "../mocks/plan_kw51_naive_sample.json";
import planKw51OptimizedSample from "../mocks/plan_kw51_optimized_sample.json";
import imageMap from "../mocks/image_map.json";
import findings from "../mocks/findings.json";
import reportDemo from "../mocks/report_demo.json";

// Mock implementation of DataSource, backed by files in src/mocks/.
// Field names match docs/contract.md so the same files would validate
// against the real producers' output.
export const mockSource: DataSource = {
  isMock: true,

  async getReplay(dataset: string): Promise<TriggerRecord[]> {
    // Only one dataset shipped for the demo; dataset arg reserved for future sets.
    void dataset;
    return replayZ24 as TriggerRecord[];
  },

  async getMetricStructure(): Promise<MetricStructure> {
    return structureKw51Sample as unknown as MetricStructure;
  },

  async getMetricPlan(type: PlanType): Promise<MetricPlan> {
    return (type === "optimized"
      ? planKw51OptimizedSample
      : planKw51NaiveSample) as unknown as MetricPlan;
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
