import { describe, it, expect } from "vitest";
import { buildRuleBasedReport } from "../features/report/ruleBasedReport";
import structure from "../mocks/structure_kw51_sample.json";
import planOptimized from "../mocks/plan_kw51_optimized_sample.json";
import findingsMock from "../mocks/findings.json";
import type {
  AlertHistoryEntry,
  Finding,
  MetricPlan,
  MetricStructure,
} from "../data/types";

// Alert history as the monitor would accumulate it: one entry per level change.
const alertHistory: AlertHistoryEntry[] = [
  { timestamp: "2019-06-22T10:00:00Z", alert_level: "normal", residual_pct: -0.2, quality: "ok" },
  { timestamp: "2019-06-24T14:00:00Z", alert_level: "watch", residual_pct: -2.2, quality: "ok" },
  { timestamp: "2019-06-26T17:00:00Z", alert_level: "warning", residual_pct: -5.0, quality: "ok" },
  { timestamp: "2019-06-28T20:00:00Z", alert_level: "alarm", residual_pct: -8.5, quality: "ok" },
];

function buildFromMocks() {
  return buildRuleBasedReport({
    structure: structure as unknown as MetricStructure,
    stats: (planOptimized as unknown as MetricPlan).stats,
    findings: findingsMock as unknown as Finding[],
    alertHistory,
  });
}

describe("rule-based report — summary numbers", () => {
  const report = buildFromMocks();

  it("marks the report as rule-based and uses no network", () => {
    expect(report.source).toBe("rule-based");
  });

  it("includes the structure name", () => {
    expect(report.text).toContain(structure.name);
  });

  // Changed from grid "Area covered 83% / Priority area covered 100%" to the
  // metric stats (connections inspected + route length). Reason: the plan moved
  // from grid to metric and priority coverage was removed (contract §4b).
  // Changed "Connections inspected" -> "Connections visited" with an imaged
  // count. Reason (honesty fix 2): "inspected" implied all visited connections
  // were assessed; only the imaged ones are.
  it("reports connections visited plus how many were imaged, and route length", () => {
    expect(report.text).toContain(
      "Connections visited: 2 of 2 (100%); 4 imaged for demonstration, the rest have no image."
    );
    expect(report.text).toContain("Route length: 62.8 m");
    expect(report.text).not.toContain("Priority area covered");
    expect(report.text).not.toContain("Connections inspected:");
  });

  // Changed: the report no longer prints a battery line (battery_used just
  // mirrors route length at 1.0 energy/m, and "battery" implies hardware we do
  // not have). It now prints a findings tier summary instead. Reason: stats
  // cleanup — remove the meaningless/misleading battery figure from the report.
  it("includes the findings tier summary and no battery line", () => {
    expect(report.text).toContain(
      "Findings: 1 high, 1 medium, 2 low (4 imaged for demonstration)"
    );
    expect(report.text).not.toContain("Battery used");
    expect(report.text).not.toContain("battery");
  });

  it("includes the highest alert level Alarm with residual -8.5%", () => {
    expect(report.text).toContain("Highest alert level reached: Alarm");
    expect(report.text).toContain("-8.5%");
  });

  // Requirement 8 (global shift) plus honesty fix 2: the route visits all
  // connections, but only the imaged ones are assessed; the rest are not
  // cleared. Reason: the old wording "all connection locations were inspected"
  // implied the un-imaged connections were assessed.
  it("states the shift is global and that only imaged connections were assessed", () => {
    expect(report.text).toContain(
      "frequency shift is a global measurement and does not identify a location"
    );
    expect(report.text).toContain(
      "the rest were not imaged and are neither assessed nor cleared"
    );
    expect(report.text).not.toContain("so all connection locations were inspected");
  });
});

describe("rule-based report — findings by tier", () => {
  const report = buildFromMocks();

  it("groups the mock findings: 1 high, 1 medium, 2 low", () => {
    expect(report.text).toContain("High priority (1):");
    expect(report.text).toContain("Medium priority (1):");
    expect(report.text).toContain("Low priority (2):");
  });

  // Changed from grid "(x 7, y 0)" to the connection location id + side.
  // Reason: findings are positioned on real KW51 connections now.
  it("reports the high finding by connection id with top score 0.81 and close-up confirmed", () => {
    expect(report.text).toContain("Connection A-deck-105020 (side A)");
    expect(report.text).toContain("0.81");
    expect(report.text).toContain("spallation");
    expect(report.text).toContain("close-up confirmed");
  });

  it("reports a low finding with no close-up", () => {
    expect(report.text).toContain("no close-up");
  });

  it("lists detected defect types for the high finding", () => {
    expect(report.text).toMatch(/crack/);
    expect(report.text).toMatch(/exposed_bars|exposed bars/);
  });
});

describe("rule-based report — actions and limitations", () => {
  const report = buildFromMocks();

  it("recommends engineer review for high, follow-up for medium, log/monitor for low", () => {
    expect(report.text).toContain("High priority: Engineer review.");
    expect(report.text).toContain("Medium priority: Schedule a follow-up.");
    expect(report.text).toContain("Low priority: Log and monitor.");
  });

  it("includes the limitations (simulation, demo thresholds, AI estimates)", () => {
    expect(report.text).toContain("simulation");
    expect(report.text.toLowerCase()).toContain("demonstration values");
    expect(report.text).toContain("AI estimates");
  });

  it("explicitly states it does not judge whether the bridge is safe or unsafe", () => {
    expect(report.text).toContain(
      "does not state whether the bridge is safe or unsafe"
    );
  });
});

describe("rule-based report — no invented numbers", () => {
  it("only uses stat numbers that come from the data", () => {
    const report = buildFromMocks();
    expect(report.text).toContain("100%");
    expect(report.text).not.toContain("99%");
  });
});
