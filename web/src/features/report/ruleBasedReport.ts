import type {
  AlertHistoryEntry,
  AlertLevel,
  DefectScores,
  DefectTier,
  Finding,
  InspectionReport,
  PlanStats,
  Structure,
} from "../../data/types";

export interface RuleBasedReportInput {
  structure: Structure;
  stats: PlanStats;
  findings: Finding[];
  alertHistory: AlertHistoryEntry[];
}

const CLASS_LABELS: Record<keyof DefectScores, string> = {
  crack: "crack",
  spallation: "spallation",
  exposed_bars: "exposed bars",
  efflorescence: "efflorescence",
  corrosion_stain: "corrosion stain",
};

const ALERT_RANK: Record<AlertLevel, number> = {
  normal: 0,
  watch: 1,
  warning: 2,
  alarm: 3,
};

const ALERT_LABEL: Record<AlertLevel, string> = {
  normal: "Normal",
  watch: "Watch",
  warning: "Warning",
  alarm: "Alarm",
};

const TIER_ORDER: Exclude<DefectTier, "none">[] = ["high", "medium", "low"];

const TIER_HEADING: Record<Exclude<DefectTier, "none">, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

const TIER_ACTION: Record<Exclude<DefectTier, "none">, string> = {
  high: "Engineer review.",
  medium: "Schedule a follow-up.",
  low: "Log and monitor.",
};

function pct(v: number): string {
  // v is a 0..1 fraction from the contract stats.
  return `${Math.round(v * 100)}%`;
}

// Highest defect score for a finding, with its class label.
function topScore(finding: Finding): { label: string; value: number } {
  let bestClass: keyof DefectScores = "crack";
  let best = -Infinity;
  (Object.keys(finding.scores) as (keyof DefectScores)[]).forEach((k) => {
    const v = finding.scores[k];
    if (v > best) {
      best = v;
      bestClass = k;
    }
  });
  return { label: CLASS_LABELS[bestClass], value: best };
}

// Highest alert level reached across the history, with the residual % from
// the entry where that level was first recorded. Returns null if no history.
function highestAlert(
  history: AlertHistoryEntry[]
): { level: AlertLevel; residual_pct: number } | null {
  let top: AlertHistoryEntry | null = null;
  for (const entry of history) {
    if (!top || ALERT_RANK[entry.alert_level] > ALERT_RANK[top.alert_level]) {
      top = entry;
    }
  }
  return top ? { level: top.alert_level, residual_pct: top.residual_pct } : null;
}

// Builds a deterministic, plain-language report directly from the data.
// Uses only values present in the input; never invents numbers.
export function buildRuleBasedReport(
  input: RuleBasedReportInput
): InspectionReport {
  const { structure, stats, findings, alertHistory } = input;
  const lines: string[] = [];

  // 1. Summary
  lines.push(`Inspection report — ${structure.name}`);
  lines.push("");
  lines.push("Summary");
  lines.push(`- Area covered: ${pct(stats.coverage_pct)}`);
  lines.push(`- Priority area covered: ${pct(stats.priority_coverage_pct)}`);
  lines.push(
    `- Battery used: ${stats.battery_used} of ${stats.battery_budget} units`
  );

  const peak = highestAlert(alertHistory);
  if (peak) {
    lines.push(
      `- Highest alert level reached: ${ALERT_LABEL[peak.level]} ` +
        `(difference from expected frequency: ${peak.residual_pct.toFixed(1)}%)`
    );
  } else {
    lines.push("- Highest alert level reached: none recorded");
  }

  // 2. Findings grouped by tier
  lines.push("");
  lines.push("Findings by priority");
  let anyFindings = false;
  for (const tier of TIER_ORDER) {
    const group = findings.filter((f) => f.tier === tier);
    if (group.length === 0) continue;
    anyFindings = true;
    lines.push("");
    lines.push(`${TIER_HEADING[tier]} (${group.length}):`);
    for (const f of group) {
      const detected =
        f.detected.length > 0 ? f.detected.join(", ") : "none above threshold";
      const top = topScore(f);
      const closeup = f.has_closeup
        ? "close-up confirmed"
        : "no close-up";
      lines.push(
        `- Location (x ${f.x}, y ${f.y}): ${detected}; ` +
          `top score ${top.value.toFixed(2)} (${top.label}); ${closeup}.`
      );
    }
  }
  if (!anyFindings) {
    lines.push("");
    lines.push("- No findings to report.");
  }

  // 3. Recommended actions by tier (only tiers that have findings)
  lines.push("");
  lines.push("Recommended actions");
  const tiersPresent = TIER_ORDER.filter((t) =>
    findings.some((f) => f.tier === t)
  );
  if (tiersPresent.length === 0) {
    lines.push("- No actions required.");
  } else {
    for (const tier of tiersPresent) {
      lines.push(`- ${TIER_HEADING[tier]}: ${TIER_ACTION[tier]}`);
    }
  }

  // 4. Limitations
  lines.push("");
  lines.push("Limitations");
  lines.push(
    "- This is a simulation using real bridge data. The alert thresholds and " +
      "priority tiers are demonstration values, not engineering limits."
  );
  lines.push(
    "- Defect tiers and scores are AI estimates to help prioritize, not " +
      "engineering ratings. This report does not state whether the bridge is " +
      "safe or unsafe; a qualified engineer should make any safety determination."
  );

  return {
    text: lines.join("\n"),
    generatedAt: new Date().toISOString(),
    source: "rule-based",
  };
}
