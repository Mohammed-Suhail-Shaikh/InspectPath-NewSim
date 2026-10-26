import { useViewState } from "../../app/viewState";
import type { PlanType } from "../../data/types";

const OPTIONS: { value: PlanType; label: string }[] = [
  { value: "naive", label: "Manual sweep (per level)" },
  { value: "optimized", label: "Planned route (nearest-neighbor + 2-opt)" },
];

// Switches the active plan. The map, robot path, coverage, and stats all
// re-derive from the selected plan via view state. Shows each plan's route
// length and battery used (passed in) so the honest comparison is visible, and
// a plain-language note on when planning actually helps.
export default function PlanToggle({
  lengths,
}: {
  lengths?: Partial<Record<PlanType, { route_length_m: number; battery_used: number }>>;
}) {
  const { selectedPlan, setSelectedPlan } = useViewState();

  return (
    <section className="plan-toggle">
      <h3 className="stats-title">Route plan</h3>
      <div className="plan-toggle-group" role="group" aria-label="Route plan">
        {OPTIONS.map((o) => {
          const l = lengths?.[o.value];
          return (
            <button
              key={o.value}
              className={"plan-btn" + (o.value === selectedPlan ? " active" : "")}
              onClick={() => setSelectedPlan(o.value)}
              aria-pressed={o.value === selectedPlan}
            >
              <span className="plan-btn-label">{o.label}</span>
              {l && (
                <span className="plan-btn-sub">
                  {l.route_length_m} m · {l.battery_used} battery
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="stat-note muted">
        On KW51, a sensible manual sweep is within about 1.5% of the planned
        route. Planning matters more for partial inspections or multi-flight
        missions.
      </p>
    </section>
  );
}
