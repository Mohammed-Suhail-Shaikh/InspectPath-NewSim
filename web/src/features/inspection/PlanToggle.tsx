import { useViewState } from "../../app/viewState";
import type { PlanType } from "../../data/types";

const OPTIONS: { value: PlanType; label: string }[] = [
  { value: "naive", label: "Naive (lawnmower)" },
  { value: "optimized", label: "Optimized (priority-first)" },
];

// Switches the active plan. The map, robot path, coverage, and stats all
// re-derive from the selected plan via view state.
export default function PlanToggle() {
  const { selectedPlan, setSelectedPlan } = useViewState();

  return (
    <section className="plan-toggle">
      <h3 className="stats-title">Route plan</h3>
      <div className="plan-toggle-group" role="group" aria-label="Route plan">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            className={"plan-btn" + (o.value === selectedPlan ? " active" : "")}
            onClick={() => setSelectedPlan(o.value)}
            aria-pressed={o.value === selectedPlan}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
