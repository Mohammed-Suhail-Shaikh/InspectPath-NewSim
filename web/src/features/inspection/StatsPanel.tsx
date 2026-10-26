import type { Finding, MetricPlanStats } from "../../data/types";
import { findingsSummaryText } from "../../data/tiers";

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

// Plain-language connection coverage, a tier breakdown of the imaged findings,
// and the route length. No battery figure: battery_used equals route length at
// 1.0 energy/metre and "battery" implies drone hardware this demo does not have
// (the planner keeps the fields for future multi-flight planning; they are not
// shown). Every figure is labeled honestly.
export default function StatsPanel({
  stats,
  findings,
}: {
  stats: MetricPlanStats;
  findings: Finding[];
}) {
  return (
    <section className="stats-panel">
      <h3 className="stats-title">Inspection stats</h3>

      <div className="stat">
        <span className="stat-label">Connections visited</span>
        <span className="stat-value">
          {stats.locations_visited} / {stats.locations_total}
          <span className="stat-sub"> ({pct(stats.coverage_pct)})</span>
        </span>
      </div>
      <p className="stat-note muted">
        {findings.length} imaged for demonstration; the rest have no image and
        are not assessed.
      </p>

      <div className="stat">
        <span className="stat-label">Findings</span>
        <span className="stat-value">{findingsSummaryText(findings)}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Route length</span>
        <span className="stat-value">{stats.route_length_m} m</span>
      </div>
      <p className="stat-note muted">
        Straight-line 3D estimate; ignores obstacles like the deck and bracing.
        Measured from an assumed launch position off the south side.
      </p>
    </section>
  );
}
