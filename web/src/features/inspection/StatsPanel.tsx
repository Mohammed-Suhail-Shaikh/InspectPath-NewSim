import type { MetricPlanStats } from "../../data/types";

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

// Plain-language coverage, route length, and battery used vs budget. Every
// figure is labeled honestly: the route length is a straight-line estimate and
// the battery budget is a demonstration value.
export default function StatsPanel({
  stats,
  imagedCount,
}: {
  stats: MetricPlanStats;
  imagedCount: number;
}) {
  const batteryPctOfBudget =
    stats.battery_budget > 0
      ? Math.round((stats.battery_used / stats.battery_budget) * 100)
      : 0;

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
        {imagedCount} imaged for demonstration; the rest have no image and are
        not assessed.
      </p>

      <div className="stat">
        <span className="stat-label">Route length</span>
        <span className="stat-value">
          {stats.route_length_m} m
        </span>
      </div>
      <p className="stat-note muted">
        Straight-line 3D estimate; ignores obstacles like the deck and bracing.
      </p>

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
      <p className="stat-note muted">
        Battery budget is a demonstration value, not an engineering limit. Launch
        is from an assumed position off the south side.
      </p>
    </section>
  );
}
