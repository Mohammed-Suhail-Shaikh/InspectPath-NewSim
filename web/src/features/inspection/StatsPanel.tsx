import type { PlanStats } from "../../data/types";

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

// Plain-language coverage, priority coverage, and battery used vs budget.
export default function StatsPanel({ stats }: { stats: PlanStats }) {
  const batteryPctOfBudget =
    stats.battery_budget > 0
      ? Math.round((stats.battery_used / stats.battery_budget) * 100)
      : 0;

  return (
    <section className="stats-panel">
      <h3 className="stats-title">Inspection stats</h3>

      <div className="stat">
        <span className="stat-label">Area covered</span>
        <span className="stat-value">{pct(stats.coverage_pct)}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Priority area covered</span>
        <span className="stat-value">{pct(stats.priority_coverage_pct)}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Battery used</span>
        <span className="stat-value">
          {stats.battery_used} / {stats.battery_budget}
          <span className="stat-sub"> ({batteryPctOfBudget}% of budget)</span>
        </span>
      </div>

      <div className="battery-bar" aria-hidden="true">
        <div
          className="battery-fill"
          style={{ width: `${Math.min(100, batteryPctOfBudget)}%` }}
        />
      </div>
    </section>
  );
}
