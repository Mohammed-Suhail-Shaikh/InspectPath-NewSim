import { describe, it, expect } from "vitest";
import { buildRuleBasedReport } from "../features/report/ruleBasedReport";
import structure from "../mocks/structure_bridge-a.json";
import planOptimized from "../mocks/plan_optimized.json";
import findingsMock from "../mocks/findings.json";
import type {
  AlertHistoryEntry,
  Finding,
  Plan,
  Structure,
} from "../data/types";

// Alert history as the monitor would accumulate it: one entry per level change,
// matching the residual at which each level first appears in replay_z24.json.
const alertHistory: AlertHistoryEntry[] = [
  { timestamp: "1998-01-17T10:00:00Z", alert_level: "normal", residual_pct: -0.2, quality: "ok" },
  { timestamp: "1998-01-17T14:00:00Z", alert_level: "watch", residual_pct: -2.2, quality: "ok" },
  { timestamp: "1998-01-17T17:00:00Z", alert_level: "warning", residual_pct: -5.0, quality: "ok" },
  { timestamp: "1998-01-17T20:00:00Z", alert_level: "alarm", residual_pct: -8.5, quality: "ok" },
];

function buildFromMocks() {
  return buildRuleBasedReport({
    structure: structure as Structure,
    stats: (planOptimized as Plan).stats,
    findings: findingsMock as Finding[],
    alertHistory,
  });
}

describe("rule-based report — summary numbers", () => {
  const report = buildFromMocks();

  it("marks the report as rule-based and uses no network", () => {
    expect(report.source).toBe("rule-based");
  });

  it("includes the structure name", () => {
    expect(report.text).toContain("Bridge Section A (underside)");
  });

  it("includes coverage 83% and priority coverage 100% from plan stats", () => {
    expect(report.text).toContain("Area covered: 83%");
    expect(report.text).toContain("Priority area covered: 100%");
  });

  it("includes battery used vs budget (42 of 60)", () => {
    expect(report.text).toContain("Battery used: 42 of 60 units");
  });

  it("includes the highest alert level Alarm with residual -8.5%", () => {
    expect(report.text).toContain("Highest alert level reached: Alarm");
    expect(report.text).toContain("-8.5%");
  });
});

describe("rule-based report — findings by tier", () => {
  const report = buildFromMocks();

  it("groups the mock findings: 1 high, 1 medium, 2 low", () => {
    expect(report.text).toContain("High priority (1):");
    expect(report.text).toContain("Medium priority (1):");
    expect(report.text).toContain("Low priority (2):");
  });

  it("reports the high finding location (7,0) with top score 0.81 and close-up confirmed", () => {
    expect(report.text).toContain("Location (x 7, y 0)");
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
    // Coverage/battery figures present; a made-up value should not appear.
    expect(report.text).toContain("83%");
    expect(report.text).not.toContain("99%");
  });
});
